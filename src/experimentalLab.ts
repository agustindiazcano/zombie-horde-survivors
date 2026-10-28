import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './experimentalLab.css';

/**
 * The experimental lab: a sandbox of our own tests, opened from the editor's Experimental tab. It
 * has its own scene and does not touch the game or the map. Soft things (procedural jelly, a
 * tentacle monster, a fat zombie) hang from springs, and a little hand picks any of them up, moves
 * them around and throws them, to see how they shake.
 */

const STEP = 1 / 120;
const MAX_THROW_SPEED = 28;

/** Control masses on a jelly's surface (a Fibonacci sphere) that carry its wobble. */
const JELLY_CONTROLS = 72;
const JELLY_NEIGHBOURS = 6;
const JELLY_INFLUENCE = 4;

interface Tuning {
  /** Spring strength that pulls a wobbling point back to its shape. */
  stiffness: number;
  /** How much the springs are damped (0 wobbles for ever, 1 is dead). */
  damping: number;
  /** How hard the body's acceleration shoves the soft parts (inertia). */
  push: number;
  /** Gravity (m/s^2). */
  gravity: number;
  /** Share of its fall speed a body keeps when it hits the floor. */
  bounce: number;
  /** Upward speed of a jump (m/s). */
  jumpSpeed: number;
  /** Seconds between automatic jumps (0 is off). */
  autoJump: number;
  /** Terrain height of the loaded map under a point. */
  ground: (x: number, z: number) => number;
}

/** What the lab needs from the game: its scene and camera, drawn by the game itself. */
export interface LabHost {
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  ground: (x: number, z: number) => number;
}

/** Anything the hand can pick up: a sphere of `radius` around `pos` that falls, bounces and wobbles. */
abstract class Thing {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** Acceleration of the body this step: the wobble is driven by it (inertia). */
  readonly acc = new THREE.Vector3();
  held = false;
  abstract readonly radius: number;
  /** Where the wobble lives; `step` moves the body, `wobble` moves what hangs from it. */
  protected abstract wobble(dt: number, tuning: Tuning): void;
  /** Called every frame after the physics steps (animation mixers, geometry upload). */
  abstract frame(dt: number): void;
  abstract dispose(): void;

  private readonly previous = new THREE.Vector3();

  /** Whether the body rests on the floor (so it can jump). */
  grounded(tuning: Tuning): boolean {
    return this.pos.y <= tuning.ground(this.pos.x, this.pos.z) + this.radius * 0.8 + 0.05;
  }

  step(dt: number, tuning: Tuning, target: THREE.Vector3 | null): void {
    this.previous.copy(this.vel);
    if (target) {
      // Held: a strong damped spring drags the body to the hand.
      this.vel.addScaledVector(target.clone().sub(this.pos), 90 * dt);
      this.vel.multiplyScalar(Math.max(0, 1 - 11 * dt));
    } else {
      this.vel.y -= tuning.gravity * dt;
    }
    this.pos.addScaledVector(this.vel, dt);
    const floor = tuning.ground(this.pos.x, this.pos.z) + this.radius * 0.8;
    if (this.pos.y < floor) {
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y *= -tuning.bounce;
      this.vel.x *= 1 - 3 * dt;
      this.vel.z *= 1 - 3 * dt;
    }
    this.acc
      .copy(this.vel)
      .sub(this.previous)
      .multiplyScalar(1 / dt);
    this.wobble(dt, tuning);
  }
}

/**
 * A soft sphere: a welded icosphere whose points follow springy control masses that lag behind the
 * body they hang from. It is the jelly itself and the belly of the procedural fat zombie.
 */
class SoftBlob {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly rest: Float32Array;
  private readonly controlDir: THREE.Vector3[] = [];
  private readonly offset: THREE.Vector3[] = [];
  private readonly speed: THREE.Vector3[] = [];
  private readonly neighbours: number[][] = [];
  /** For every vertex, the nearest controls and their weights. */
  private readonly influence: { index: Uint16Array; weight: Float32Array };
  private readonly scratch = new THREE.Vector3();

  constructor(
    material: THREE.Material,
    readonly radius: number,
    castShadow: boolean,
  ) {
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 4);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    geo.computeVertexNormals();
    this.geometry = geo;
    const position = geo.getAttribute('position') as THREE.BufferAttribute;
    this.rest = new Float32Array(position.array as Float32Array);

