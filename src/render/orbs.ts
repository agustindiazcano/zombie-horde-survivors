import * as THREE from 'three';
import type { GameConfig, GameState, Vec2 } from '../sim';

const FLASH_LIFE = 0.9;
const ASH_COUNT = 90;
const ASH_LIFE = 2.4;
const MAX_FLASHES = 8;
const MAX_ASH = 420;
const RAY_RADIUS = 0.05;
/** Metres a sphere bobs up and down while it hovers. */
const BOB = 0.04;
const UP = new THREE.Vector3(0, 1, 0);
const BEAM_RADIUS = 1.2;
/** Lights shared by everyone being burned, and by the flash of a vaporising person. */
const BURN_LIGHTS = 4;
const BURN_LIGHT_INTENSITY = 260;
const FLASH_LIGHT_INTENSITY = 600;
/** The big sphere's cold light on the crowd below. */
const FLOOD_INTENSITY = 1500;
const FLOOD_COLOR = 0x9fb4cc;
const SPARK_COLOR = 0xbfe9ff;

interface OrbView {
  group: THREE.Group;
  ray: THREE.Mesh;
  /** A wide column of light under an abductor. */
  beam: THREE.Mesh;
  /** The cold light a big sphere pours down, and the soft cone that makes it visible. */
  flood: THREE.SpotLight | null;
  cone: THREE.Mesh | null;
  pool: THREE.Mesh | null;
}

/**
 * The celestial orbs: dark brushed-metal spheres that hover without a sound, a thin ray while a
 * hunter works, a wide beam under an abductor, and the vaporising of a person: they stiffen and
 * glow while the ray holds them, then flash, a ring spreads and ash drifts up. All procedural.
 */
