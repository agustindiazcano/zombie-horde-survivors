import * as THREE from 'three';
import { defaultEnvironment, type Environment } from '../sim';

/** The lighting of a normal day (the game's look before the environment existed) and of the dark mode. */
const DAY_AMBIENT = 1.2;
const DAY_SUN = 2.2;
const DAY_BACKGROUND = 0x14171c;
const NIGHT_AMBIENT = 0.75;
const NIGHT_SUN = 1.1;
const NIGHT_BACKGROUND = 0x10141a;

const SKY_RADIUS = 450;
const DISC_DISTANCE = 400;
const CLOUD_COUNT = 24;
const CLOUD_RANGE = 700;
const CLOUD_HEIGHT = 80;
const CLOUD_SPEED = 2.5;
const RAIN_COUNT = 2500;
const SNOW_COUNT = 3000;
const SAND_COUNT = 2500;
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

  private readonly dome: THREE.Mesh;
  private readonly domeTop = { value: c(0x3f7fd0) };
  private readonly domeHorizon = { value: c(0x9cc8ee) };
  /** Below the horizon the dome shows the plain dark ground colour the game always had. */
  private readonly domeBelow = { value: c(DAY_BACKGROUND) };
  private readonly sunDisc: THREE.Mesh;
  private readonly moonDisc: THREE.Mesh;
  private readonly clouds: { group: THREE.Group; base: THREE.Vector3 }[] = [];
  private readonly cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
  });
  private readonly rain: Particles;
  private readonly snow: Particles;
  private readonly sand: Particles;
  private sunDir = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
  ) {
    this.scene.fog = new THREE.FogExp2(0x9cc8ee, 0);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: this.domeTop, horizon: this.domeHorizon, below: this.domeBelow },
        vertexShader: `varying float h;
          void main() {
            h = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 below; varying float h;
          void main() {
            float t = pow(clamp(h, 0.0, 1.0), 0.55);
            vec3 col = mix(horizon, top, t);
            col = mix(col, below, smoothstep(0.0, -0.12, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);

    const disc = (radius: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthWrite: false }),
      );
      m.renderOrder = -9;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.sunDisc = disc(16);
    this.moonDisc = disc(11);

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

    this.rain = this.makeRain();
    this.snow = this.makePoints(SNOW_COUNT, 0xffffff, 0.2, 0.9);
    this.sand = this.makePoints(SAND_COUNT, 0xd9b26f, 0.16, 0.8);
    this.apply();
  }

  /** True while the light is moonlight: the game turns the flashlights on. */
  get isNight(): boolean {
    return this.dark || this.night;
  }

  set(env: Environment): void {
    this.env = env;
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
    const hour = this.dark ? 0 : env.timeOfDay;
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
    const sunColor = mix(c(0x9db4ff), c(0xffffff), day).lerp(c(0xff9a55), twilight * 0.7);
    if (env.lightColor) sunColor.set(env.lightColor);
    this.sun.color.copy(sunColor);
    this.sun.intensity = (NIGHT_SUN + (DAY_SUN - NIGHT_SUN) * day) * (1 - 0.35 * murk);
    this.sun.position.set(12 + 24 * Math.cos(angle), 4 + 20 * Math.max(elevation, 0.2), 8);
    this.sunDir.set(Math.cos(angle), elevation, 0.25).normalize();

    const hemiSky = mix(c(0x8fa6d8), c(0xbfd4ff), day);
    if (env.lightColor) hemiSky.lerp(c(parseInt(env.lightColor.slice(1), 16)), 0.4);
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(mix(c(0x1a1d24), c(0x30343a), day));
    this.hemi.intensity = (NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * day) * (1 - 0.2 * murk);

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

    // Sun and moon discs sit on the dome opposite each other.
    const above = (dir: THREE.Vector3) => dir.y > -0.04;
    this.sunDisc.visible = env.sky && env.sun && above(this.sunDir) && murk < 0.95;
    (this.sunDisc.material as THREE.MeshBasicMaterial).color
      .set(0xfff3c4)
      .lerp(c(0xff8a3c), twilight)
      .lerp(grey, murk * 0.8);
    const moonDir = this.sunDir.clone().multiplyScalar(-1);
    this.moonDisc.visible = env.sky && env.moon && above(moonDir) && murk < 0.95;
    (this.moonDisc.material as THREE.MeshBasicMaterial).color.set(0xe6ecff).lerp(grey, murk * 0.8);

    // Clouds: more of them, and greyer, with their strength.
    const shown = Math.ceil(env.clouds * CLOUD_COUNT);
    this.clouds.forEach((cl, i) => (cl.group.visible = env.sky && i < shown));
    this.cloudMaterial.color
      .copy(mix(c(0x232a38), c(0xffffff), day))
      .lerp(c(0xff9a66), twilight * 0.5)
      .lerp(c(0x80868e), env.clouds * 0.45);
    this.cloudMaterial.opacity = 0.75 + 0.2 * env.clouds;

    // Fog follows the weather; sand tints it.
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = Math.max(env.fog * 0.045, env.sand * 0.04, env.rain * 0.012, env.snow * 0.01);
    fog.color
      .copy(horizon)
      .lerp(c(0xc9a36a), env.sand * 0.6)
      .lerp(grey, env.fog * 0.3);
    if (!env.sky) fog.color.copy(flat).lerp(c(0xc9a36a), env.sand * 0.6);

    // Precipitation and wind-blown sand.
    this.rain.count = Math.round(RAIN_COUNT * env.rain);
    this.rain.object.visible = this.rain.count > 0;
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
    this.sunDisc.position.copy(camera).addScaledVector(this.sunDir, DISC_DISTANCE);
    this.moonDisc.position.copy(camera).addScaledVector(this.sunDir, -DISC_DISTANCE);

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
        const x = camera.x + wrap(seed[i * 3]! * width - camera.x, width);
        const z = camera.z + wrap(seed[i * 3 + 2]! * width - camera.z, width);
        const o = i * 6;
        position[o] = x;
        position[o + 1] = y;
        position[o + 2] = z;
        position[o + 3] = x + 0.15;
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
        const sway = Math.sin(clock * 0.8 + s * 40) * 0.6;
        position[i * 3] = camera.x + wrap(s * width - camera.x, width) + sway;
        position[i * 3 + 1] = y;
        position[i * 3 + 2] = camera.z + wrap(seed[i * 3 + 2]! * width - camera.z, width);
      }
      (this.snow.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.sand.count > 0) {
      const { position, seed } = this.sand;
      for (let i = 0; i < this.sand.count; i++) {
        const s = seed[i * 3]!;
        const x = camera.x + wrap(s * width + clock * SAND_SPEED - camera.x, width);
        const wobble = Math.sin(clock * 3 + s * 50) * 0.4;
        position[i * 3] = x;
        position[i * 3 + 1] = seed[i * 3 + 1]! * 10 + wobble;
        position[i * 3 + 2] = camera.z + wrap(seed[i * 3 + 2]! * width - camera.z, width);
      }
      (this.sand.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