    for (let i = 0; i < JELLY_CONTROLS; i++) {
      const y = 1 - (2 * (i + 0.5)) / JELLY_CONTROLS;
      const r = Math.sqrt(1 - y * y);
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      this.controlDir.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
      this.offset.push(new THREE.Vector3());
      this.speed.push(new THREE.Vector3());
    }
    for (let i = 0; i < JELLY_CONTROLS; i++) {
      const order = this.controlDir
        .map((d, j) => ({ j, dot: i === j ? -2 : d.dot(this.controlDir[i]!) }))
        .sort((a, b) => b.dot - a.dot);
      this.neighbours.push(order.slice(0, JELLY_NEIGHBOURS).map((o) => o.j));
    }
    const count = position.count;
    const index = new Uint16Array(count * JELLY_INFLUENCE);
    const weight = new Float32Array(count * JELLY_INFLUENCE);
    const dir = new THREE.Vector3();
    for (let v = 0; v < count; v++) {
      dir.fromArray(this.rest, v * 3).normalize();
      const order = this.controlDir
        .map((d, j) => ({ j, dot: d.dot(dir) }))
        .sort((a, b) => b.dot - a.dot)
        .slice(0, JELLY_INFLUENCE);
      let sum = 0;
      order.forEach((o, k) => {
        const w = Math.exp((o.dot - 1) * 12);
        index[v * JELLY_INFLUENCE + k] = o.j;
        weight[v * JELLY_INFLUENCE + k] = w;
        sum += w;
      });
      for (let k = 0; k < JELLY_INFLUENCE; k++) weight[v * JELLY_INFLUENCE + k]! /= sum;
    }
    this.influence = { index, weight };

    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = castShadow;
    this.mesh.frustumCulled = false;
    this.refresh();
  }

  /** One step of the springs: `acc` is the body's acceleration, `centre` where the blob is. */
  wobble(dt: number, tuning: Tuning, acc: THREE.Vector3, centre: THREE.Vector3): void {
    const k = tuning.stiffness;
    const damping = 2 * Math.sqrt(k) * tuning.damping;
    const gain = tuning.push;
    const ground = tuning.ground(centre.x, centre.z);
    for (let i = 0; i < JELLY_CONTROLS; i++) {
      const off = this.offset[i]!;
      const vel = this.speed[i]!;
      const sum = this.scratch.set(0, 0, 0);
      for (const n of this.neighbours[i]!) sum.add(this.offset[n]!);
      sum.multiplyScalar(1 / JELLY_NEIGHBOURS).sub(off);
      // Inertia pushes against the body's acceleration; the springs pull back to the shape.
      vel.x += (-k * off.x - damping * vel.x + sum.x * k * 0.6 - acc.x * gain) * dt;
      vel.y += (-k * off.y - damping * vel.y + sum.y * k * 0.6 - acc.y * gain) * dt;
      vel.z += (-k * off.z - damping * vel.z + sum.z * k * 0.6 - acc.z * gain) * dt;
      off.addScaledVector(vel, dt);
      // The floor flattens the underside instead of letting the blob sink through it.
      const worldY = centre.y + this.controlDir[i]!.y * this.radius * this.mesh.scale.y + off.y;
      if (worldY < ground) {
        off.y -= worldY - ground;
        vel.y = Math.max(vel.y, 0) * 0.5;
      }
      const length = off.length();
      if (length > this.radius * 0.9) off.multiplyScalar((this.radius * 0.9) / length);
    }
  }

  refresh(): void {
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const { index, weight } = this.influence;
    const out = position.array as Float32Array;
    for (let v = 0; v < position.count; v++) {
      let x = this.rest[v * 3]! * this.radius;
      let y = this.rest[v * 3 + 1]! * this.radius;
      let z = this.rest[v * 3 + 2]! * this.radius;
      for (let k = 0; k < JELLY_INFLUENCE; k++) {
        const w = weight[v * JELLY_INFLUENCE + k]!;
        const o = this.offset[index[v * JELLY_INFLUENCE + k]!]!;
        x += o.x * w;
        y += o.y * w;
        z += o.z * w;
      }
      out[v * 3] = x;
      out[v * 3 + 1] = y;
      out[v * 3 + 2] = z;
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** A procedural jelly ball. */
class Jelly extends Thing {
  readonly radius: number;
  private readonly blob: SoftBlob;

  constructor(color: number, transparent: boolean, radius = 0.8) {
    super();
    this.radius = radius;
    const material = transparent
      ? new THREE.MeshPhysicalMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          roughness: 0.04,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          ior: 1.35,
          specularIntensity: 1,
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0 });
    this.blob = new SoftBlob(material, radius, !transparent);
    this.group.add(this.blob.mesh);
    this.pos.set(0, 3, 0);
    this.frame();
  }

  protected wobble(dt: number, tuning: Tuning): void {
    this.blob.wobble(dt, tuning, this.acc, this.pos);
  }

  frame(): void {
    this.blob.refresh();
    this.group.position.copy(this.pos);
  }

  dispose(): void {
    this.blob.dispose();
  }
}