export class OrbViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, OrbView>();
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 48, 32);
  private readonly ringGeometry = new THREE.TorusGeometry(1, 0.035, 8, 64);
  private readonly rayGeometry = new THREE.CylinderGeometry(RAY_RADIUS, RAY_RADIUS, 1, 8, 1, true);
  private readonly beamGeometry = new THREE.CylinderGeometry(
    BEAM_RADIUS * 0.6,
    BEAM_RADIUS,
    1,
    24,
    1,
    true,
  );
  private readonly flashes: {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    ring: THREE.Mesh;
    ringMaterial: THREE.MeshBasicMaterial;
    life: number;
  }[] = [];
  private nextFlash = 0;
  private readonly ash: THREE.InstancedMesh;
  private readonly ashPos = new Float32Array(MAX_ASH * 3);
  private readonly ashVel = new Float32Array(MAX_ASH * 3);
  private readonly ashLife = new Float32Array(MAX_ASH);
  private nextAsh = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly rayDir = new THREE.Vector3();
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly burnGlows = new Map<number, THREE.Sprite>();
  private readonly burnLights: THREE.PointLight[] = [];
  private readonly flashLight = new THREE.PointLight(SPARK_COLOR, 0, 30, 2);
  private flashLightLife = 0;
  private readonly envMap: THREE.Texture;

  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    renderer: THREE.WebGLRenderer,
  ) {
    this.envMap = makeNightEnvironment(renderer);

    const flashGeometry = new THREE.SphereGeometry(1, 16, 12);
    const ringGeometry = new THREE.RingGeometry(0.85, 1, 48);
    for (let i = 0; i < MAX_FLASHES; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: SPARK_COLOR,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(flashGeometry, material);
      mesh.visible = false;
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: SPARK_COLOR,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.group.add(mesh, ring);
      this.flashes.push({ mesh, material, ring, ringMaterial, life: 0 });
    }
    this.ash = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x9aa3ad }),
      MAX_ASH,
    );
    this.ash.frustumCulled = false;
    this.ash.count = MAX_ASH;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_ASH; i++) this.ash.setMatrixAt(i, this.dummy.matrix);
    this.group.add(this.ash);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(170,215,255,0.7)');
    grad.addColorStop(1, 'rgba(120,180,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glowTexture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < BURN_LIGHTS; i++) {
      const light = new THREE.PointLight(SPARK_COLOR, 0, 14, 2);
      this.group.add(light);
      this.burnLights.push(light);
    }
    this.group.add(this.flashLight);
  }

  /** A person is vaporised at `pos`: a big flash, a ring on the ground and a cloud of ash. */
  vaporise(pos: Vec2): void {
    const ground = this.groundAt(pos.x, pos.z);
    const flash = this.flashes[this.nextFlash]!;
    this.nextFlash = (this.nextFlash + 1) % MAX_FLASHES;
    flash.mesh.position.set(pos.x, ground + 1, pos.z);
    flash.ring.position.set(pos.x, ground + 0.08, pos.z);
    flash.mesh.visible = true;
    flash.ring.visible = true;
    flash.life = FLASH_LIFE;
    this.flashLight.position.set(pos.x, ground + 1.2, pos.z);
    this.flashLightLife = 0.6;
    for (let i = 0; i < ASH_COUNT; i++) {
      const k = this.nextAsh;
      this.nextAsh = (this.nextAsh + 1) % MAX_ASH;
      this.ashPos.set(
        [
          pos.x + (Math.random() - 0.5) * 0.6,
          ground + Math.random() * 1.9,
          pos.z + (Math.random() - 0.5) * 0.6,
        ],
        k * 3,
      );
      this.ashVel.set(
        [(Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6],
        k * 3,
      );
      this.ashLife[k] = ASH_LIFE * (0.5 + Math.random() * 0.5);
    }
  }

  update(state: GameState, config: GameConfig, alpha: number, dt: number, time: number): void {
    const live = new Set<number>();
    for (const orb of state.orbs) {
      const def = config.orbs[orb.type];
      if (!def) continue;
      live.add(orb.id);
      let view = this.views.get(orb.id);
      if (!view) {
        view = this.makeView(def.radius, def.color, def.kind === 'abductor');
        this.views.set(orb.id, view);
        this.group.add(view.group);
      }
      const awake = orb.phase !== 'dormant' && orb.phase !== 'gone';
      view.group.visible = awake;
      if (!awake) continue;
      const x = orb.prev.x + (orb.pos.x - orb.prev.x) * alpha;
      const z = orb.prev.z + (orb.pos.z - orb.prev.z) * alpha;
      const height = orb.prevY + (orb.y - orb.prevY) * alpha;
      const ground = this.groundAt(x, z);
      const y = ground + height + Math.sin(time * 2 + orb.id) * BOB;
      view.group.position.set(x, y, z);

      // The thin ray runs from a hunter to the head of whoever it works on; an abductor's wide
      // beam falls straight to the ground under its victim.
      const aim = orb.aim;
      const hunting =
        def.kind === 'metal' && (orb.phase === 'charge' || orb.phase === 'burn') && aim !== null;
      const lifting =
        def.kind === 'abductor' && (orb.phase === 'beam' || orb.phase === 'lift') && aim !== null;
      view.ray.visible = hunting;
      view.beam.visible = lifting;
      if (aim && (hunting || lifting)) {
        const mesh = hunting ? view.ray : view.beam;
        const tx = aim.x;
        const ty = this.groundAt(aim.x, aim.z) + (hunting ? 1.4 : 0);
        const tz = aim.z;
        const length = Math.max(Math.hypot(tx - x, ty - y, tz - z), 0.01);
        mesh.position.set((tx - x) / 2, (ty - y) / 2, (tz - z) / 2);
        mesh.scale.set(1, length, 1);
        this.rayDir.set(tx - x, ty - y, tz - z).normalize();
        mesh.quaternion.setFromUnitVectors(UP, this.rayDir);
      }

      // The big sphere floods the crowd below with cold grey-blue light.
      if (view.flood && view.cone && view.pool) {
        const glow = orb.glow;
        view.flood.intensity = FLOOD_INTENSITY * glow * (0.95 + Math.sin(time * 5 + orb.id) * 0.05);
        view.cone.visible = glow > 0.01;
        view.pool.visible = glow > 0.01;
        (view.cone.material as THREE.MeshBasicMaterial).opacity = 0.1 * glow;
        (view.pool.material as THREE.MeshBasicMaterial).opacity = 0.35 * glow;
        // The cone and the pool hang straight under the sphere down to the ground.
        const drop = Math.max(y - ground, 1);
        view.cone.scale.set(1, drop, 1);
        view.cone.position.set(0, -drop / 2, 0);
        view.pool.position.set(0, -drop + 0.12, 0);
        view.flood.target.position.set(0, -drop, 0);
        view.flood.target.updateMatrixWorld();
      }
    }
    for (const [id, view] of this.views) {
      if (live.has(id)) continue;
      this.group.remove(view.group);
      this.views.delete(id);
    }

    this.updateBurning(state, alpha, time);

    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        f.ring.visible = false;
        continue;
      }
      const t = 1 - f.life / FLASH_LIFE;
      f.mesh.scale.setScalar(0.5 + t * 3.2);
      f.material.opacity = (1 - t) * (1 - t);
      f.ring.scale.setScalar(0.5 + t * 7);
      f.ringMaterial.opacity = (1 - t) * 0.8;
    }
    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity = FLASH_LIGHT_INTENSITY * Math.max(this.flashLightLife / 0.6, 0);
    } else this.flashLight.intensity = 0;
    for (let i = 0; i < MAX_ASH; i++) {
      if (this.ashLife[i]! <= 0) continue;
      this.ashLife[i]! -= dt;
      const alive = this.ashLife[i]! > 0;
      this.ashPos[i * 3]! += this.ashVel[i * 3]! * dt;
      this.ashPos[i * 3 + 1]! += this.ashVel[i * 3 + 1]! * dt;
      this.ashPos[i * 3 + 2]! += this.ashVel[i * 3 + 2]! * dt;
      this.ashVel[i * 3 + 1]! *= 1 - 0.4 * dt;
      this.dummy.position.set(
        this.ashPos[i * 3]!,
        this.ashPos[i * 3 + 1]!,
        this.ashPos[i * 3 + 2]!,
      );
      this.dummy.scale.setScalar(alive ? 0.03 + 0.06 * (this.ashLife[i]! / ASH_LIFE) : 0);
      this.dummy.updateMatrix();
      this.ash.setMatrixAt(i, this.dummy.matrix);
    }
    this.ash.instanceMatrix.needsUpdate = true;
  }

  /** People held by a hunter's ray glow brighter and brighter, and a few of them light their surroundings. */
  private updateBurning(state: GameState, alpha: number, time: number): void {
    const live = new Set<number>();
    let light = 0;
    for (const a of state.animals) {
      if (a.burn <= 0) continue;
      live.add(a.id);
      let glow = this.burnGlows.get(a.id);
      if (!glow) {
        glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
        );
        this.burnGlows.set(a.id, glow);
        this.group.add(glow);
      }
      const x = a.prev.x + (a.pos.x - a.prev.x) * alpha;
      const z = a.prev.z + (a.pos.z - a.prev.z) * alpha;
      const ground = this.groundAt(x, z);
      const flicker = 0.85 + Math.sin(time * 40 + a.id) * 0.15;
      glow.position.set(x, ground + 0.95, z);
      glow.scale.set(2.2 + a.burn * 1.6, 3.4 + a.burn * 1.4, 1);
      glow.material.opacity = Math.min(1, a.burn * 1.4) * flicker;
      const lamp = this.burnLights[light];
      if (lamp) {
        lamp.position.set(x, ground + 1.2, z);
        lamp.intensity = BURN_LIGHT_INTENSITY * a.burn * flicker;
        light++;
      }
    }
    for (let i = light; i < BURN_LIGHTS; i++) this.burnLights[i]!.intensity = 0;
    for (const [id, glow] of this.burnGlows) {
      if (live.has(id)) continue;
      this.group.remove(glow);
      glow.material.dispose();
      this.burnGlows.delete(id);
    }
  }

  /** Drops the views for a new map. */
  clear(): void {
    for (const view of this.views.values()) this.group.remove(view.group);
    this.views.clear();
    for (const glow of this.burnGlows.values()) {
      this.group.remove(glow);
      glow.material.dispose();
    }
    this.burnGlows.clear();
  }

  private makeView(radius: number, color: string, big: boolean): OrbView {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color,
      metalness: 1,
      roughness: big ? 0.28 : 0.2,
      envMap: this.envMap,
      envMapIntensity: 1.4,
    });
    const sphere = new THREE.Mesh(this.sphereGeometry, metal);
    sphere.scale.setScalar(radius);
    group.add(sphere);
    // A dark band round the middle with a faint cold line in it, so it reads as made, not as a ball.
    const band = new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x0f1318,
        metalness: 0.9,
        roughness: 0.35,
        emissive: 0x6f9fd0,
        emissiveIntensity: big ? 1.1 : 0.7,
        envMap: this.envMap,
      }),
    );
    band.rotation.x = Math.PI / 2;
    band.scale.set(radius * 1.004, radius * 1.004, radius * (big ? 1.6 : 1.2));
    group.add(band);

    const beam = new THREE.Mesh(
      this.beamGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xbfe0ff,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.visible = false;
    group.add(beam);
    const ray = new THREE.Mesh(
      this.rayGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xe8f6ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ray.visible = false;
    group.add(ray);

    let flood: THREE.SpotLight | null = null;
    let cone: THREE.Mesh | null = null;
    let pool: THREE.Mesh | null = null;
    if (big) {
      flood = new THREE.SpotLight(FLOOD_COLOR, 0, 70, 0.72, 0.65, 2);
      group.add(flood);
      group.add(flood.target);
      cone = new THREE.Mesh(
        new THREE.ConeGeometry(14, 1, 40, 1, true),
        new THREE.MeshBasicMaterial({
          color: FLOOD_COLOR,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      // The cone's tip is at +y by default: the tip stays at the sphere, the wide end on the ground.
      cone.visible = false;
      group.add(cone);
      pool = new THREE.Mesh(
        new THREE.CircleGeometry(14, 48),
        new THREE.MeshBasicMaterial({
          color: FLOOD_COLOR,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.visible = false;
      group.add(pool);
    }
    return { group, ray, beam, flood, cone, pool };
  }
}

/**
 * A small made-up night sky for the metal to reflect: a dark dome, a bright moon, a warm glow low
 * on the horizon (the street lamps) and a few cold panels. Without it a metal ball only shows black.
 */
function makeNightEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x0a0e16, side: THREE.BackSide }),
  );
  scene.add(dome);
  const panel = (color: number, size: [number, number], at: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(0xdfe8ff, [10, 10], [-25, 38, -20]); // the moon
  panel(0x8b6a40, [90, 6], [0, -8, -45]); // lamps along the horizon
  panel(0x8b6a40, [90, 6], [0, -8, 45]);
  panel(0x5a7fb0, [40, 3], [30, 18, 20]); // cold sky glow
  panel(0x2b3e58, [60, 20], [0, 45, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  dome.geometry.dispose();
  return texture;
}
