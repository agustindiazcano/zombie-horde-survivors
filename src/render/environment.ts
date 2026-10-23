import * as THREE from 'three';
import { defaultEnvironment, type Environment } from '../sim';
import { groundFx } from './groundLook';
import { installHeightFog } from './heightFog';
import { makeRainStreaks, rainFxUniforms } from './rainFx';
import { installSnowLayer, snowFx } from './snowLayer';

/** The lighting of a normal day (the game's look before the environment existed) and of the dark mode. */
const DAY_AMBIENT = 1.2;
const DAY_SUN = 2.2;
const DAY_BACKGROUND = 0x14171c;
const NIGHT_AMBIENT = 0.75;
const NIGHT_SUN = 1.1;
/** With `nightLight` at 0 the night keeps only this much ambient and moon light. */
const DARK_AMBIENT = 0.1;
const DARK_SUN = 0.08;
const NIGHT_BACKGROUND = 0x10141a;

const SKY_RADIUS = 450;
const CLOUD_COUNT = 24;
const CLOUD_RANGE = 700;
const CLOUD_HEIGHT = 80;
const CLOUD_SPEED = 2.5;
const RAIN_COUNT = 2500;
const SNOW_COUNT = 6000;
const SAND_COUNT = 6000;
/** Weather particles live in a box around the camera: half its width and its height (m). */
const BOX_HALF = 30;
const BOX_HEIGHT = 30;
const RAIN_SPEED = 38;
const SNOW_SPEED = 1.6;
const SAND_SPEED = 14;

const c = (hex: number) => new THREE.Color(hex);
const mix = (a: THREE.Color, b: THREE.Color, t: number) =>
  a.clone().lerp(b, Math.min(Math.max(t, 0), 1));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const wrap = (v: number, range: number) =>
  ((((v + range / 2) % range) + range) % range) - range / 2;

interface Particles {
  object: THREE.LineSegments | THREE.Points;
  position: Float32Array;
  /** Each particle's place inside the box (x, y, z), in metres from the box corner. */
  seed: Float32Array;
  count: number;
}

/**
 * The sky and weather of a map: a gradient dome with a sun, a moon and drifting clouds, the light
 * colour and angle that follow the time of day, and rain, snow, sand and fog. It owns the scene's
 * sun and ambient light while it is in use (the game renderer hands them over).
 */
export class EnvironmentView {
  private env: Environment = defaultEnvironment();
  private dark = false;
  private night = false;
  private dim = 1;