/**
 * A fat zombie made of primitives with a huge jelly belly. The belly is a soft blob that lags
 * behind the body, so it drops when the zombie goes up and hangs out when it lands.
 */
class FatZombieProcedural extends Thing {
  readonly radius = 1;
  private readonly blob: SoftBlob;
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private clock = 0;

  constructor() {
    super();
    const skin = new THREE.MeshStandardMaterial({ color: 0x7fa65a, roughness: 0.7 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x9cc470, roughness: 0.35 });
    const rags = new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.9 });
    this.materials.push(skin, belly, rags);
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      return mesh;
    };

    // Feet are at y = -0.8 (the body floor), the belly is centred a little above the hips.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.26, -0.2, 0);
      const leg = part(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), rags);
      leg.position.y = -0.3;
      pivot.add(leg);
      this.group.add(pivot);
      this.legs.push(pivot);
    }
    this.blob = new SoftBlob(belly, 0.8, true);
    this.blob.mesh.scale.set(1.05, 0.95, 1.1);
    this.blob.mesh.position.set(0, 0.15, 0.08);
    this.group.add(this.blob.mesh);

    const chest = part(new THREE.CapsuleGeometry(0.3, 0.2, 4, 10), skin);
    chest.position.set(0, 0.95, -0.05);
    this.group.add(chest);
    const head = part(new THREE.SphereGeometry(0.25, 16, 12), skin);
    head.position.set(0, 1.45, 0.05);
    this.group.add(head);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    this.materials.push(eyeMaterial);
    for (const side of [-1, 1]) {
      const eye = part(new THREE.SphereGeometry(0.04, 8, 6), eyeMaterial);
      eye.castShadow = false;
      eye.position.set(side * 0.1, 1.5, 0.27);
      this.group.add(eye);
    }
    // Zombie arms stretched forward.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.4, 1.0, 0);
      pivot.rotation.x = -1.35;
      const arm = part(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), skin);
      arm.position.y = -0.35;
      pivot.add(arm);
      this.group.add(pivot);
      this.arms.push(pivot);
    }
    this.pos.set(0, 3, 0);
    this.frame(0);
  }

  protected wobble(dt: number, tuning: Tuning): void {
    const centre = this.blob.mesh.getWorldPosition(new THREE.Vector3());
    this.blob.wobble(dt, tuning, this.acc, centre);
  }

  frame(dt: number): void {
    this.clock += dt;
    this.blob.refresh();
    this.group.position.copy(this.pos);
    // Legs run on the spot while it moves along the ground; arms and legs spread in the air.
    const airborne = this.pos.y > this.radius * 0.8 + 0.1;
    const stride = Math.sin(this.clock * 9) * Math.min(1, Math.hypot(this.vel.x, this.vel.z) * 0.3);
    this.legs.forEach((leg, i) => {
      const target = airborne ? (i === 0 ? 0.6 : -0.6) : stride * (i === 0 ? 0.7 : -0.7);
      leg.rotation.x += (target - leg.rotation.x) * Math.min(1, dt * 14);
    });
    this.arms.forEach((arm) => {
      const target = airborne ? -2.3 : -1.35;
      arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 10);
    });
    // Lean towards the way it moves.
    const lean = new THREE.Euler(this.vel.z * 0.02, 0, -this.vel.x * 0.02);
    this.group.quaternion.slerp(new THREE.Quaternion().setFromEuler(lean), 0.15);
  }

  dispose(): void {
    this.blob.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** One bone of a tentacle that lags behind the body like a whip. */
interface Jiggler {
  bone: THREE.Bone;
  angle: THREE.Vector2;
  speed: THREE.Vector2;
  depth: number;
}

/** A loaded model with models' own animation; subclasses add what shakes. */
abstract class ModelThing extends Thing {
  radius = 1;
  protected readonly model: THREE.Object3D;
  protected readonly mixer: THREE.AnimationMixer;

  constructor(
    source: { scene: THREE.Object3D; animations: THREE.AnimationClip[] },
    height: number,
    clipHint: RegExp,
  ) {
    super();
    this.model = clone(source.scene);
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model, true);
    const size = box.getSize(new THREE.Vector3());
    // Models come in centimetres or metres; the tallest side is brought to `height`.
    const scale = height / Math.max(size.x, size.y, size.z, 1e-6);
    this.model.scale.multiplyScalar(scale);
    this.model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(this.model, true);
    this.radius = (scaled.max.y - scaled.min.y) / 2;
    this.model.position.y = -this.radius - scaled.min.y;
    this.group.add(this.model);
    this.model.traverse((o) => {
      o.frustumCulled = false;
      o.castShadow = true;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = source.animations.find((c) => clipHint.test(c.name)) ?? source.animations[0];
    if (clip) this.mixer.clipAction(clip).play();
    this.pos.set(0, this.radius + 2, 0);
  }

  frame(dt: number): void {
    this.mixer.update(dt);
    this.group.position.copy(this.pos);
    // Lean towards the way it moves, so a thrown body tumbles a little.
    const lean = new THREE.Euler(this.vel.z * 0.03, 0, -this.vel.x * 0.03);
    this.group.quaternion.slerp(new THREE.Quaternion().setFromEuler(lean), 0.15);
    this.afterAnimation();
  }

  protected abstract afterAnimation(): void;

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

/** The animated tentacle: every bone of its chain lags and whips with a spring. */
class TentacleMonster extends ModelThing {
  private readonly chain: Jiggler[] = [];
  private readonly local = new THREE.Vector3();
  private readonly parentQuat = new THREE.Quaternion();

  constructor(source: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) {
    super(source, 3, /idle/i);
    let depth = 0;
    const bones: THREE.Bone[] = [];
    this.model.traverse((o) => {
      if (o instanceof THREE.Bone && /^Tentacle\d+$/.test(o.name)) bones.push(o);
    });
    bones.sort((a, b) => Number(a.name.slice(8)) - Number(b.name.slice(8)));
    for (const bone of bones) {
      this.chain.push({
        bone,
        angle: new THREE.Vector2(),
        speed: new THREE.Vector2(),
        depth: depth++,
      });
    }
  }

  protected wobble(dt: number, tuning: Tuning): void {
    const k = tuning.stiffness * 1.4;
    const damping = 2 * Math.sqrt(k) * 0.1;
    for (const j of this.chain) {
      j.bone.parent?.getWorldQuaternion(this.parentQuat);
      this.local.copy(this.acc).applyQuaternion(this.parentQuat.invert());
      // Further along the chain the same push bends it more, which is what makes it whip.
      const gain = 0.0035 * (1 + j.depth * 0.25);
      j.speed.x += (-k * j.angle.x - damping * j.speed.x + this.local.z * gain * k) * dt;
      j.speed.y += (-k * j.angle.y - damping * j.speed.y - this.local.x * gain * k) * dt;
      j.angle.addScaledVector(j.speed, dt);
      j.angle.clampScalar(-0.5, 0.5);
    }
  }

  protected afterAnimation(): void {
    const extra = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (const j of this.chain) {
      euler.set(j.angle.x, 0, j.angle.y);
      j.bone.quaternion.multiply(extra.setFromEuler(euler));
    }
  }
}

/** The zombie with a pot belly: a bulge in its vertices, sprung so it sloshes when it jumps. */
class FatZombie extends ModelThing {
  private readonly uniforms = {
    uBulge: { value: 0 },
    uSag: { value: 0 },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uBellyY: { value: 0 },
    uBellyR: { value: 0.1 },
    uTorsoR: { value: 0.3 },
  };
  private inflate = 0.2;
  private squash = 0;
  private squashSpeed = 0;

  constructor(source: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) {
    super(source, 1.9, /walk/i);
    let measured = false;
    this.model.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      const geometry = o.geometry as THREE.BufferGeometry;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = box.getSize(new THREE.Vector3());
      if (!measured && size.length() > 0.2 * 0.01) {
        // The vertical axis of the bind pose is the longest side of the body.
        const axis = size.y >= size.x && size.y >= size.z ? 1 : size.z >= size.x ? 2 : 0;
        const up = new THREE.Vector3();
        up.setComponent(axis, 1);
        const height = size.getComponent(axis);
        this.uniforms.uUp.value.copy(up);
        this.uniforms.uBellyY.value = box.min.getComponent(axis) + height * 0.5;
        this.uniforms.uBellyR.value = height * 0.075;
        this.uniforms.uTorsoR.value = height * 0.16;
        this.inflate = height * 0.1;
        measured = true;
      }
      const material = (o.material as THREE.Material).clone();
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uBulge; uniform float uSag; uniform vec3 uUp;
uniform float uBellyY; uniform float uBellyR; uniform float uTorsoR;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
{
  float along = dot(position, uUp);
  vec3 across = position - uUp * along;
  float reach = length(across);
  float h = (along - uBellyY) / uBellyR;
  float mask = exp(-h * h) * (1.0 - smoothstep(uTorsoR * 0.6, uTorsoR, reach));
  vec3 radial = reach > 1e-6 ? across / reach : vec3(0.0);
  transformed += radial * uBulge * mask - uUp * uSag * mask;
}`,
          );
      };
      material.customProgramCacheKey = () => 'fat-belly';
      o.material = material;
    });
    this.uniforms.uBulge.value = this.inflate;
  }

  protected wobble(dt: number, tuning: Tuning): void {
    const k = tuning.stiffness * 1.1;
    const damping = 2 * Math.sqrt(k) * 0.1;
    // Down-push (the body going up, or landing) squashes the belly out; free fall lets it float.
    const push = this.acc.y + Math.hypot(this.acc.x, this.acc.z) * 0.4;
    this.squashSpeed += (-k * this.squash - damping * this.squashSpeed + push * 0.03 * k) * dt;
    this.squash += this.squashSpeed * dt;
    this.squash = THREE.MathUtils.clamp(this.squash, -0.8, 1.2);
  }

  protected afterAnimation(): void {
    this.uniforms.uBulge.value = this.inflate * (1 + this.squash * 1.6);
    this.uniforms.uSag.value = this.inflate * 0.35 * this.squash;
  }
}

/** The little hand that follows the pointer; its fingers close on whatever it holds. */
function makeHand(): { group: THREE.Group; fingers: THREE.Object3D[]; thumb: THREE.Object3D } {
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0b98d, roughness: 0.6 });
  const group = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.1), skin);
  palm.castShadow = true;
  group.add(palm);
  const fingers: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Object3D();
    pivot.position.set(-0.12 + i * 0.08, 0.18, 0);
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.16, 4, 8), skin);
    finger.position.y = 0.1;
    pivot.add(finger);
    group.add(pivot);
    fingers.push(pivot);
  }
  const thumb = new THREE.Object3D();
  thumb.position.set(0.17, -0.04, 0);
  const thumbMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.12, 4, 8), skin);
  thumbMesh.position.y = 0.08;
  thumb.add(thumbMesh);
  thumb.rotation.z = -0.9;
  group.add(thumb);
  return { group, fingers, thumb };
}

const loader = new GLTFLoader();
const models = new Map<
  string,
  Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>
>();
function loadModel(path: string) {
  let promise = models.get(path);
  if (!promise) {
    promise = loader.loadAsync(import.meta.env.BASE_URL + path);
    models.set(path, promise);
  }
  return promise;
}

/**
 * Opens the lab on the editor's own map: the things are added to the game's scene (so the terrain,
 * sky and light are the map's), and a small panel lets you spawn them. Returns a function that
 * closes it and removes everything it added.
 */
export function openExperimentalLab(host: LabHost, onClose: () => void): () => void {
  const { scene, camera, canvas } = host;
  const things: Thing[] = [];
  const tuning: Tuning = {
    stiffness: 120,
    damping: 0.12,
    push: 0.15,
    gravity: 22,
    bounce: 0.3,
    jumpSpeed: 9,
    autoJump: 0,
    ground: host.ground,
  };
  const hand = makeHand();
  hand.group.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  scene.add(hand.group);

  const pointer = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const ray = () => {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  };
  /** Where the middle of the screen meets the ground: new things appear there. */
  const spawnPoint = () => {
    const centre = new THREE.Raycaster();
    centre.setFromCamera(new THREE.Vector2(0, 0), camera);
    const at = new THREE.Vector3();
    if (!centre.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), at)) {
      at.set(0, 0, 0);
    }
    return at;
  };
  const add = (thing: Thing) => {
    const at = spawnPoint();
    thing.pos.set(
      at.x + (Math.random() - 0.5) * 6,
      thing.radius + 3,
      at.z + (Math.random() - 0.5) * 4,
    );
    scene.add(thing.group);
    things.push(thing);
  };
  let held: Thing | null = null;
  const clear = () => {
    for (const t of things) {
      scene.remove(t.group);
      t.dispose();
    }
    things.length = 0;
    held = null;
  };

  // --- Panel (the map and the editor stay as they are)
  const panel = document.createElement('div');
  panel.className = 'lab__panel';
  document.body.appendChild(panel);
  const title = document.createElement('h3');
  title.textContent = 'Experimental lab';
  panel.appendChild(title);
  const button = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.className = 'lab__btn';
    b.textContent = label;
    b.addEventListener('click', action);
    panel.appendChild(b);
    return b;
  };
  const status = document.createElement('p');
  status.className = 'lab__note';
  const hue = () => new THREE.Color().setHSL(Math.random(), 0.75, 0.5).getHex();
  button('Jelly (solid)', () => add(new Jelly(hue(), false)));
  button('Jelly (transparent)', () => add(new Jelly(hue(), true)));
  const spawnModel = (
    path: string,
    make: (s: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) => Thing,
  ) =>
    loadModel(path).then(
      (source) => add(make(source)),
      () => (status.textContent = 'Could not load ' + path),
    );
  button(
    'Tentacle monster',
    () => void spawnModel('models/enemy-tentacle.glb', (s) => new TentacleMonster(s)),
  );
  button('Fat zombie (procedural)', () => add(new FatZombieProcedural()));
  button(
    'Fat zombie (model)',
    () => void spawnModel('models/enemy-zombie.glb', (s) => new FatZombie(s)),
  );
  button('Clear all', clear);
  const jump = () => {
    for (const t of things) if (t.grounded(tuning)) t.vel.y = tuning.jumpSpeed;
  };
  button('Make them jump', jump);
  /** One labelled slider for a number of the physics; the value is shown next to it. */
  const slide = (
    name: string,
    key: Exclude<keyof Tuning, 'ground'>,
    min: number,
    max: number,
    step: number,
  ) => {
    const label = document.createElement('label');
    label.className = 'lab__slider';
    const text = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(tuning[key]);
    const show = () => (text.textContent = `${name}: ${tuning[key]}`);
    input.addEventListener('input', () => {
      tuning[key] = Number(input.value);
      show();
    });
    show();
    label.append(text, input);
    panel.appendChild(label);
  };
  slide('Bounce (floor)', 'bounce', 0, 0.95, 0.05);
  slide('Gravity', 'gravity', 2, 50, 1);
  slide('Jump speed', 'jumpSpeed', 3, 20, 0.5);
  slide('Auto jump every (s, 0 off)', 'autoJump', 0, 5, 0.5);
  slide('Belly stiffness', 'stiffness', 20, 400, 10);
  slide('Belly damping', 'damping', 0.02, 0.6, 0.02);
  slide('Wobble push', 'push', 0.02, 0.6, 0.02);
  const handButton = button('✋ Hand: on (H)', () => setHandMode(!handMode));
  button('Close (Esc)', () => close());
  const help = document.createElement('p');
  help.className = 'lab__note';
  help.textContent =
    'Hand on: left click grabs and drags, the wheel pushes it away or pulls it closer while holding, let go to throw. Hand off: the editor works as usual.';
  panel.appendChild(help);
  panel.appendChild(status);

  // --- Hand
  let handMode = true;
  let grabOffset = new THREE.Vector3();
  const grabPlane = new THREE.Plane();
  const target = new THREE.Vector3();
  const setHandMode = (on: boolean) => {
    if (!on) release();
    handMode = on;
    hand.group.visible = on;
    handButton.textContent = `✋ Hand: ${on ? 'on' : 'off'} (H)`;
  };
  const setPointer = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  const onMove = (e: MouseEvent) => setPointer(e);
  const onDown = (e: MouseEvent) => {
    if (!handMode || e.button !== 0) return;
    // The hand owns the left button over the map: the editor and the RTS camera do not see it.
    e.stopImmediatePropagation();
    e.preventDefault();
    setPointer(e);
    const r = ray();
    let best: Thing | null = null;
    let bestDistance = Infinity;
    const hit = new THREE.Vector3();
    for (const t of things) {
      if (r.intersectSphere(new THREE.Sphere(t.pos, t.radius * 1.1), hit)) {
        const d = hit.distanceTo(camera.position);
        if (d < bestDistance) {
          bestDistance = d;
          best = t;
        }
      }
    }
    if (!best) return;
    held = best;
    held.held = true;
    const point = r.at(bestDistance, new THREE.Vector3());
    grabOffset = point.clone().sub(best.pos);
    grabPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), point);
  };
  function release() {
    if (!held) return;
    held.held = false;
    if (held.vel.length() > MAX_THROW_SPEED) held.vel.setLength(MAX_THROW_SPEED);
    held = null;
  }
  const onWheel = (e: WheelEvent) => {
    if (!held) return;
    // Holding something, the wheel moves the hand towards or away from the camera, not the map camera.
    e.preventDefault();
    e.stopImmediatePropagation();
    grabPlane.constant += e.deltaY > 0 ? 0.6 : -0.6;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.code === 'KeyH' && !(e.target instanceof HTMLInputElement)) {
      setHandMode(!handMode);
    }
  };
  canvas.addEventListener('mousedown', onDown, true);
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', release);
  window.addEventListener('keydown', onKey, true);

  // Something to look at from the start: a fat zombie and a jelly.
  add(new FatZombieProcedural());
  add(new Jelly(0xff5fa8, true));

  // --- Loop (the game draws the scene; this only moves the things and the hand)
  let frameId = 0;
  let last = performance.now();
  let accumulator = 0;
  let sinceJump = 0;
  const handPoint = new THREE.Vector3();
  const loop = (now: number) => {
    frameId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (held) {
      ray().intersectPlane(grabPlane, handPoint);
      target.copy(handPoint).sub(grabOffset);
    } else if (
      !ray().intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2), handPoint)
    ) {
      handPoint.copy(camera.position);
    }
    if (tuning.autoJump > 0) {
      sinceJump += dt;
      if (sinceJump >= tuning.autoJump) {
        sinceJump = 0;
        jump();
      }
    }
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      for (const t of things) t.step(STEP, tuning, t === held ? target : null);
    }
    for (const t of things) t.frame(dt);

    // The hand sits at the pointer (or at the grab point), facing the camera, sized to look the
    // same at any zoom, with its fingers curled when it holds something.
    hand.group.position.copy(handPoint);
    hand.group.quaternion.copy(camera.quaternion);
    hand.group.scale.setScalar(Math.max(0.3, camera.position.distanceTo(handPoint) * 0.09));
    const curl = held ? 1.35 : 0.15;
    for (const f of hand.fingers) f.rotation.x += (curl - f.rotation.x) * Math.min(1, dt * 18);
    hand.thumb.rotation.z += ((held ? -0.2 : -0.9) - hand.thumb.rotation.z) * Math.min(1, dt * 18);
  };
  frameId = requestAnimationFrame(loop);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frameId);
    canvas.removeEventListener('mousedown', onDown, true);
    canvas.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', release);
    window.removeEventListener('keydown', onKey, true);
    clear();
    scene.remove(hand.group);
    panel.remove();
    onClose();
  }
  return close;
}
