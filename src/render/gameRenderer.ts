import * as THREE from 'three';
import { getSoldier, type GameConfig, type GameState, type Vec2 } from '../sim';
import { buildArena } from './arena';
import type { CharacterFactory, CharacterView } from './characters';
import { ShotEffects } from './effects';
import { SelectionMarkers } from './markers';

/** Camera offset from the focus point: above and behind (towards +z), at zoom 1. */
const CAMERA_OFFSET = new THREE.Vector3(0, 13, 9);
/** Per-frame movement below this (world units) counts as standing still. */
const MOVING_EPSILON = 1e-4;

interface Factories {
  player: CharacterFactory;
  zombie: CharacterFactory;
}

interface ZombieEntry {
  view: CharacterView;
  seenFrame: number;
}

/** Camera shake amplitude (world units) added per event, its cap, and decay per second. */
const SHOT_SHAKE = 0.03;
const HURT_SHAKE = 0.25;
const MAX_SHAKE = 0.4;
const SHAKE_DECAY = 1.5;

/** Camera zoom (offset multiplier): close in direct control, pulled back in RTS mode. */
const ZOOM_DIRECT = 1;
const ZOOM_RTS = 1.7;
/** Exponential smoothing rates (1/s) for following a soldier and for zooming. */
const FOLLOW_RATE = 12;
const ZOOM_RATE = 4;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class GameRenderer {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
  readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly soldiers = new Map<number, CharacterView>();
  private readonly markers = new SelectionMarkers();
  /** Ground point the camera looks at. Pan it in RTS mode; it follows the controlled soldier. */
  readonly focus: Vec2 = { x: 0, z: 0 };
  private zoom = ZOOM_DIRECT;
  private focusInitialized = false;
  private readonly halfSize: number;
  selection: ReadonlySet<number> = new Set();
  private readonly zombies = new Map<number, ZombieEntry>();
  /** Released zombie views kept for reuse instead of being rebuilt. */
  private readonly pool: CharacterView[] = [];
  private frame = 0;
  private shake = 0;
  private readonly effects = new ShotEffects();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly container: HTMLElement,
    config: GameConfig,
    private readonly factories: Factories,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x14171c);
    this.scene.add(buildArena(config.arena));
    this.addLights(config.arena.halfSize);

    this.halfSize = config.arena.halfSize;
    this.scene.add(this.effects.group, this.markers.group);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** Draws `state` interpolated by `alpha` (0..1) between the last two simulation steps. */
  render(state: GameState, alpha: number, dt: number): void {
    this.frame++;

    this.syncSoldiers(state, alpha, dt);
    this.syncZombies(state, alpha, dt);
    this.effects.update(dt);
    this.markers.update(state, this.selection, alpha, dt);
    this.updateCamera(state, alpha, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Moves the RTS camera, keeping the focus inside the arena. */
  pan(dx: number, dz: number): void {
    this.focus.x = Math.min(Math.max(this.focus.x + dx, -this.halfSize), this.halfSize);
    this.focus.z = Math.min(Math.max(this.focus.z + dz, -this.halfSize), this.halfSize);
  }

  /** Feedback pulse on the ground where an order was given. */
  pulse(at: Vec2): void {
    this.markers.pulse(at);
  }

  /** Projects a ground point to canvas pixels (for box selection). */
  worldToScreen(x: number, z: number, y = 0): Vec2 {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width + rect.left,
      z: ((1 - v.y) / 2) * rect.height + rect.top,
    };
  }

  private updateCamera(state: GameState, alpha: number, dt: number): void {
    const leader = getSoldier(state, state.controlledId);
    if (leader) {
      const tx = lerp(leader.prev.x, leader.pos.x, alpha);
      const tz = lerp(leader.prev.z, leader.pos.z, alpha);
      if (!this.focusInitialized) {
        this.focus.x = tx;
        this.focus.z = tz;
      } else {
        const k = 1 - Math.exp(-FOLLOW_RATE * dt);
        this.focus.x = lerp(this.focus.x, tx, k);
        this.focus.z = lerp(this.focus.z, tz, k);
      }
    }
    this.focusInitialized = true;

    const zoomTarget = leader ? ZOOM_DIRECT : ZOOM_RTS;
    this.zoom = lerp(this.zoom, zoomTarget, 1 - Math.exp(-ZOOM_RATE * dt));

    this.camera.position
      .set(this.focus.x, 0, this.focus.z)
      .addScaledVector(CAMERA_OFFSET, this.zoom);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * 2 * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * 2 * this.shake;
      this.shake = Math.max(0, this.shake - SHAKE_DECAY * dt);
    }
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
    this.camera.updateMatrixWorld();
  }

  private syncSoldiers(state: GameState, alpha: number, dt: number): void {
    for (const s of state.soldiers) {
      let view = this.soldiers.get(s.id);
      if (!view) {
        view = this.factories.player();
        this.soldiers.set(s.id, view);
        this.scene.add(view.object);
      }
      const moving = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) > MOVING_EPSILON;
      view.object.position.set(lerp(s.prev.x, s.pos.x, alpha), 0, lerp(s.prev.z, s.pos.z, alpha));
      view.object.rotation.y = s.facing;
      view.setState(s.dead ? 'death' : moving ? 'run' : 'idle');
      view.update(dt);
    }
  }

  /** Spawns visuals for events produced by a simulation step. Call after each step. */
  onStep(state: GameState): void {
    for (const e of state.events) {
      if (e.type === 'shot') {
        this.effects.spawnShot(e.from, e.to, e.facing);
        if (e.shooterId === state.controlledId) {
          this.shake = Math.min(this.shake + SHOT_SHAKE, MAX_SHAKE);
        }
      } else if (e.type === 'soldierHurt' && e.soldierId === state.controlledId) {
        this.shake = Math.min(this.shake + HURT_SHAKE, MAX_SHAKE);
      }
    }
  }

  /** Raycasts from the camera through a screen point onto the ground plane (y = 0). */
  screenToGround = (ndcX: number, ndcY: number): Vec2 | null => {
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z };
  };

  private syncZombies(state: GameState, alpha: number, dt: number): void {
    for (const z of state.zombies) {
      let entry = this.zombies.get(z.id);
      if (!entry) {
        const view = this.pool.pop() ?? this.factories.zombie();
        this.scene.add(view.object);
        entry = { view, seenFrame: this.frame };
        this.zombies.set(z.id, entry);
      }
      entry.seenFrame = this.frame;
      const { object } = entry.view;
      object.position.set(lerp(z.prev.x, z.pos.x, alpha), 0, lerp(z.prev.z, z.pos.z, alpha));
      object.rotation.y = z.facing;
      entry.view.setState(z.state);
      entry.view.update(dt);
    }

    for (const [id, entry] of this.zombies) {
      if (entry.seenFrame === this.frame) continue;
      this.scene.remove(entry.view.object);
      this.pool.push(entry.view);
      this.zombies.delete(id);
    }
  }

  private addLights(halfSize: number): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30343a, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    const reach = halfSize * 1.5;
    cam.left = cam.bottom = -reach;
    cam.right = cam.top = reach;
    cam.far = 80;
    this.scene.add(sun);
  }

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
