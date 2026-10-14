import * as THREE from 'three';
import { getSoldier, type GameConfig, type GameState, type Vec2 } from '../sim';
import { buildArena } from './arena';
import type { CharacterFactory, CharacterView } from './characters';
import { ShotEffects } from './effects';
import { Gore } from './gore';
import { HealthBars } from './healthBars';
import { PickupMeshes } from './pickups';
import { SelectionMarkers } from './markers';

/** Default camera: above and behind the focus point (towards +z), at zoom 1. */
const BASE_DISTANCE = Math.hypot(13, 9);
const DEFAULT_PITCH = Math.atan2(13, 9);
/** Tilt limits (radians above the horizon) and the range of the player's zoom wheel. */
const MIN_PITCH = 0.35;
const MAX_PITCH = 1.5;
const MIN_USER_ZOOM = 0.35;
const MAX_USER_ZOOM = 2.2;
const USER_ZOOM_RATE = 10;
/** Per-frame movement below this (world units) counts as standing still. */
const MOVING_EPSILON = 1e-4;

interface Factories {
  soldiers: CharacterFactory[];
  enemies: Record<string, CharacterFactory>;
  barHeights: Record<string, number>;
  drone: CharacterFactory;
}

interface ZombieEntry {
  type: string;
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

export type ViewMode = 'top' | 'third' | 'first';

/** Over-the-shoulder and eye-level cameras (world units / radians). */
const THIRD_DISTANCE = 4.2;
const THIRD_SHOULDER = 0.45;
const THIRD_TARGET_HEIGHT = 1.5;
const THIRD_PITCH = -0.18;
const EYE_HEIGHT = 1.6;
const CROUCH_EYE_DROP = 0.45;
const LOOK_SENSITIVITY = 0.0022;
const MAX_LOOK_PITCH = 1.2;
const FOV_TOP = 50;
const FOV_THIRD = 60;
const FOV_FIRST = 78;
const MIN_THIRD_ZOOM = 0.5;
const MAX_THIRD_ZOOM = 2.2;

/** Seconds a damaged enemy stays lit up. */
const FLASH_TIME = 0.14;

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
  /** Orbit angle around the focus (0 = camera behind, towards +z) and tilt above the horizon. */
  private yaw = 0;
  private pitch = DEFAULT_PITCH;
  private userZoom = 1;
  private userZoomTarget = 1;
  /** Camera style. Third/first person only make sense while a soldier is controlled. */
  viewMode: ViewMode = 'top';
  private lookPitch = 0;
  private thirdZoom = 1;
  private savedTop = { yaw: 0, pitch: DEFAULT_PITCH };
  private focusInitialized = false;
  /** Smoothed crouch (0..1) and sprint lean (0..1) per soldier id. */
  private readonly stanceVisual = new Map<number, { crouch: number; lean: number }>();
  private readonly healthBars = new HealthBars();
  private readonly gore = new Gore();
  private readonly pickups = new PickupMeshes();
  /** Remaining hit-flash time per enemy id. */
  private readonly flash = new Map<number, number>();
  private readonly config: GameConfig;
  private readonly crates = new Map<number, THREE.Mesh>();
  private readonly crateGeometry = new THREE.BoxGeometry(0.8, 0.5, 0.6);
  private readonly crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a6532,
    emissive: 0xffa200,
    emissiveIntensity: 0.6,
  });
  private clock = 0;
  private readonly halfSize: number;
  private readonly droneHeight: number;
  selection: ReadonlySet<number> = new Set();
  private readonly zombies = new Map<number, ZombieEntry>();
  /** Released zombie views kept for reuse instead of being rebuilt. */
  private readonly pools = new Map<string, CharacterView[]>();
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

    this.config = config;
    this.halfSize = config.arena.halfSize;
    this.droneHeight = config.drone.height;
    this.scene.add(
      this.effects.group,
      this.markers.group,
      this.healthBars.group,
      this.gore.group,
      this.pickups.group,
    );

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** Draws `state` interpolated by `alpha` (0..1) between the last two simulation steps. */
  render(state: GameState, alpha: number, dt: number): void {
    this.frame++;

    // Camera first: the health bars face it.
    this.updateCamera(state, alpha, dt);
    this.syncSoldiers(state, alpha, dt);
    this.syncZombies(state, alpha, dt);
    this.syncCrates(state, dt);
    this.effects.update(dt);
    this.markers.update(state, this.selection, alpha, dt);
    this.pickups.update(state, this.config, dt);
    this.gore.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Moves the RTS camera, keeping the focus inside the arena. */
  pan(dx: number, dz: number): void {
    this.focus.x = Math.min(Math.max(this.focus.x + dx, -this.halfSize), this.halfSize);
    this.focus.z = Math.min(Math.max(this.focus.z + dz, -this.halfSize), this.halfSize);
  }

  /** Orbits (`dYaw`) and tilts (`dPitch`) the camera, within the tilt limits. */
  rotate(dYaw: number, dPitch: number): void {
    if (this.viewMode !== 'top') return; // mouse look drives the camera there
    this.yaw += dYaw;
    this.pitch = Math.min(Math.max(this.pitch + dPitch, MIN_PITCH), MAX_PITCH);
  }

  /** Multiplies the player zoom; factors above 1 move the camera away. */
  zoomBy(factor: number): void {
    if (this.viewMode === 'third') {
      this.thirdZoom = Math.min(Math.max(this.thirdZoom * factor, MIN_THIRD_ZOOM), MAX_THIRD_ZOOM);
      return;
    }
    if (this.viewMode === 'first') return;
    this.userZoomTarget = Math.min(
      Math.max(this.userZoomTarget * factor, MIN_USER_ZOOM),
      MAX_USER_ZOOM,
    );
  }

  /** Switches camera style, keeping the facing direction and restoring the top view's angle. */
  setViewMode(mode: ViewMode, facing = 0): void {
    if (mode === this.viewMode) return;
    if (this.viewMode === 'top') this.savedTop = { yaw: this.yaw, pitch: this.pitch };
    this.viewMode = mode;
    if (mode === 'top') {
      this.yaw = this.savedTop.yaw;
      this.pitch = this.savedTop.pitch;
    } else {
      // The orbit yaw sits half a turn from the view direction (the camera is behind).
      this.yaw = facing - Math.PI;
      this.lookPitch = mode === 'third' ? THIRD_PITCH : 0;
    }
    this.camera.fov = mode === 'first' ? FOV_FIRST : mode === 'third' ? FOV_THIRD : FOV_TOP;
    this.camera.updateProjectionMatrix();
  }

  /** Mouse look for first/third person: dx turns right, dy looks down (pixels). */
  look(dx: number, dy: number): void {
    if (this.viewMode === 'top') return;
    this.yaw -= dx * LOOK_SENSITIVITY;
    this.lookPitch = Math.min(
      Math.max(this.lookPitch - dy * LOOK_SENSITIVITY, -MAX_LOOK_PITCH),
      MAX_LOOK_PITCH,
    );
  }

  /** The point 20 units ahead of `from` along the current view direction. */
  lookAimPoint(from: Vec2): Vec2 {
    const theta = this.yaw + Math.PI;
    return { x: from.x + Math.sin(theta) * 20, z: from.z + Math.cos(theta) * 20 };
  }

  /** Screen position of a world point, or null when it is behind the camera. */
  projectToScreen(x: number, z: number, y = 0): Vec2 | null {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
    if (p.z >= 0) return null;
    return this.worldToScreen(x, z, y);
  }

  /** Converts screen-relative movement (right = +x, down = +z) to a world direction. */
  screenToWorldDir(x: number, z: number): Vec2 {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    return { x: x * cos + z * sin, z: -x * sin + z * cos };
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
    if (leader && this.viewMode !== 'top') {
      this.focusInitialized = true;
      this.updatePersonCamera(leader, alpha, dt);
      return;
    }
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

    this.userZoom = lerp(this.userZoom, this.userZoomTarget, 1 - Math.exp(-USER_ZOOM_RATE * dt));
    const distance = BASE_DISTANCE * this.zoom * this.userZoom;
    const flat = Math.cos(this.pitch) * distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * flat,
      Math.sin(this.pitch) * distance,
      this.focus.z + Math.cos(this.yaw) * flat,
    );
    this.applyShake(dt);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
    this.camera.updateMatrixWorld();
  }

  private applyShake(dt: number): void {
    if (this.shake <= 0) return;
    this.camera.position.x += (Math.random() - 0.5) * 2 * this.shake;
    this.camera.position.z += (Math.random() - 0.5) * 2 * this.shake;
    this.shake = Math.max(0, this.shake - SHAKE_DECAY * dt);
  }

  /** First/third person camera at the controlled unit. */
  private updatePersonCamera(
    leader: GameState['soldiers'][number],
    alpha: number,
    dt: number,
  ): void {
    const px = lerp(leader.prev.x, leader.pos.x, alpha);
    const pz = lerp(leader.prev.z, leader.pos.z, alpha);
    const drone = leader.kind === 'drone';
    const crouch = this.stanceVisual.get(leader.id)?.crouch ?? 0;
    const baseY = drone ? this.droneHeight : lerp(leader.prevY, leader.y, alpha);
    const eyeY = baseY + (drone ? 0 : EYE_HEIGHT - CROUCH_EYE_DROP * crouch);

    // Keep the top-down focus under the soldier so leaving this mode is seamless.
    this.focus.x = px;
    this.focus.z = pz;

    const theta = this.yaw + Math.PI; // view heading
    const cp = Math.cos(this.lookPitch);
    const dir = new THREE.Vector3(
      Math.sin(theta) * cp,
      Math.sin(this.lookPitch),
      Math.cos(theta) * cp,
    );

    if (this.viewMode === 'first') {
      this.camera.position.set(px + Math.sin(theta) * 0.15, eyeY, pz + Math.cos(theta) * 0.15);
    } else {
      // Over the right shoulder, behind the unit.
      const right = new THREE.Vector3(-Math.cos(theta), 0, Math.sin(theta));
      const target = new THREE.Vector3(px, baseY + THIRD_TARGET_HEIGHT, pz).addScaledVector(
        right,
        THIRD_SHOULDER,
      );
      this.camera.position.copy(target).addScaledVector(dir, -THIRD_DISTANCE * this.thirdZoom);
      this.camera.position.y = Math.max(this.camera.position.y, 0.3);
    }
    this.applyShake(dt);
    this.camera.lookAt(this.camera.position.clone().add(dir));
    this.camera.updateMatrixWorld();
  }

  private syncCrates(state: GameState, dt: number): void {
    this.clock += dt;
    const live = new Set<number>();
    for (const c of state.crates) {
      live.add(c.id);
      let mesh = this.crates.get(c.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.crateGeometry, this.crateMaterial);
        mesh.castShadow = true;
        mesh.position.set(c.pos.x, 0.3, c.pos.z);
        mesh.rotation.y = c.id * 1.7;
        this.crates.set(c.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.y = 0.3 + Math.sin(this.clock * 2 + c.id) * 0.05;
    }
    for (const [id, mesh] of this.crates) {
      if (live.has(id)) continue;
      this.scene.remove(mesh);
      this.crates.delete(id);
    }
  }

  private soldierFactory(id: number): CharacterFactory {
    const list = this.factories.soldiers;
    return list[(id - 1) % list.length]!;
  }

  private syncSoldiers(state: GameState, alpha: number, dt: number): void {
    for (const s of state.soldiers) {
      let view = this.soldiers.get(s.id);
      if (!view) {
        view = s.kind === 'drone' ? this.factories.drone() : this.soldierFactory(s.id)();
        this.soldiers.set(s.id, view);
        this.scene.add(view.object);
      }
      const moving = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) > MOVING_EPSILON;
      const drone = s.kind === 'drone';
      view.object.position.set(lerp(s.prev.x, s.pos.x, alpha), 0, lerp(s.prev.z, s.pos.z, alpha));
      view.object.rotation.y = s.facing;
      view.setState(s.dead ? 'death' : moving ? 'run' : 'idle');
      view.update(dt);
      // In first person you look out of the controlled unit's head, so hide its model.
      view.object.visible = !(this.viewMode === 'first' && s.id === state.controlledId);

      // Applied after the view's own update, which may reset its root transform.
      view.object.position.y = drone ? this.droneHeight : lerp(s.prevY, s.y, alpha);
      if (drone) continue;
      let vis = this.stanceVisual.get(s.id);
      if (!vis) {
        vis = { crouch: 0, lean: 0 };
        this.stanceVisual.set(s.id, vis);
      }
      const k = 1 - Math.exp(-14 * dt);
      const alive = !s.dead;
      vis.crouch = lerp(vis.crouch, alive && state.stance === 'crouch' ? 1 : 0, k);
      vis.lean = lerp(vis.lean, alive && state.stance === 'sprint' && moving ? 1 : 0, k);
      view.object.scale.set(1 + 0.06 * vis.crouch, 1 - 0.28 * vis.crouch, 1 + 0.06 * vis.crouch);
      view.object.rotation.x = 0.25 * vis.lean;
    }
  }

  /** Spawns visuals for events produced by a simulation step. Call after each step. */
  onStep(state: GameState): void {
    for (const e of state.events) {
      if (e.type === 'shot') {
        this.effects.spawnShot(e.from, e.to, e.facing, e.height, e.hitZombieId !== null);
        if (e.shooterId === state.controlledId) {
          this.shake = Math.min(this.shake + SHOT_SHAKE, MAX_SHAKE);
        }
        if (e.hitZombieId !== null) this.flash.set(e.hitZombieId, FLASH_TIME);
      } else if (e.type === 'zombieKilled' && e.exploded) {
        const size = this.config.enemies[e.enemy]?.radiusScale ?? 1;
        this.gore.burst(e.pos.x, e.pos.z, Math.min(Math.max(size, 0.8), 1.8));
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
        const type = this.factories.enemies[z.type] ? z.type : 'zombie';
        const view = this.pools.get(type)?.pop() ?? this.factories.enemies[type]!();
        view.setFlash?.(0);
        this.scene.add(view.object);
        entry = { type, view, seenFrame: this.frame };
        this.zombies.set(z.id, entry);
      }
      entry.seenFrame = this.frame;
      const { object } = entry.view;
      object.position.set(lerp(z.prev.x, z.pos.x, alpha), 0, lerp(z.prev.z, z.pos.z, alpha));
      object.rotation.y = z.facing;
      object.visible = !z.exploded;
      entry.view.setState(z.state);
      entry.view.update(dt);

      const flashLeft = this.flash.get(z.id) ?? 0;
      entry.view.setFlash?.(flashLeft > 0 ? flashLeft / FLASH_TIME : 0);
      if (flashLeft > 0) this.flash.set(z.id, flashLeft - dt);
      else this.flash.delete(z.id);

      if (z.state === 'death') {
        this.healthBars.hide(z.id);
      } else {
        this.healthBars.show(
          z.id,
          object.position.x,
          this.factories.barHeights[entry.type] ?? 2.2,
          object.position.z,
          0.6 + z.radius * 1.2,
          z.health / z.maxHealth,
          this.camera,
        );
      }
    }

    for (const [id, entry] of this.zombies) {
      if (entry.seenFrame === this.frame) continue;
      this.scene.remove(entry.view.object);
      const pool = this.pools.get(entry.type) ?? [];
      pool.push(entry.view);
      this.pools.set(entry.type, pool);
      this.zombies.delete(id);
      this.healthBars.release(id);
      this.flash.delete(id);
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