  private readonly dome: THREE.Mesh;
  private readonly domeTop = { value: c(0x3f7fd0) };
  private readonly domeHorizon = { value: c(0x9cc8ee) };
  /** Below the horizon the dome shows the plain dark ground colour the game always had. */
  private readonly domeBelow = { value: c(DAY_BACKGROUND) };
  /** The sky shader's uniforms: where the sun is and how much of sun, moon and stars shows. */
  private readonly skyUniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: c(0xfff3c4) },
    uSun: { value: 1 },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uGlow: { value: 1 },
    uTime: { value: 0 },
    uWind: { value: 1 },
    uDay: { value: 1 },
    uTwilight: { value: 0 },
    uGrey: { value: 0 },
    uCloudCover: { value: 0 },
    uCloudDensity: { value: 1.2 },
    uCloudSteps: { value: 0 },
    uFlash: { value: 0 },
  };
  /** Octaves of the volumetric clouds (the graphics option): 0 draws the puff clouds instead. */
  private cloudSteps = 0;
  private hemiBase = 0;
  private sunBase = 0;
  private nextStrike = 4;
  private strikeAt = -10;
  private readonly bolt = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0xd6e6ff,
      transparent: true,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  /** The hour the lights were last computed for (the clock may run by itself). */
  private hourShown = 12;
  /** Camera exposure for the filmic tone mapping: a little more at night so the dark stays readable. */
  exposure = 1.05;
  private readonly clouds: { group: THREE.Group; base: THREE.Vector3 }[] = [];
  private readonly cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
  });
  private readonly rain: Particles;
  /** Rain streaks and ring ripples on the ground and water (a graphics option) instead of line drops. */
  private readonly streaks = makeRainStreaks();
  private rainFx = false;
  private readonly snow: Particles;
  private readonly sand: Particles;
  private sunDir = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
  ) {
    installHeightFog();
    installSnowLayer();
    // Height fog: `near` is the density and `far` the falloff (see heightFog.ts).
    this.scene.fog = new THREE.Fog(0x9cc8ee, 0, 0.055);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: this.domeTop,
          horizon: this.domeHorizon,
          below: this.domeBelow,
          ...this.skyUniforms,
        },
        vertexShader: `varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        // The sky of the water lab: a gradient steeper at the horizon, a sun with a disc and two
        // halos, a moon with its own halo, and a grid of twinkling stars.
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 below;
          uniform vec3 uSunDir; uniform vec3 uSunColor;
          uniform float uSun; uniform float uMoon; uniform float uStars; uniform float uGlow; uniform float uTime;
          uniform float uWind; uniform float uDay; uniform float uTwilight; uniform float uGrey;
          uniform float uCloudCover; uniform float uCloudDensity; uniform int uCloudSteps; uniform float uFlash;
          varying vec3 vDir;
          const mat2 mGold = mat2(-0.7373688, -0.6754903, 0.6754903, -0.7373688);
          float vHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(vHash(i), vHash(i + vec2(1.0, 0.0)), u.x), mix(vHash(i + vec2(0.0, 1.0)), vHash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          // Fractal noise whose octaves turn by the golden angle and grow by phi, so no grid shows.
          float cloudFbm(vec2 p, int octaves) {
            float a = 0.5, s = 0.0, total = 0.0;
            for (int i = 0; i < 6; i++) {
              if (i >= octaves) break;
              s += a * vNoise(p);
              total += a;
              p = mGold * p * 1.618 + vec2(3.1, 1.7);
              a *= 0.5;
            }
            return s / total;
          }
          float phase(float cosT, float g) {
            float g2 = g * g;
            return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
          }
          float goldHash(vec3 p) {
            p = fract(p * 0.6180339887);
            p += dot(p, p.yxz + 19.19);
            return fract((p.x + p.y) * p.z);
          }
          void main() {
            vec3 dir = normalize(vDir);
            float h = dir.y;
            vec3 col = mix(top, horizon, pow(1.0 - clamp(h, 0.0, 1.0), 2.5));

            float sunCos = max(dot(dir, uSunDir), 0.0);
            float sunDisk = smoothstep(0.9972, 0.9988, sunCos);
            float sunGlow = (pow(sunCos, 6.0) * 0.28 + pow(sunCos, 48.0) * 0.8 + pow(sunCos, 600.0) * 3.0 + pow(sunCos, 4.0) * 0.45 * uTwilight) * uGlow;
            // Past 1.0 on purpose: the disc burns out to white and the halo washes the sky near it.
            col += uSunColor * (sunDisk * 9.0 + sunGlow) * uSun;
            col = mix(col, vec3(1.0), clamp(sunDisk * uSun, 0.0, 1.0) * 0.85);

            float moonCos = max(dot(dir, -uSunDir), 0.0);
            float moonDisk = smoothstep(0.9988, 0.9994, moonCos);
            float moonGlow = pow(moonCos, 24.0) * 0.35 * uGlow;
            col += vec3(0.65, 0.82, 1.0) * (moonDisk * 2.5 + moonGlow) * uMoon;

            if (uStars > 0.01 && h > 0.0) {
              float s = goldHash(floor(dir * 260.0));
              if (s > 0.994) {
                float twinkle = 0.5 + 0.5 * sin(uTime * 3.0 + s * 100.0);
                col += vec3(0.8, 0.9, 1.0) * twinkle * uStars * smoothstep(0.0, 0.25, h);
              }
            }
            col += vec3(0.65, 0.78, 1.0) * uFlash * (0.3 + 0.7 * pow(1.0 - clamp(h, 0.0, 1.0), 3.0));

            // Volumetric clouds: a noise layer lit from the sun (or the moon), with a bright rim
            // facing the light and a shadow side.
            if (uCloudSteps > 0 && h > 0.01 && uCloudCover > 0.01) {
              vec3 at = cameraPosition + dir * (180.0 / (h + 0.14));
              vec2 wind = vec2(uTime * 0.77, uTime * 0.32) * uWind;
              vec2 uv = at.xz * 0.0095 + wind;
              float n = mix(cloudFbm(uv, uCloudSteps), cloudFbm(uv * 2.5 - wind * 0.6, max(2, uCloudSteps - 1)), 0.34);
              float thresh = 1.0 - uCloudCover;
              float raw = smoothstep(thresh, thresh + 0.32, n);
              if (raw > 0.002) {
                float density = raw * uCloudDensity;
                vec3 light = uSunDir.y > -0.08 ? uSunDir : -uSunDir;
                float toward = smoothstep(thresh, thresh + 0.32, cloudFbm(uv + light.xz * 0.18, max(2, uCloudSteps - 1))) * uCloudDensity;
                float beer = exp(-toward * 1.35);
                float powder = 1.0 - exp(-density * 2.4);
                float lit = mix(beer, beer * (0.45 + 0.9 * powder), 0.75);
                float rim = exp(-density * 1.55) * phase(dot(dir, light), 0.68) * 1.85;
                vec3 litCol = mix(vec3(0.15, 0.21, 0.34), vec3(1.0, 0.99, 0.97), uDay);
                litCol = mix(litCol, vec3(1.0, 0.45, 0.16), uTwilight);
                vec3 shadeCol = mix(vec3(0.025, 0.045, 0.085), vec3(0.40, 0.50, 0.64), uDay);
                shadeCol = mix(shadeCol, vec3(0.22, 0.16, 0.32), uTwilight);
                // Storm clouds turn grey and dark.
                litCol = mix(litCol, vec3(0.42, 0.45, 0.5) * (0.35 + 0.65 * uDay), uGrey);
                shadeCol = mix(shadeCol, vec3(0.1, 0.11, 0.14) * (0.4 + 0.6 * uDay), uGrey);
                vec3 cloud = mix(shadeCol, litCol, clamp(lit + rim * 0.4, 0.0, 1.0)) + litCol * rim * 0.55;
                cloud += vec3(0.7, 0.85, 1.0) * uFlash * (1.0 - raw * 0.5);
                col = mix(col, cloud, clamp(raw * 1.15, 0.0, 0.96) * smoothstep(0.01, 0.18, h));
              }
            }
            col = mix(col, below, smoothstep(0.0, -0.12, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);

    const puff = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const group = new THREE.Group();
      const parts = 3 + (i % 3);
      for (let k = 0; k < parts; k++) {
        const m = new THREE.Mesh(puff, this.cloudMaterial);
        m.scale.set(10 + ((i * 7 + k * 5) % 13), 4 + ((i + k) % 3), 8 + ((i * 3 + k * 4) % 9));
        m.position.set((k - parts / 2) * 11, ((k * 3) % 4) - 1, ((i + k * 2) % 5) * 3 - 6);
        group.add(m);
      }
      group.frustumCulled = false;
      this.scene.add(group);
      // A fixed pseudo-random scatter, so the same map always has the same sky.
      const base = new THREE.Vector3(
        wrap(i * 173.3, CLOUD_RANGE),
        CLOUD_HEIGHT + ((i * 11) % 30) - 10,
        wrap(i * 311.7 + 90, CLOUD_RANGE),
      );
      this.clouds.push({ group, base });
    }

    this.scene.add(this.streaks);
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);
    this.rain = this.makeRain();
    this.snow = this.makePoints(SNOW_COUNT, 0xffffff, 0.2, 0.9);
    this.sand = this.makePoints(SAND_COUNT, 0xd9b26f, 0.16, 0.8);
    this.apply();
  }

  private clock = 0;
  /** Snow settled so far (0 to 1): grows while it snows, melts slowly when it does not. */
  private settled = 0;
  private lastClock = 0;

  /** Lightning: now and then a bolt strikes, the sky and the light flash twice, then fade. */
  private storm(camera: THREE.Vector3, clock: number): void {
    const strength = this.env.lightning;
    if (strength > 0 && this.env.sky && clock >= this.nextStrike) {
      this.strikeAt = clock;
      // Stronger storms strike more often (every 4 to 15 s at full strength, much rarer at a trace).
      this.nextStrike = clock + (4 + Math.random() * 11) / Math.max(strength, 0.05);
      this.buildBolt(camera);
    }
    const t = clock - this.strikeAt;
    // Two pulses: a hard flash, a short dip, then a softer second one.
    const second = t > 0.16 ? 0.7 * Math.exp(-(t - 0.16) * 7) : 0;
    const flash = t < 0 || t > 1.4 ? 0 : Math.max(Math.exp(-t * 9), second);
    const power = flash * Math.max(strength, 0.4);
    this.skyUniforms.uFlash.value = power;
    this.bolt.visible = t >= 0 && t < 0.3 && flash > 0.15;
    this.hemi.intensity = this.hemiBase + power * 1.8;
    this.sun.intensity = this.sunBase + power * 1.2;
  }

  /** A jagged bolt from the clouds to the ground at a random spot some way off, with branches. */
  private buildBolt(camera: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 130;
    let x = camera.x + Math.cos(angle) * dist;
    let z = camera.z + Math.sin(angle) * dist;
    let y = 110;
    const points: number[] = [];
    const path: THREE.Vector3[] = [];
    while (y > -5) {
      path.push(new THREE.Vector3(x, y, z));
      y -= 6 + Math.random() * 6;
      x += (Math.random() - 0.5) * 10;
      z += (Math.random() - 0.5) * 10;
    }
    path.push(new THREE.Vector3(x, -5, z));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
      // A branch forks off some of the joints and ends in the air.
      if (i > 3 && Math.random() < 0.22) {
        let bx = b.x;
        let by = b.y;
        let bz = b.z;
        for (let k = 0; k < 3; k++) {
          const nx = bx + (Math.random() - 0.3) * 14;
          const ny = by - 5 - Math.random() * 6;
          const nz = bz + (Math.random() - 0.5) * 14;
          points.push(bx, by, bz, nx, ny, nz);
          bx = nx;
          by = ny;
          bz = nz;
        }
      }
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry();
    this.bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  }

  /** The hour of the day now: the map's `timeOfDay`, moved on by `dayCycle` hours per real minute. */
  private get hourNow(): number {
    const { timeOfDay, dayCycle } = this.env;
    return (timeOfDay + (this.clock * dayCycle) / 60) % 24;
  }

  /** The unit direction from the world to the sun (below the horizon at night). */
  get sunDirection(): THREE.Vector3 {
    return this.sunDir;
  }

  /** True while the light is moonlight: the game turns the flashlights on. */
  get isNight(): boolean {
    return this.dark || this.night;
  }

  set(env: Environment): void {
    this.env = env;
    this.apply();
  }

  /** Scales the sun and sky light (1 = as set): a blackout leaves only a little moonlight. */
  setDim(dim: number): void {
    if (dim === this.dim) return;
    this.dim = dim;
    this.apply();
  }

  /** The volumetric clouds option: octaves of the cloud noise, 0 draws the simple puff clouds. */
  setCloudSteps(steps: number): void {
    if (steps === this.cloudSteps) return;
    this.cloudSteps = steps;
    this.apply();
  }

  /** How hard it rains now, 0 to 1 (the map's weather). */
  get rainAmount(): number {
    return this.env.rain;
  }

  /** The rain effects option: streaks around the camera plus ripples on the ground and the sea. */
  setRainFx(on: boolean): void {
    if (on === this.rainFx) return;
    this.rainFx = on;
    this.apply();
  }

  /** The dark mode (key L) forces night lighting whatever the time of day is. */
  setDark(dark: boolean): void {
    this.dark = dark;
    this.apply();
  }

  private makeRain(): Particles {
    const seed = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const position = new Float32Array(RAIN_COUNT * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    const object = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.4 }),
    );
    object.frustumCulled = false;
    object.visible = false;
    this.scene.add(object);
    return { object, position, seed, count: 0 };
  }

  private makePoints(n: number, color: number, size: number, opacity: number): Particles {
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const position = new Float32Array(n * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    const object = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }),
    );
    object.frustumCulled = false;
    object.visible = false;
    this.scene.add(object);
    return { object, position, seed, count: 0 };
  }

  /** Recomputes lights, sky colours, fog and what is visible from the environment and the dark mode. */
  private apply(): void {
    const env = this.env;
    const hour = this.dark ? 0 : this.hourNow;
    this.hourShown = hour;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const day = this.dark ? 0 : smooth(-0.1, 0.35, elevation);
    const twilight = this.dark ? 0 : Math.max(0, 1 - Math.abs(elevation) / 0.3);
    this.night = day < 0.15;

    // The strongest weather dims the light and greys the sky.
    const murk = Math.max(
      env.clouds * 0.6,
      env.rain * 0.55,
      env.snow * 0.4,
      env.sand * 0.6,
      env.fog * 0.4,
    );

    // Light: the sun by day, the moon by night, orange at the edges of the day.
    const sunColor = mix(c(0x9db4ff), c(0xffffff), day)
      .lerp(c(0xff9a55), twilight * 0.7)
      .lerp(c(0xd9a55a), env.sand * 0.5)
      .lerp(c(0xdfe8ff), env.snow * 0.3);
    if (env.lightColor) sunColor.set(env.lightColor);
    this.sun.color.copy(sunColor);
    // The dark mode keeps the old moonlit look; a map's night fades from pitch dark to that look.
    const keep = this.dark ? 1 : env.nightLight;
    const nightSun = DARK_SUN + (NIGHT_SUN - DARK_SUN) * keep;
    const nightAmbient = DARK_AMBIENT + (NIGHT_AMBIENT - DARK_AMBIENT) * keep;
    this.sunBase = (nightSun + (DAY_SUN - nightSun) * day) * (1 - 0.35 * murk) * this.dim;
    this.sun.intensity = this.sunBase;
    this.exposure = 1.05 + (1 - day) * 0.25 * (0.4 + 0.6 * keep);
    // The sun's path turns around the map by the heading (the lights and the sky share it).
    const turn = (env.sunAzimuth * Math.PI) / 180;
    const rotate = (v: THREE.Vector3) => {
      const x = v.x * Math.cos(turn) + v.z * Math.sin(turn);
      v.z = v.z * Math.cos(turn) - v.x * Math.sin(turn);
      v.x = x;
      return v;
    };
    rotate(this.sun.position.set(12 + 24 * Math.cos(angle), 4 + 20 * Math.max(elevation, 0.2), 8));
    rotate(this.sunDir.set(Math.cos(angle), elevation, 0.25)).normalize();

    const hemiSky = mix(c(0x8fa6d8), c(0xbfd4ff), day);
    if (env.lightColor) hemiSky.lerp(c(parseInt(env.lightColor.slice(1), 16)), 0.4);
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(mix(c(0x1a1d24), c(0x30343a), day));
    // Reflections follow the daylight: bright by day, a faint trace at night.
    this.scene.environmentIntensity = (0.04 + 0.4 * day) * (1 - 0.3 * murk) * this.dim;
    this.hemiBase =
      (nightAmbient + (DAY_AMBIENT - nightAmbient) * day) * (1 - 0.2 * murk) * this.dim;
    this.hemi.intensity = this.hemiBase;

    // Sky colours.
    const grey = mix(c(0x6e747c), c(0x1c2026), 1 - day);
    const zenith = mix(c(0x04060c), c(0x3f7fd0), day).lerp(c(0x4b3f6e), twilight * 0.5);
    const horizon = mix(c(0x10141a), c(0x9cc8ee), day).lerp(c(0xf39a52), twilight * 0.8);
    for (const col of [zenith, horizon]) {
      col.lerp(grey, murk);
      col.lerp(c(0xb99557), env.sand * 0.7);
    }
    this.domeTop.value.copy(zenith);
    this.domeHorizon.value.copy(horizon);
    this.dome.visible = env.sky;
    const flat = mix(c(NIGHT_BACKGROUND), c(DAY_BACKGROUND), day);
    this.domeBelow.value.copy(flat);
    (this.scene.background as THREE.Color).copy(flat);

    // Sun and moon are painted by the sky shader, opposite each other; the halo follows the weather.
    const above = (dir: THREE.Vector3) => dir.y > -0.04;
    const clear = env.sky && murk < 0.95;
    const sky = this.skyUniforms;
    sky.uSunDir.value.copy(this.sunDir);
    sky.uSunColor.value
      .set(0xfff3c4)
      .lerp(c(0xff6a20), twilight)
      .lerp(grey, murk * 0.8);
    sky.uSun.value = clear && env.sun && above(this.sunDir) ? 1 - murk : 0;
    sky.uMoon.value =
      clear && env.moon && above(this.sunDir.clone().negate()) ? (1 - day) * (1 - murk) : 0;
    sky.uStars.value = env.sky && this.night && murk < 0.5 ? 1 - day : 0;
    sky.uGlow.value = env.sunGlow;
    sky.uDay.value = day;
    sky.uWind.value = 1 + env.wind * 4;
    // The ground shades itself with the same clouds: shadows only under the volumetric sky, by day.
    groundFx.uSunDirG.value.copy(this.sunDir);
    groundFx.uCloudWind.value = 1 + env.wind * 4;
    groundFx.uCloudCover.value = Math.min(env.clouds + env.rain * 0.3, 0.96);
    groundFx.uCloudShadow.value =
      env.sky && this.cloudSteps > 0
        ? 0.5 * Math.min(env.clouds * 1.3, 1) * smooth(0.05, 0.3, elevation) * (1 - 0.5 * murk)
        : 0;
    sky.uTwilight.value = twilight;
    sky.uGrey.value = Math.min(murk * 1.3, 1);
    sky.uCloudCover.value = Math.min(env.clouds + env.rain * 0.3, 0.96);
    sky.uCloudDensity.value = env.cloudDensity;
    sky.uCloudSteps.value = env.sky ? this.cloudSteps : 0;

    // Clouds: more of them, and greyer, with their strength.
    const shown = Math.ceil(env.clouds * CLOUD_COUNT);
    this.clouds.forEach(
      (cl, i) => (cl.group.visible = env.sky && i < shown && this.cloudSteps === 0),
    );
    this.cloudMaterial.color
      .copy(mix(c(0x232a38), c(0xffffff), day))
      .lerp(c(0xff9a66), twilight * 0.5)
      .lerp(c(0x80868e), env.clouds * 0.45);
    this.cloudMaterial.opacity = 0.75 + 0.2 * env.clouds;

    // Fog follows the weather; sand tints it.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = Math.max(env.fog * 0.045, env.sand * 0.04, env.rain * 0.012, env.snow * 0.01);
    fog.far = env.fogFalloff * (1 - 0.55 * env.sand);
    fog.color
      .copy(horizon)
      .lerp(c(0xc9a36a), env.sand * 0.6)
      .lerp(grey, env.fog * 0.3);
    if (!env.sky) fog.color.copy(flat).lerp(c(0xc9a36a), env.sand * 0.6);

    // Precipitation and wind-blown sand.
    this.rain.count = Math.round(RAIN_COUNT * env.rain);
    this.rain.object.visible = this.rain.count > 0 && !this.rainFx;
    this.streaks.visible = this.rainFx && env.rain > 0;
    rainFxUniforms.uRainFx.value = this.rainFx ? env.rain : 0;
    this.rain.object.geometry.setDrawRange(0, this.rain.count * 2);
    this.snow.count = Math.round(SNOW_COUNT * env.snow);
    this.snow.object.visible = this.snow.count > 0;
    this.snow.object.geometry.setDrawRange(0, this.snow.count);
    this.sand.count = Math.round(SAND_COUNT * env.sand);
    this.sand.object.visible = this.sand.count > 0;
    this.sand.object.geometry.setDrawRange(0, this.sand.count);
  }

  /** Moves the sky with the camera, drifts the clouds and animates the weather. */
  update(camera: THREE.Vector3, clock: number): void {
    this.dome.position.copy(camera);
    // Snow settles over about two minutes of a full blizzard and melts over five without it.
    const elapsed = Math.min(Math.max(clock - this.lastClock, 0), 0.1);
    this.lastClock = clock;
    this.settled = Math.min(
      Math.max(this.settled + (this.env.snow > 0 ? this.env.snow / 120 : -1 / 300) * elapsed, 0),
      1,
    );
    snowFx.uSnowCover.value = Math.max(
      this.settled,
      this.env.snowCover,
      this.env.season === 'winter' ? 0.75 : 0,
    );
    this.skyUniforms.uTime.value = clock;
    groundFx.uCloudTime.value = clock;
    rainFxUniforms.uRainTime.value = clock;
    this.streaks.position.set(camera.x, camera.y - 14, camera.z);
    this.storm(camera, clock);
    // The clock runs by itself when the map asks for it: relight once per few minutes of game time.
    if (this.env.dayCycle > 0 && !this.dark) {
      this.clock = clock;
      if (Math.abs(this.hourNow - this.hourShown) > 0.04) this.apply();
    }

    if (this.env.sky && this.env.clouds > 0) {
      const drift = clock * CLOUD_SPEED;
      for (const cl of this.clouds) {
        if (!cl.group.visible) continue;
        cl.group.position.set(
          camera.x + wrap(cl.base.x + drift - camera.x, CLOUD_RANGE),
          cl.base.y,
          camera.z + wrap(cl.base.z - camera.z, CLOUD_RANGE),
        );
      }
    }

    const width = BOX_HALF * 2;
    if (this.rain.count > 0) {
      const { position, seed } = this.rain;
      for (let i = 0; i < this.rain.count; i++) {
        const y =
          wrap(seed[i * 3 + 1]! * BOX_HEIGHT - clock * RAIN_SPEED, BOX_HEIGHT) + BOX_HEIGHT / 2;
        const x =
          camera.x + wrap(seed[i * 3]! * width + clock * this.env.wind * 6 - camera.x, width);
        const z = camera.z + wrap(seed[i * 3 + 2]! * width - camera.z, width);
        const o = i * 6;
        position[o] = x;
        position[o + 1] = y;
        position[o + 2] = z;
        position[o + 3] = x + 0.15 + this.env.wind * 2.5;
        position[o + 4] = y - 0.9;
        position[o + 5] = z;
      }
      (this.rain.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.snow.count > 0) {
      const { position, seed } = this.snow;
      for (let i = 0; i < this.snow.count; i++) {
        const s = seed[i * 3]!;
        const y =
          wrap(seed[i * 3 + 1]! * BOX_HEIGHT - clock * SNOW_SPEED, BOX_HEIGHT) + BOX_HEIGHT / 2;
        const sway = Math.sin(clock * 0.8 + s * 40) * 0.6 * (1 + this.env.wind * 2);
        position[i * 3] =
          camera.x + wrap(s * width + clock * this.env.wind * 5 - camera.x, width) + sway;
        position[i * 3 + 1] = y;
        position[i * 3 + 2] = camera.z + wrap(seed[i * 3 + 2]! * width - camera.z, width);
      }
      (this.snow.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.sand.count > 0) {
      const { position, seed } = this.sand;
      for (let i = 0; i < this.sand.count; i++) {
        const s = seed[i * 3]!;
        const x =
          camera.x +
          wrap(s * width + clock * SAND_SPEED * (0.6 + this.env.wind * 1.6) - camera.x, width);
        const wobble = Math.sin(clock * 3 + s * 50) * 0.4;
        position[i * 3] = x;
        position[i * 3 + 1] = seed[i * 3 + 1]! * 10 + wobble;
        position[i * 3 + 2] = camera.z + wrap(seed[i * 3 + 2]! * width - camera.z, width);
      }
      (this.sand.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
