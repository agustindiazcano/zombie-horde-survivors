import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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

const GRAVITY = 22;
const FLOOR_BOUNCE = 0.3;
const STEP = 1 / 120;
const MAX_THROW_SPEED = 28;

/** Control masses on a jelly's surface (a Fibonacci sphere) that carry its wobble. */
const JELLY_CONTROLS = 72;
const JELLY_NEIGHBOURS = 6;
const JELLY_INFLUENCE = 4;

interface Tuning {
  /** Spring strength that pulls a wobbling point back to its shape. */
  stiffness: number;
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

  step(dt: number, tuning: Tuning, target: THREE.Vector3 | null): void {
    this.previous.copy(this.vel);
    if (target) {
      // Held: a strong damped spring drags the body to the hand.
      this.vel.addScaledVector(target.clone().sub(this.pos), 90 * dt);
      this.vel.multiplyScalar(Math.max(0, 1 - 11 * dt));
    } else {
      this.vel.y -= GRAVITY * dt;
    }
    this.pos.addScaledVector(this.vel, dt);
    const floor = this.radius * 0.8;
    if (this.pos.y < floor) {
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y *= -FLOOR_BOUNCE;
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

/** A procedural jelly ball: a welded icosphere whose points follow springy control masses. */
class Jelly extends Thing {
  readonly radius: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly rest: Float32Array;
  private readonly mesh: THREE.Mesh;
  private readonly controlDir: THREE.Vector3[] = [];
  private readonly offset: THREE.Vector3[] = [];
  private readonly speed: THREE.Vector3[] = [];
  private readonly neighbours: number[][] = [];
  /** For every vertex, the nearest controls and their weights. */
  private readonly influence: { index: Uint16Array; weight: Float32Array };
  private readonly scratch = new THREE.Vector3();

  constructor(
    color: number,
    readonly transparent: boolean,
    radius = 1,
  ) {
    super();
    this.radius = radius;
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
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = !transparent;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.pos.set(0, 3, 0);
    this.frame();
  }

  protected wobble(dt: number, tuning: Tuning): void {
    const k = tuning.stiffness;
    const damping = 2 * Math.sqrt(k) * 0.12;
    const gain = 0.045;
    for (let i = 0; i < JELLY_CONTROLS; i++) {
      const off = this.offset[i]!;
      const vel = this.speed[i]!;
      const sum = this.scratch.set(0, 0, 0);
      for (const n of this.neighbours[i]!) sum.add(this.offset[n]!);
      sum.multiplyScalar(1 / JELLY_NEIGHBOURS).sub(off);
      // Inertia pushes against the body's acceleration; the springs pull back to the shape.
      vel.x += (-k * off.x - damping * vel.x + sum.x * k * 0.6 - this.acc.x * gain) * dt;
      vel.y += (-k * off.y - damping * vel.y + sum.y * k * 0.6 - this.acc.y * gain) * dt;
      vel.z += (-k * off.z - damping * vel.z + sum.z * k * 0.6 - this.acc.z * gain) * dt;
      off.addScaledVector(vel, dt);
      // The floor flattens the underside instead of letting the jelly sink through it.
      const worldY = this.pos.y + this.controlDir[i]!.y * this.radius + off.y;
      if (worldY < 0) {
        off.y -= worldY;
        vel.y = Math.max(vel.y, 0) * 0.5;
      }
      const length = off.length();
      if (length > this.radius * 0.9) off.multiplyScalar((this.radius * 0.9) / length);
    }
  }

  frame(): void {
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
    this.group.position.copy(this.pos);
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
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
    super(source, 4, /idle/i);
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
    super(source, 2.1, /walk/i);
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

/** Opens the lab over the editor; returns a function that closes it. */
export function openExperimentalLab(onClose: () => void): () => void {
  const root = document.createElement('div');
  root.className = 'lab';
  const canvas = document.createElement('canvas');
  canvas.className = 'lab__canvas';
  root.appendChild(canvas);
  document.body.appendChild(root);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2230);
  scene.fog = new THREE.Fog(0x1b2230, 25, 70);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 5, 12);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2, 0);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.update();

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30283a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -15,
    right: 15,
    top: 15,
    bottom: -15,
    near: 1,
    far: 40,
  });
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x59606e, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.GridHelper(60, 60, 0x7a8294, 0x3d4454));

  const hand = makeHand();
  scene.add(hand.group);

  const things: Thing[] = [];
  const tuning: Tuning = { stiffness: 120 };
  const add = (thing: Thing) => {
    thing.pos.x = (Math.random() - 0.5) * 6;
    thing.pos.z = (Math.random() - 0.5) * 4;
    scene.add(thing.group);
    things.push(thing);
  };
  const clear = () => {
    for (const t of things) {
      scene.remove(t.group);
      t.dispose();
    }
    things.length = 0;
    held = null;
  };

  // --- Panel
  const panel = document.createElement('div');
  panel.className = 'lab__panel';
  root.appendChild(panel);
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
  button('Fat zombie', () => void spawnModel('models/enemy-zombie.glb', (s) => new FatZombie(s)));
  button('Clear all', clear);
  const label = document.createElement('label');
  label.className = 'lab__note';
  label.textContent = 'Stiffness ';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '20';
  slider.max = '400';
  slider.value = String(tuning.stiffness);
  slider.addEventListener('input', () => (tuning.stiffness = Number(slider.value)));
  label.appendChild(slider);
  panel.appendChild(label);
  const handButton = button('✋ Hand: on (H)', () => setHandMode(!handMode));
  button('Close (Esc)', () => close());
  const help = document.createElement('p');
  help.className = 'lab__note';
  help.textContent =
    'Hand on: left click grabs and drags, the wheel pushes it away or pulls it closer, let go to throw. Right drag turns the camera, wheel zooms.';
  panel.appendChild(help);
  panel.appendChild(status);

  // --- Hand
  let handMode = true;
  let held: Thing | null = null;
  let grabOffset = new THREE.Vector3();
  const grabPlane = new THREE.Plane();
  const target = new THREE.Vector3();
  const pointer = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const ray = () => {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  };
  const setHandMode = (on: boolean) => {
    handMode = on;
    hand.group.visible = on;
    handButton.textContent = `✋ Hand: ${on ? 'on' : 'off'} (H)`;
    controls.mouseButtons.LEFT = on ? (-1 as THREE.MOUSE) : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    canvas.style.cursor = on ? 'none' : 'default';
  };
  const setPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  canvas.addEventListener('pointermove', setPointer);
  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    if (!handMode || e.button !== 0) return;
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
    canvas.setPointerCapture(e.pointerId);
  });
  const release = () => {
    if (!held) return;
    held.held = false;
    if (held.vel.length() > MAX_THROW_SPEED) held.vel.setLength(MAX_THROW_SPEED);
    held = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!held) return;
      // Holding something, the wheel moves the hand towards or away from the camera.
      e.preventDefault();
      e.stopImmediatePropagation();
      grabPlane.constant += e.deltaY > 0 ? 0.6 : -0.6;
    },
    { capture: true, passive: false },
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.code === 'KeyH') setHandMode(!handMode);
  };
  window.addEventListener('keydown', onKey, true);
  setHandMode(true);

  // --- Loop
  const resize = () => {
    renderer.setSize(root.clientWidth, root.clientHeight, false);
    camera.aspect = root.clientWidth / Math.max(1, root.clientHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let frameId = 0;
  let last = performance.now();
  let accumulator = 0;
  const handPoint = new THREE.Vector3();
  const loop = (now: number) => {
    frameId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    controls.enableZoom = !held;

    if (held) {
      ray().intersectPlane(grabPlane, handPoint);
      target.copy(handPoint).sub(grabOffset);
    } else if (
      !ray().intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2), handPoint)
    ) {
      handPoint.copy(camera.position);
    }
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      for (const t of things) t.step(STEP, tuning, t === held ? target : null);
    }
    for (const t of things) t.frame(dt);

    // The hand sits at the pointer (or at the grab point), facing the camera, fingers curled when holding.
    hand.group.position.copy(handPoint);
    hand.group.quaternion.copy(camera.quaternion);
    const curl = held ? 1.35 : 0.15;
    for (const f of hand.fingers) f.rotation.x += (curl - f.rotation.x) * Math.min(1, dt * 18);
    hand.thumb.rotation.z += ((held ? -0.2 : -0.9) - hand.thumb.rotation.z) * Math.min(1, dt * 18);

    controls.update();
    renderer.render(scene, camera);
  };
  frameId = requestAnimationFrame(loop);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frameId);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', resize);
    clear();
    controls.dispose();
    renderer.dispose();
    root.remove();
    onClose();
  }
  return close;
}
