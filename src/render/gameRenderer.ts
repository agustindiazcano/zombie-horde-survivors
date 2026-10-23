import * as THREE from 'three';
import {
  FIXED_DT,
  getSoldier,
  heightAt,
  localPlayer,
  oceanHeight,
  type AimLine,
  type GameConfig,
  type Environment,
  type GameState,
  type SimEvent,
  type Vec2,
} from '../sim';
import { buildArena } from './arena';
import type { CharacterFactory, CharacterView } from './characters';
import { ShotEffects } from './effects';
import { Gore } from './gore';
import { StreetLights, setStreetPower } from './neighbourhood';
import { OrbViews } from './orbs';
import { SkyLightViews } from './skyLights';
import { LooseParts } from './looseParts';
import { HealthBars } from './healthBars';
import { EnvironmentView } from './environment';
import { OceanView } from './oceanView';
import { WaterReflection } from './waterReflection';
import { patchGroundRain } from './rainFx';
import { LensDrops } from './lensDrops';
import { setPomQuality, setTextureQuality } from './pom';
import { Sirens } from './sirens';
import { GroundItemViews } from './groundItems';
import { PickupMeshes } from './pickups';
import { createShip } from './ships';
import { createAircraft, createGroundShadow, createJeep, type HelicopterParts } from './vehicles';
import { GrenadeEffects, type GrenadePreview } from './grenades';
import { SelectionMarkers } from './markers';
import { ViewModel } from './viewModel';
import { StructureViews, type BuildGhost } from './structures';
import { FireViews, ObjectViews } from './objects';

/** Default camera: above and behind the focus point (towards +z), at zoom 1. */
const BASE_DISTANCE = Math.hypot(13, 9);
const DEFAULT_PITCH = Math.atan2(13, 9);
/** Tilt limits (radians above the horizon) and the range of the player's zoom wheel. */
const MIN_PITCH = -0.6; // below the horizon line the camera looks up at the sky
const MAX_PITCH = 1.5;
const MIN_USER_ZOOM = 0.04;
const MAX_USER_ZOOM = 6;
/** The orbit camera never sinks below this height (m), so tilting up does not go underground. */
const MIN_CAMERA_HEIGHT = 0.8;
const USER_ZOOM_RATE = 10;
/** Per-frame movement below this (world units) counts as standing still. */
const MOVING_EPSILON = 1e-4;
/** A soldier walks below this share of the full running speed, and runs again above the higher one. */
const WALK_BELOW = 0.65;
const RUN_ABOVE = 0.8;

/** True for a follower while the soldier the player controls is aiming down the sights. */
function followerWalk(state: GameState, id: number): boolean {
  const lead = state.soldiers.find((u) => u.id === localPlayer(state).controlledId);
  return lead !== undefined && lead.id !== id && lead.aiming;
}

interface Factories {
  soldiers: CharacterFactory[];
  enemies: Record<string, CharacterFactory>;
  barHeights: Record<string, number>;
  spurts?: Record<string, number>;
  drone: CharacterFactory;
  animals: Record<string, CharacterFactory>;
}

interface ZombieEntry {
  /** Key of the pool the view returns to (bosses get their own, since they are re-skinned). */
  poolKey: string;
  type: string;
  view: CharacterView;
  seenFrame: number;
  /** Seconds until the next blood spurt of a bleeder. */
  spurtIn?: number;
  /** Seconds left of the jet from a neck that lost its head. */
  neckSpurt?: number;
}

/** A legless enemy's forward pitch (radians), and how far back its body is shifted (metres). */
const CRAWL_PITCH = 1.25;
const CRAWL_BACK = 0.5;
/** The crawl's drag: pulls per second (radians/s), side roll and nose dip (radians). */
const CRAWL_RATE = 7;
const CRAWL_ROLL = 0.12;
const CRAWL_DIP = 0.1;
/** Heights at which thrown limbs rest on the ground. */
const LIMB_REST = 0.2;
const LEG_REST = 0.35;

/** Seconds a headless body keeps spraying from the neck. */
const NECK_SPURT_TIME = 1.2;

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
const THIRD_DISTANCE = 4.6;
const THIRD_SHOULDER = 0.45;
const THIRD_TARGET_HEIGHT = 1.7;
const THIRD_PITCH = -0.38;
const EYE_HEIGHT = 1.6;
const CROUCH_EYE_DROP = 0.45;
/**
 * Mouse look is 1:1 and instant: every pixel of mouse movement turns the view by a fixed
 * angle, with no smoothing or dead zone.
 */
const LOOK_SENSITIVITY = 0.0022;
const MAX_LOOK_PITCH = 1.2;
/** How far (radians) a neighbour watching the sky leans back. */
const WATCH_LEAN = 0.2;
/** Camera shake is only a light tremor in person views; big jolts feel like glitches. */
const PERSON_SHAKE_SCALE = 0.12;
/** How fast a model's drawn heading catches up with the simulated one (1/s). */
const TURN_VISUAL_RATE = 22;

/** How much a mini boss's colours are darkened (1 = unchanged). */
const BOSS_DARKEN = 0.3;

/** Normal lighting (the default): bright, flashlights off. */
const DAY_AMBIENT = 1.2;
const DAY_SUN = 2.2;
const DAY_BACKGROUND = 0x14171c;

/** Flashlights (on in the dark mode and at night; the night lighting itself is in environment.ts). */
const FLASHLIGHT_INTENSITY = 160;
const FLASHLIGHT_RANGE = 24;
const FLASHLIGHT_ANGLE = 0.5;
const FLASHLIGHT_HEIGHT = 1.3;
/** How far ahead of the soldier, on the ground, the flashlight points. */
const FLASHLIGHT_REACH = 8;
const FOV_TOP = 50;
const FOV_THIRD = 60;
const FOV_FIRST = 78;
/** How fast the view eases in and out of aiming (1/s). */
const AIM_ZOOM_RATE = 12;
const MIN_THIRD_ZOOM = 0.5;
const MAX_THIRD_ZOOM = 2.2;

/** A corpse dead this long (deathTimer past this, seconds) stops animating. */
const CORPSE_SETTLED = -2;
/** Seconds a damaged enemy stays lit up. */
const FLASH_TIME = 0.14;
/** Seconds a soldier plays the strike clip after a melee blow. */
const STRIKE_TIME = 0.5;
/** A soldier keeps the gun at the shoulder this long after a shot, and raises it at this rate (1/s). */
const GUN_RAISED_TIME = 0.8;
const GUN_RAISE_RATE = 12;
/** A swimmer's feet sit this far under the surface, and its body tips forward by this much (radians). */
const SWIM_FLOAT = 0.35;
const SWIM_PITCH = 1.3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A vehicle in the scene; aircraft also carry their rotors and a ground shadow. */
interface VehicleView {
  object: THREE.Group;
  wheels: THREE.Object3D[];
  heli?: HelicopterParts;
  shadow?: THREE.Mesh;
  pitch?: number;
  bank?: number;
}

/** Radians the helicopter's nose drops at top speed. */
const HELI_PITCH = 0.22;
/** The most it banks into a turn (radians), and how much per radian turned per tick. */
const HELI_BANK = 0.35;
const HELI_BANK_PER_TURN = 6;
/** Rotor radians per frame at full speed. */
const HELI_ROTOR_STEP = 0.7;

/** What each season does to the ground: a colour that multiplies the paint and a glow that lightens it (snow). */
const SEASONS: Record<Environment['season'], { tint: number; glow: number }> = {
  spring: { tint: 0xd9ffcc, glow: 0 },
  summer: { tint: 0xffffff, glow: 0 },
  autumn: { tint: 0xffc78c, glow: 0 },
  winter: { tint: 0xc4d2e6, glow: 0xdfe8f5 },
};

export class GameRenderer {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
  readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly soldiers = new Map<number, CharacterView>();
  private readonly vehicles = new Map<number, VehicleView>();
  /** One flashlight per soldier: a group (moved and turned with the unit) holding a spotlight. */
  private readonly flashlights = new Map<number, { group: THREE.Group; light: THREE.SpotLight }>();
  private readonly markers = new SelectionMarkers();
  private readonly grenades = new GrenadeEffects(
    (x, z) => this.groundAt(x, z),
    () => this.config,
  );
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
  /** Dark mode: dim lights plus flashlights. Off by default. */
  private dark = false;
  private readonly environment: EnvironmentView;
  private goreEnabled = true;
  private hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight(0xffffff, DAY_SUN);
  private lookPitch = 0;
  /** Drawn heading per soldier, easing towards the simulated facing. */
  private readonly visYaw = new Map<number, number>();
  /** Seconds left of the strike pose, by soldier id. */
  private readonly strikeLeft = new Map<number, number>();
  /** Soldiers currently shown walking instead of running (with a margin so the clip does not flicker). */
  private readonly walking = new Set<number>();
  /** Seconds each soldier keeps its gun raised after firing, and how raised it is now (0 to 1). */
  private readonly shotLeft = new Map<number, number>();
  private readonly gunRaise = new Map<number, number>();
  /** The gun seen in first person. */
  private readonly viewModel = new ViewModel();
  private thirdZoom = 1;
  private savedTop = { yaw: 0, pitch: DEFAULT_PITCH };
  private focusInitialized = false;
  /** Smoothed crouch (0..1) and sprint lean (0..1) per soldier id. */
  private readonly stanceVisual = new Map<number, { crouch: number; lean: number; swim: number }>();
  private readonly healthBars = new HealthBars();
  private structureViews!: StructureViews;
  private objectViews!: ObjectViews;
  private groundItemViews!: GroundItemViews;
  private fireViews!: FireViews;
  private readonly gore = new Gore();
  private readonly orbViews: OrbViews;
  private readonly skyLights = new SkyLightViews();
  private readonly streetLights: StreetLights;
  private readonly sirens: Sirens;
  private readonly looseParts = new LooseParts();
  private readonly pickups = new PickupMeshes();
  /** Remaining hit-flash time per enemy id. */
  private readonly flash = new Map<number, number>();
  private readonly config: GameConfig;
  /** The wave ocean of the current map (Map 13), or null for flat water. */
  private ocean: OceanView | null = null;
  private waterQuality = 3;
  private filmic = false;
  /** The planar mirror of the water (High and Ultra), null when the option is off. */
  private reflection: WaterReflection | null = null;
  private lens: LensDrops | null = null;
  private waterLook: Environment['water'] | null = null;
  private season: Environment['season'] = 'summer';
  private readonly crates = new Map<number, THREE.Mesh>();
  private readonly crateGeometry = new THREE.BoxGeometry(0.8, 0.5, 0.6);
  private readonly crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a6532,
    emissive: 0xffa200,
    emissiveIntensity: 0.6,
  });
  private clock = 0;
  private halfSize: number;
  private arenaGroup: THREE.Group;
  private readonly droneHeight: number;
  selection: ReadonlySet<number> = new Set();
  private readonly zombies = new Map<number, ZombieEntry>();
  /** Released zombie views kept for reuse instead of being rebuilt. */
  private readonly pools = new Map<string, CharacterView[]>();
  private frame = 0;
  private shake = 0;
  /** Field-of-view multiplier while aiming (1 = none) and the one it is easing towards. */
  private aimZoom = 1;
  private aimZoomTarget = 1;
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

    this.scene.background = new THREE.Color(DAY_BACKGROUND);
    this.arenaGroup = buildArena(config.arena);
    this.scene.add(this.arenaGroup);
    this.addLights(config.arena.halfSize);
    this.environment = new EnvironmentView(this.scene, this.hemi, this.sun);
    this.scene.environment = buildReflectionMap(this.renderer);

    this.config = config;
    this.syncOcean(config.arena);
    this.halfSize = config.arena.halfSize;
    this.droneHeight = config.drone.height;
    this.objectViews = new ObjectViews(config, (x, z) => this.groundAt(x, z));
    this.groundItemViews = new GroundItemViews(config, (x, z) => this.groundAt(x, z));
    this.orbViews = new OrbViews((x, z) => this.groundAt(x, z), this.renderer);
    this.streetLights = new StreetLights(this.scene);
    this.streetLights.set(this.arenaGroup.userData.lamps ?? []);
    this.sirens = new Sirens(this.scene);
    this.sirens.set(this.arenaGroup.userData.sirens ?? []);
    this.fireViews = new FireViews(config, (x, z) => this.groundAt(x, z));
    this.structureViews = new StructureViews(
      config,
      (x, z) => this.groundAt(x, z),
      this.healthBars,
    );
    this.scene.add(
      this.effects.group,
      this.markers.group,
      this.grenades.group,
      this.healthBars.group,
      this.structureViews.group,
      this.objectViews.group,
      this.groundItemViews.group,
      this.fireViews.group,
      this.gore.group,
      this.orbViews.group,
      this.skyLights.group,
      this.looseParts.group,
      this.pickups.group,
    );

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  private editMarkers: THREE.Mesh[] | null = null;
  private spawnMarkers: THREE.Group | null = null;
  private goalMarkers: THREE.Group | null = null;
  private fireMarkers: THREE.Group | null = null;
  private vehicleModel: THREE.Object3D | null = null;
  private readonly animals = new Map<number, CharacterView>();

  /** Terrain height under a point of the loaded map. */
  private groundAt(x: number, z: number): number {
    return heightAt(this.config.arena.terrain.heights, this.halfSize, x, z);
  }

  /** Drops every unit view, for a new map whose units reuse the same ids with other types. */
  resetUnits(): void {
    for (const view of this.soldiers.values()) this.scene.remove(view.object);
    for (const lamp of this.flashlights.values()) this.scene.remove(lamp.group);
    for (const entry of this.zombies.values()) this.scene.remove(entry.view.object);
    for (const entry of this.vehicles.values()) {
      this.scene.remove(entry.object);
      if (entry.shadow) this.scene.remove(entry.shadow);
    }
    this.vehicles.clear();
    this.structureViews.clear();
    this.objectViews.clear();
    this.fireViews.clear();
    for (const view of this.animals.values()) this.scene.remove(view.object);
    this.animals.clear();
    this.orbViews.clear();
    this.skyLights.clear();
    this.soldiers.clear();
    this.flashlights.clear();
    this.zombies.clear();
    this.visYaw.clear();
    this.stanceVisual.clear();
  }

  /** Yellow rings under the selected items while editing (an empty list hides them). */
  setEditMarkers(marks: { at: Vec2; radius: number }[]): void {
    this.editMarkers ??= [];
    while (this.editMarkers.length < marks.length) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      this.scene.add(ring);
      this.editMarkers.push(ring);
    }
    this.editMarkers.forEach((ring, i) => {
      const m = marks[i];
      ring.visible = m !== undefined;
      if (!m) return;
      ring.position.set(m.at.x, ring.position.y, m.at.z);
      ring.scale.setScalar(m.radius);
    });
  }

  /** The enemy spawn points of the map being edited, as red rings on the ground (null hides them). */
  setSpawnMarkers(points: Vec2[] | null): void {
    if (!this.spawnMarkers) {
      this.spawnMarkers = new THREE.Group();
      this.scene.add(this.spawnMarkers);
    }
    for (const child of this.spawnMarkers.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }
    this.spawnMarkers.clear();
    for (const p of points ?? []) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.9, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4a3a, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, this.groundAt(p.x, p.z) + 0.06, p.z);
      this.spawnMarkers.add(ring);
    }
  }

  /** Green rings on the ground for the "reach this spot" goals of a story map (empty hides them). */
  setGoalMarkers(goals: { x: number; z: number; radius: number }[]): void {
    this.goalMarkers ??= new THREE.Group();
    if (!this.goalMarkers.parent) this.scene.add(this.goalMarkers);
    for (const child of this.goalMarkers.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }
    this.goalMarkers.clear();
    for (const g of goals) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.1, g.radius - 0.3), g.radius, 48),
        new THREE.MeshBasicMaterial({ color: 0x4aff7a, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(g.x, this.groundAt(g.x, g.z) + 0.07, g.z);
      this.goalMarkers.add(ring);
    }
  }

  /** Flames over the fires of the map (empty hides them); they flicker in `update`. */
  setFireMarkers(fires: { x: number; z: number }[]): void {
    this.fireMarkers ??= new THREE.Group();
    if (!this.fireMarkers.parent) this.scene.add(this.fireMarkers);
    for (const child of [...this.fireMarkers.children]) {
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
    this.fireMarkers.clear();
    const radius = this.config.hazards.fire.radius;
    for (const f of fires) {
      const fire = new THREE.Group();
      fire.position.set(f.x, this.groundAt(f.x, f.z), f.z);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 32),
        new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.28 }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.06;
      fire.add(glow);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.35, 1.3, 7),
          new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff7a1a : 0xffc93d }),
        );
        const reach = i === 0 ? 0 : radius * 0.35;
        flame.position.set(Math.cos(angle) * reach, 0.65, Math.sin(angle) * reach);
        flame.userData.phase = i * 1.7;
        fire.add(flame);
      }
      this.fireMarkers.add(fire);
    }
  }

  /** The translucent box that shows where a structure would go (null hides it). */
  setBuildGhost(ghost: BuildGhost | null): void {
    this.structureViews.setGhost(ghost);
  }

  /** Swaps the floor, walls and obstacles for those of another map (the config is shared and already updated). */
  setArena(arena: GameConfig['arena']): void {
    this.scene.remove(this.arenaGroup);
    this.arenaGroup.traverse((o) => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
    this.arenaGroup = buildArena(arena);
    this.streetLights.set(this.arenaGroup.userData.lamps ?? []);
    this.sirens.set(this.arenaGroup.userData.sirens ?? []);
    this.scene.add(this.arenaGroup);
    this.applySeason();
    this.syncOcean(arena);
    this.halfSize = arena.halfSize;
    const cam = this.sun.shadow.camera;
    const reach = arena.halfSize * 1.5;
    cam.left = cam.bottom = -reach;
    cam.right = cam.top = reach;
    cam.updateProjectionMatrix();
    this.focus.x = Math.min(Math.max(this.focus.x, -this.halfSize), this.halfSize);
    this.focus.z = Math.min(Math.max(this.focus.z, -this.halfSize), this.halfSize);
  }

  /** Draws `state` interpolated by `alpha` (0..1) between the last two simulation steps. */
  render(state: GameState, alpha: number, dt: number): void {
    this.frame++;

    // Camera first: the health bars face it.
    this.updateCamera(state, alpha, dt);
    this.updateFov(dt);
    this.syncSoldiers(state, alpha, dt);
    this.syncZombies(state, alpha, dt);
    this.syncVehicles(state, alpha);
    this.structureViews.update(state, this.camera);
    this.objectViews.update(state);
    this.groundItemViews.update(state);
    this.fireViews.update(state, this.clock);
    // The editor previews the map's fires with static markers; in play the fires come from the state.
    if (this.fireMarkers) this.fireMarkers.visible = state.sandbox;
    this.fireViews.group.visible = !state.sandbox;
    this.syncAnimals(state, alpha, dt);
    this.orbViews.update(state, this.config, alpha, dt, this.clock);
    this.skyLights.update(state, alpha, this.clock);
    this.skyLights.updatePhones(state, this.config, alpha);
    this.updateBlackout(state);
    this.streetLights.update(this.camera.position, dt);
    this.sirens.update(dt);
    this.syncCrates(state, dt);
    this.effects.update(dt);
    this.grenades.update(state, dt);
    this.markers.update(state, this.selection, alpha, dt);
    this.pickups.update(state, this.config, dt);
    this.gore.update(dt);
    this.looseParts.update(dt, (x, z) => this.groundAt(x, z));
    this.environment.update(this.camera.position, this.clock);
    this.renderer.toneMappingExposure = this.filmic ? this.environment.exposure : 1;
    if (this.ocean) {
      this.ocean.setParams(this.config.ocean);
      this.ocean.update(state.time, this.environment.sunDirection);
    }
    for (const fire of this.fireMarkers?.children ?? []) {
      for (const flame of fire.children) {
        if (flame.userData.phase === undefined) continue;
        flame.scale.y = 0.8 + 0.35 * Math.sin(this.clock * 9 + (flame.userData.phase as number));
      }
    }
    this.drawWaterMirror();
    this.renderer.render(this.scene, this.camera);
    if (this.viewMode === 'first') this.viewModel.render(this.renderer);
    this.lens?.render(this.renderer, this.environment.rainAmount, this.clock);
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

  /** Narrows the view while aiming down the sights (1 = normal); it eases in and out. */
  setAimZoom(factor: number): void {
    this.aimZoomTarget = factor;
  }

  private updateFov(dt: number): void {
    const target = this.viewMode === 'top' ? 1 : this.aimZoomTarget;
    this.aimZoom += (target - this.aimZoom) * Math.min(1, AIM_ZOOM_RATE * dt);
    const base =
      this.viewMode === 'first' ? FOV_FIRST : this.viewMode === 'third' ? FOV_THIRD : FOV_TOP;
    const fov = base * this.aimZoom;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** First/third person mouse look, applied immediately: dx turns right, dy looks down (px). */
  look(dx: number, dy: number): void {
    if (this.viewMode === 'top') return;
    this.yaw -= dx * LOOK_SENSITIVITY;
    this.lookPitch = Math.min(
      Math.max(this.lookPitch - dy * LOOK_SENSITIVITY, -MAX_LOOK_PITCH),
      MAX_LOOK_PITCH,
    );
  }

  /** Points a first or third person view up (positive) or down at `pitch` radians. */
  setLookPitch(pitch: number): void {
    this.lookPitch = Math.min(Math.max(pitch, -MAX_LOOK_PITCH), MAX_LOOK_PITCH);
  }

  /** The camera's line of sight in a person view (null in top-down): where a shot lands in height. */
  sightLine(): AimLine | null {
    if (this.viewMode === 'top') return null;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const flat = Math.hypot(dir.x, dir.z);
    if (flat < 1e-6) return null;
    const p = this.camera.position;
    return { x: p.x, z: p.z, height: p.y, slope: dir.y / flat };
  }

  /** The point 20 units from `from` straight ahead along the view direction. */
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

  /** Shows the grenade arc and landing zone while aiming in RTS mode (null hides them). */
  setGrenadePreview(preview: GrenadePreview | null): void {
    this.grenades.setPreview(preview);
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
    const leader = getSoldier(state, localPlayer(state).controlledId);
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
    const height = Math.max(Math.sin(this.pitch) * distance, MIN_CAMERA_HEIGHT);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * flat,
      height,
      this.focus.z + Math.cos(this.yaw) * flat,
    );
    this.applyShake(dt);
    // Tilted past the horizon the camera keeps its height and aims up at the sky.
    this.camera.lookAt(this.focus.x, height - Math.sin(this.pitch) * distance, this.focus.z);
    this.camera.updateMatrixWorld();
  }

  private applyShake(dt: number, scale = 1): void {
    if (this.shake <= 0) return;
    this.camera.position.x += (Math.random() - 0.5) * 2 * this.shake * scale;
    this.camera.position.z += (Math.random() - 0.5) * 2 * this.shake * scale;
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
    const baseY =
      this.groundAt(px, pz) + (drone ? this.droneHeight : lerp(leader.prevY, leader.y, alpha));
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
    this.applyShake(dt, PERSON_SHAKE_SCALE);
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
        mesh.position.set(c.pos.x, this.groundAt(c.pos.x, c.pos.z) + 0.3, c.pos.z);
        mesh.rotation.y = c.id * 1.7;
        this.crates.set(c.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.y =
        this.groundAt(c.pos.x, c.pos.z) + 0.3 + Math.sin(this.clock * 2 + c.id) * 0.05;
    }
    for (const [id, mesh] of this.crates) {
      if (live.has(id)) continue;
      this.scene.remove(mesh);
      this.crates.delete(id);
    }
  }

  /** The model of a soldier: the one its unit type names (marine1...), else one by id. */
  private soldierFactory(s: GameState['soldiers'][number]): CharacterFactory {
    const list = this.factories.soldiers;
    const slot = this.config.units.units[s.unitType]?.model ?? s.id - 1;
    return list[slot % list.length]!;
  }

  /** Draws the wandering animals: the walk clip while they move, idle while they stand. */
  private syncAnimals(state: GameState, alpha: number, dt: number): void {
    const live = new Set<number>();
    for (const a of state.animals) {
      live.add(a.id);
      let view = this.animals.get(a.id);
      if (!view) {
        const make = this.factories.animals[a.type] ?? this.factories.enemies.zombie!;
        view = make();
        this.animals.set(a.id, view);
        this.scene.add(view.object);
      }
      const x = lerp(a.prev.x, a.pos.x, alpha);
      const z = lerp(a.prev.z, a.pos.z, alpha);
      view.object.position.set(x, this.groundAt(x, z) + a.lift, z);
      view.object.rotation.order = 'YXZ';
      view.object.rotation.y = a.facing;
      // Neighbours watching the sky lean back a little.
      const watching =
        this.config.skyShowOn && a.panic <= 0 && state.time < this.config.skyShow.calmUntil;
      view.object.rotation.x = watching ? -WATCH_LEAN : 0;
      // Burned by a ray: the body crumbles away in the last moments.
      view.object.scale.setScalar(a.burn > 0.82 ? Math.max(0, 1 - (a.burn - 0.82) / 0.18) : 1);
      view.setState(a.panic > 0 ? 'run' : a.dest ? 'walk' : 'idle');
      view.update(dt);
    }
    for (const [id, view] of this.animals) {
      if (live.has(id)) continue;
      this.scene.remove(view.object);
      this.animals.delete(id);
    }
  }

  /**
   * The sky show's blackout: the street lights and windows flicker from `flickerAt`, then go out at
   * `blackoutAt`, leaving only a little moonlight.
   */
  private updateBlackout(state: GameState): void {
    let power = 1;
    if (this.config.skyShowOn) {
      const rules = this.config.skyShow;
      const t = state.time;
      if (t >= rules.blackoutAt) power = 0;
      else if (t >= rules.flickerAt) {
        // Quick uneven on-off steps, about twelve a second, getting worse.
        const step = Math.floor(t * 12);
        const wobble = Math.sin(step * 12.9898) * 43758.5453;
        const onChance = 1 - ((t - rules.flickerAt) / (rules.blackoutAt - rules.flickerAt)) * 0.7;
        power = wobble - Math.floor(wobble) < onChance ? 1 : 0;
      }
    }
    setStreetPower(power);
    this.streetLights.setPower(power);
    this.environment.setDim(power === 0 ? this.config.skyShow.blackoutLight : 1);
  }

  /**
   * Puts a boat on the real waves: it rises with the surface under it and tilts with its slope along
   * and across (sampled at the bow, stern and both sides). Big ships follow only a third as much.
   */
  private rideWaves(
    object: THREE.Object3D,
    def: GameConfig['vehicles'][string],
    x: number,
    z: number,
    yaw: number,
    time: number,
  ): void {
    const level = this.config.arena.terrain.water;
    if (level === null) return;
    const half = def.radius * 0.8;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const at = (dx: number, dz: number) =>
      oceanHeight(this.config.ocean, level, this.groundAt(x + dx, z + dz), x + dx, z + dz, time);
    const centre = at(0, 0);
    const bow = at(fx * half, fz * half);
    const stern = at(-fx * half, -fz * half);
    // The model faces +z with +x on its left.
    const left = at(fz * half, -fx * half);
    const right = at(-fz * half, fx * half);
    const k = def.ship ? 0.35 : 1;
    object.position.y = (centre + (bow + stern + left + right) / 4) / 2 - 0.05;
    object.rotation.x = -Math.atan2(bow - stern, 2 * half) * k;
    object.rotation.z = Math.atan2(left - right, 2 * half) * k;
  }

  /** Draws the vehicles of the state: a jeep for every ground type, the procedural helicopter for aircraft. */
  private syncVehicles(state: GameState, alpha: number): void {
    const live = new Set<number>();
    const sea = this.config.arena.terrain.water ?? 0;
    for (const v of state.vehicles) {
      live.add(v.id);
      const def = this.config.vehicles[v.type]!;
      let entry = this.vehicles.get(v.id);
      if (!entry) {
        if (v.air) {
          const heli = createAircraft(v.type);
          entry = {
            object: heli.object,
            wheels: [],
            heli,
            shadow: createGroundShadow(def.radius * 1.2),
            pitch: 0,
            bank: 0,
          };
          this.scene.add(entry.shadow!);
        } else if (def.ship) entry = { object: createShip(v.type, def.ship), wheels: [] };
        else entry = createJeep(this.vehicleModel);
        this.vehicles.set(v.id, entry);
        this.scene.add(entry.object);
      }
      const x = lerp(v.prev.x, v.pos.x, alpha);
      const z = lerp(v.prev.z, v.pos.z, alpha);
      // Ships float on the water; everything else follows the ground.
      const ground = def.ship ? sea : this.groundAt(x, z);
      const alt = v.air ? lerp(v.air.prevAlt, v.air.alt, alpha) : 0;
      // A boat rides the swell a little; the big ships are steady.
      const swell = def.water ? Math.sin(state.time * 1.7 + v.id) : 0;
      entry.object.position.set(x, ground + alt + swell * 0.07, z);
      entry.object.rotation.z = swell * 0.02;
      entry.object.rotation.x = def.water ? Math.cos(state.time * 1.3 + v.id) * 0.015 : 0;
      const turn = Math.atan2(Math.sin(v.facing - v.prevFacing), Math.cos(v.facing - v.prevFacing));
      const yaw = v.prevFacing + turn * alpha;
      entry.object.rotation.order = 'YXZ';
      entry.object.rotation.y = yaw;
      if (this.ocean && def.water && !v.air)
        this.rideWaves(entry.object, def, x, z, yaw, state.time);
      for (const wheel of entry.wheels) wheel.rotation.x += v.speed * 0.02;
      if (v.air && entry.heli) {
        // Nose down with speed, banked into the turn; both ease so the machine does not snap.
        // A tiltrotor flies level: its pods do the leaning.
        const tiltrotor = entry.heli.nacelles.length > 0;
        const pitchTarget = (v.speed / def.maxSpeed) * (tiltrotor ? HELI_PITCH / 4 : HELI_PITCH);
        const bankTarget = Math.max(
          -HELI_BANK,
          Math.min(HELI_BANK, turn * 60 * HELI_BANK_PER_TURN),
        );
        entry.pitch = lerp(entry.pitch ?? 0, pitchTarget, 0.1);
        entry.bank = lerp(entry.bank ?? 0, bankTarget, 0.1);
        entry.heli.tilt.rotation.x = entry.pitch;
        entry.heli.tilt.rotation.z = entry.bank;
        for (const r of entry.heli.rotors) {
          r.group.rotation[r.axis] += v.air.rotor * HELI_ROTOR_STEP * r.speed;
        }
        // The pods point up to hover and swing forward with speed.
        const nacelleTilt = (v.speed / def.maxSpeed) * (Math.PI / 2) * v.air.rotor;
        for (const pod of entry.heli.nacelles) {
          pod.rotation.x = lerp(pod.rotation.x, nacelleTilt, 0.08);
        }
        if (entry.shadow) {
          entry.shadow.position.set(x, ground + 0.06, z);
          entry.shadow.scale.setScalar(1 + alt * 0.03);
          (entry.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
            0.1,
            0.35 - alt * 0.008,
          );
        }
      }
      // Only a vehicle with a crew can be hurt, so only then does it show a bar.
      if (v.seats.some((id) => id !== null)) {
        this.healthBars.show(
          -v.id - 1,
          x,
          ground + alt + (entry.heli?.height ?? 2.6),
          z,
          2.2,
          v.health / v.maxHealth,
          this.camera,
        );
      } else {
        this.healthBars.hide(-v.id - 1);
      }
    }
    for (const [id, entry] of this.vehicles) {
      if (live.has(id)) continue;
      this.scene.remove(entry.object);
      if (entry.shadow) this.scene.remove(entry.shadow);
      this.healthBars.release(-id - 1);
      this.vehicles.delete(id);
    }
  }

  private syncSoldiers(state: GameState, alpha: number, dt: number): void {
    for (const s of state.soldiers) {
      let view = this.soldiers.get(s.id);
      if (!view) {
        view = s.kind === 'drone' ? this.factories.drone() : this.soldierFactory(s)();
        this.soldiers.set(s.id, view);
        this.scene.add(view.object);
        if (s.kind === 'soldier') this.flashlights.set(s.id, this.createFlashlight());
      }
      const moving = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) > MOVING_EPSILON;
      const drone = s.kind === 'drone';
      view.object.position.set(lerp(s.prev.x, s.pos.x, alpha), 0, lerp(s.prev.z, s.pos.z, alpha));
      let heading: number;
      if (this.viewMode !== 'top' && s.id === localPlayer(state).controlledId) {
        // Turns the instant the mouse does, in sync with the camera.
        heading = this.yaw + Math.PI;
      } else {
        const shown = this.visYaw.get(s.id) ?? s.facing;
        const turn = Math.atan2(Math.sin(s.facing - shown), Math.cos(s.facing - shown));
        heading = shown + turn * (1 - Math.exp(-TURN_VISUAL_RATE * dt));
      }
      this.visYaw.set(s.id, heading);
      view.object.rotation.y = heading;
      const striking = (this.strikeLeft.get(s.id) ?? 0) - dt;
      this.strikeLeft.set(s.id, Math.max(striking, 0));
      // Crouching, aiming or slowing down to stop plays the walk clip; full speed plays the run.
      const pace =
        Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) / FIXED_DT / this.config.player.speed;
      if (pace < WALK_BELOW) this.walking.add(s.id);
      else if (pace > RUN_ABOVE) this.walking.delete(s.id);
      // While the player aims, the followers walk too, even when they hurry to catch up.
      const gait = (this.walking.has(s.id) || followerWalk(state, s.id)) && !drone ? 'walk' : 'run';
      view.setState(
        s.dead || s.downed ? 'death' : striking > 0 ? 'attack' : moving ? gait : 'idle',
      );
      const held =
        s.dead || s.downed || drone ? null : (s.equipment.rightHand ?? s.equipment.leftHand);
      view.hold?.(held);
      // Arms come up to the gun while it fires or aims, and drop back to the clip afterwards.
      const raised = Math.max(this.shotLeft.get(s.id) ?? 0, s.aiming ? 1 : 0);
      this.shotLeft.set(s.id, Math.max((this.shotLeft.get(s.id) ?? 0) - dt, 0));
      const wantRaise = held !== null && striking <= 0 && raised > 0 ? 1 : 0;
      const raise = lerp(
        this.gunRaise.get(s.id) ?? 0,
        wantRaise,
        1 - Math.exp(-GUN_RAISE_RATE * dt),
      );
      this.gunRaise.set(s.id, raise);
      view.aim?.(raise);
      view.update(dt);
      if (s.id === localPlayer(state).controlledId) {
        const speed = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) / FIXED_DT;
        this.viewModel.update(
          dt,
          this.viewMode === 'first' && s.vehicleId === null,
          held,
          s.aiming,
          s.reload !== null,
          Math.min(speed / this.config.player.speed, 1.5),
        );
      }
      this.updateFlashlight(s.id, view.object, heading, !s.dead);
      // In first person you look out of the controlled unit's head, so hide its model.
      view.object.visible =
        s.vehicleId === null &&
        !(this.viewMode === 'first' && s.id === localPlayer(state).controlledId);

      // Applied after the view's own update, which may reset its root transform.
      const ground = this.groundAt(view.object.position.x, view.object.position.z);
      view.object.position.y = ground + (drone ? this.droneHeight : lerp(s.prevY, s.y, alpha));
      const level = this.config.arena.terrain.water;
      if (s.swimming && level !== null) {
        // A swimmer floats on the surface or sinks with its depth, never below the sea floor.
        const x = view.object.position.x;
        const z = view.object.position.z;
        const surface = this.ocean
          ? oceanHeight(this.config.ocean, level, ground, x, z, state.time)
          : level;
        view.object.position.y = Math.max(ground, surface - SWIM_FLOAT - s.depth);
      }
      if (drone) continue;
      let vis = this.stanceVisual.get(s.id);
      if (!vis) {
        vis = { crouch: 0, lean: 0, swim: 0 };
        this.stanceVisual.set(s.id, vis);
      }
      const k = 1 - Math.exp(-14 * dt);
      const alive = !s.dead && !s.downed;
      const stance = s.swimming ? 'normal' : state.stance;
      vis.crouch = lerp(vis.crouch, alive && stance === 'crouch' ? 1 : 0, k);
      vis.lean = lerp(vis.lean, alive && stance === 'sprint' && moving ? 1 : 0, k);
      vis.swim = lerp(vis.swim, alive && s.swimming ? 1 : 0, k);
      view.object.scale.set(1 + 0.06 * vis.crouch, 1 - 0.28 * vis.crouch, 1 + 0.06 * vis.crouch);
      // A swimmer lies almost flat, face down.
      view.object.rotation.x = 0.25 * vis.lean + SWIM_PITCH * vis.swim;
    }
  }

  /** Spawns visuals for events produced by a simulation step. Call after each step. */
  onStep(state: GameState): void {
    for (const e of state.events) {
      if (e.type === 'shot') {
        this.effects.spawnShot(e.from, e.to, e.facing, e.height, e.hitZombieId !== null);
        this.shotLeft.set(e.shooterId, GUN_RAISED_TIME);
        if (e.shooterId === localPlayer(state).controlledId) {
          this.viewModel.kick(0.8 + e.cameraKick * 4);
          this.shake = Math.min(this.shake + SHOT_SHAKE + e.cameraKick, MAX_SHAKE);
        }
        if (e.hitZombieId !== null) {
          this.flash.set(e.hitZombieId, FLASH_TIME);
          // Blood flies on past the enemy, more for a head hit or a crit.
          if (this.goreEnabled) {
            this.gore.hitSpray(e.to.x, e.height, e.to.z, e.facing, e.hit?.kind === 'body' ? 1 : 2);
          }
        }
      } else if (e.type === 'structureShot') {
        const facing = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z);
        this.effects.spawnShot(e.from, e.to, facing, 1.6, e.hitZombieId !== null);
        if (e.hitZombieId !== null) this.flash.set(e.hitZombieId, FLASH_TIME);
      } else if (e.type === 'zombieKilled' && e.head) {
        this.loseHead(state, e);
      } else if (e.type === 'zombieKilled' && e.exploded && this.goreEnabled) {
        const size = this.config.enemies[e.enemy]?.radiusScale ?? 1;
        this.gore.burst(e.pos.x, e.pos.z, Math.min(Math.max(size, 0.8), 1.8));
      } else if (e.type === 'dismember') {
        this.loseLimb(e);
      } else if (e.type === 'melee') {
        this.strikeLeft.set(e.attackerId, STRIKE_TIME);
        if (e.hitZombieId !== null) this.flash.set(e.hitZombieId, FLASH_TIME);
        if (e.attackerId === localPlayer(state).controlledId) {
          this.shake = Math.min(this.shake + SHOT_SHAKE * 2, MAX_SHAKE);
        }
      } else if (e.type === 'vaporised') {
        this.orbViews.vaporise(e.pos);
      } else if (e.type === 'greyRay') {
        this.orbViews.greyRay(e.from, e.to, e.kind);
      } else if (e.type === 'explosion') {
        this.grenades.explode(e.pos, e.radius);
        this.shake = Math.min(this.shake + SHOT_SHAKE * 4, MAX_SHAKE);
      } else if (e.type === 'soldierHurt' && e.soldierId === localPlayer(state).controlledId) {
        this.shake = Math.min(this.shake + HURT_SHAKE, MAX_SHAKE);
      }
    }
  }

  /** Raycasts from the camera through a screen point onto the ground plane (y = 0). */
  screenToGround = (ndcX: number, ndcY: number): Vec2 | null => {
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.hit)) return null;
    const heights = this.config.arena.terrain.heights;
    if (!heights) return { x: this.hit.x, z: this.hit.z };
    // Hills: walk the ray from the camera and stop where it first dips under the ground.
    const { origin, direction } = this.raycaster.ray;
    const reach = origin.distanceTo(this.hit) + 60;
    const below = (d: number): boolean =>
      origin.y + direction.y * d <
      heightAt(heights, this.halfSize, origin.x + direction.x * d, origin.z + direction.z * d);
    let near = 0;
    let far = -1;
    for (let d = 1; d <= reach; d += 1) {
      if (below(d)) {
        far = d;
        break;
      }
      near = d;
    }
    if (far < 0) return { x: this.hit.x, z: this.hit.z };
    for (let i = 0; i < 12; i++) {
      const mid = (near + far) / 2;
      if (below(mid)) far = mid;
      else near = mid;
    }
    return { x: origin.x + direction.x * far, z: origin.z + direction.z * far };
  };

  /** A killing head hit: the head bursts or flies off, and the neck sprays for a moment. */
  private loseHead(state: GameState, e: Extract<SimEvent, { type: 'zombieKilled' }>): void {
    const entry = this.zombies.get(e.id);
    if (!entry?.view.removePart) return;
    const gore = this.goreEnabled;
    const cut = entry.view.removePart('head', { loose: gore && e.head === 'fly', stump: gore });
    if (!cut || !gore) return;
    const size = this.config.enemies[e.enemy]?.radiusScale ?? 1;
    entry.neckSpurt = NECK_SPURT_TIME;
    if (cut.loose) {
      // Away from the shooter, upwards, with some spread.
      const killer = state.soldiers.find((s) => s.id === e.killerId);
      const angle = killer
        ? Math.atan2(e.pos.x - killer.pos.x, e.pos.z - killer.pos.z)
        : Math.random() * Math.PI * 2;
      const away = angle + (Math.random() - 0.5) * 0.8;
      const speed = 3 + Math.random() * 3;
      this.looseParts.throw(
        cut.loose,
        new THREE.Vector3(Math.sin(away) * speed, 4 + Math.random() * 3, Math.cos(away) * speed),
        0.12,
      );
    } else {
      this.gore.headBurst(cut.at.x, cut.at.y, cut.at.z, Math.min(Math.max(size, 0.8), 1.8));
    }
  }

  /** A limb shot off a living enemy: the stump shows and the limb flies the way it was hit. */
  private loseLimb(e: Extract<SimEvent, { type: 'dismember' }>): void {
    const entry = this.zombies.get(e.zombieId);
    const cut = entry?.view.removePart?.(e.part, {
      loose: this.goreEnabled,
      stump: this.goreEnabled,
    });
    if (!cut || !this.goreEnabled) return;
    this.gore.spurt(cut.at.x, cut.at.y, cut.at.z, e.dir, 1);
    if (!cut.loose) return;
    const speed = 2 + Math.random() * 3;
    this.looseParts.throw(
      cut.loose,
      new THREE.Vector3(
        Math.sin(e.dir) * speed,
        2.5 + Math.random() * 2.5,
        Math.cos(e.dir) * speed,
      ),
      e.part === 'legs' ? LEG_REST : LIMB_REST,
    );
  }

  private syncZombies(state: GameState, alpha: number, dt: number): void {
    for (const z of state.zombies) {
      let entry = this.zombies.get(z.id);
      if (!entry) {
        const type = this.factories.enemies[z.type] ? z.type : 'zombie';
        const poolKey = z.boss ? `boss:${type}` : type;
        let view = this.pools.get(poolKey)?.pop();
        if (!view) {
          view = this.factories.enemies[type]!();
          if (z.boss) this.makeBoss(view.object, this.factories.barHeights[type] ?? 2.2);
        }
        view.setFlash?.(0);
        this.scene.add(view.object);
        entry = { poolKey, type, view, seenFrame: this.frame };
        // Born without legs: the hips end in stumps from the first frame.
        if (!z.parts.legs) view.removePart?.('legs', { loose: false, stump: this.goreEnabled });
        this.zombies.set(z.id, entry);
      }
      entry.seenFrame = this.frame;
      const { object } = entry.view;
      const zx = lerp(z.prev.x, z.pos.x, alpha);
      const zz = lerp(z.prev.z, z.pos.z, alpha);
      object.position.set(zx, this.groundAt(zx, zz) + z.y, zz);
      object.rotation.y = z.facing;
      const acrobat = this.config.enemies[entry.type]?.acrobat;
      if (acrobat) {
        // A hop turns the body once over: a cartwheel to the side, a somersault when straight up.
        const t = z.hopLeft > 0 ? 1 - z.hopLeft / acrobat.duration : 0;
        object.rotation.order = 'YXZ';
        object.rotation.x = z.hopSide === 0 ? -2 * Math.PI * t : 0;
        object.rotation.z = -z.hopSide * 2 * Math.PI * t;
      }
      object.scale.setScalar(z.size);
      if (!z.parts.legs && z.state !== 'death') {
        // No legs: it drags itself along on the ground, the torso pitched forward over its hips.
        object.rotation.order = 'YXZ';
        // Each pull of an arm drags the body: it rolls side to side and the nose dips.
        const pull = Math.sin(this.clock * CRAWL_RATE + z.id * 1.7);
        object.rotation.x = CRAWL_PITCH + pull * pull * CRAWL_DIP;
        object.rotation.z = pull * CRAWL_ROLL;
        object.position.x -= Math.sin(z.facing) * CRAWL_BACK * z.size;
        object.position.z -= Math.cos(z.facing) * CRAWL_BACK * z.size;
      }
      object.visible = !z.exploded;
      // A sleeping wanderer strolls (roam) or stands (idle); every other state plays as it is.
      entry.view.setState(
        z.mode === 'wander' && z.state === 'walk' ? (z.roam ? 'roam' : 'idle') : z.state,
      );
      // A body that finished falling long ago holds its pose; skip the skeleton work.
      if (z.state !== 'death' || z.deathTimer > CORPSE_SETTLED) entry.view.update(dt);
      const every = this.factories.spurts?.[entry.type];
      if (every !== undefined && this.goreEnabled && z.state !== 'death') {
        entry.spurtIn = (entry.spurtIn ?? every * Math.random()) - dt;
        if (entry.spurtIn <= 0) {
          entry.spurtIn = every * (0.6 + Math.random() * 0.8);
          this.gore.spurt(zx, 1.3 * z.size, zz, z.facing, z.size);
        }
      }

      if (entry.neckSpurt !== undefined && entry.neckSpurt > 0) {
        // The neck sinks with the body as it falls.
        const left = entry.neckSpurt - dt;
        entry.neckSpurt = left;
        if (Math.floor(left * 8) !== Math.floor((left + dt) * 8)) {
          const height = (1.5 - 1.1 * (1 - left / NECK_SPURT_TIME)) * z.size;
          this.gore.spurt(zx, this.groundAt(zx, zz) + height, zz, z.facing, z.size);
        }
      }

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
          object.position.y + (this.factories.barHeights[entry.type] ?? 2.2) * z.size,
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
      entry.view.restoreParts?.();
      entry.view.object.rotation.set(0, 0, 0);
      entry.neckSpurt = undefined;
      const pool = this.pools.get(entry.poolKey) ?? [];
      pool.push(entry.view);
      this.pools.set(entry.poolKey, pool);
      this.zombies.delete(id);
      this.healthBars.release(id);
      this.flash.delete(id);
    }
  }

  /**
   * Gives a model the mini boss look: much darker, with two glowing red eyes. The eyes are
   * placed from the model's head height (`headHeight`, the health bar height).
   */
  private makeBoss(root: THREE.Object3D, headHeight: number): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (m as THREE.MeshStandardMaterial).color?.multiplyScalar(BOSS_DARKEN);
      }
    });
    const k = headHeight / 2.2;
    const core = new THREE.SphereGeometry(0.06 * k, 10, 8);
    const halo = new THREE.SphereGeometry(0.13 * k, 10, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff2020,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.add(new THREE.Mesh(core, coreMat), new THREE.Mesh(halo, haloMat));
      eye.position.set(side * 0.1 * k, headHeight * 0.87, 0.22 * k);
      root.add(eye);
    }
    this.addPlates(root);
  }

  /** Armour plates on the chest and shoulders of a rigged marine (nothing on other models). */
  private addPlates(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const metal = new THREE.MeshStandardMaterial({
      color: 0x2b2f33,
      metalness: 0.7,
      roughness: 0.45,
    });
    const scale = new THREE.Vector3();
    const plates: [RegExp, [number, number, number], [number, number, number]][] = [
      [/^(mixamorig:?)?Spine2$/, [0.34, 0.3, 0.12], [0, 0.04, 0.1]],
      [/^(mixamorig:?)?LeftShoulder$/, [0.16, 0.1, 0.18], [0.1, 0.03, 0]],
      [/^(mixamorig:?)?RightShoulder$/, [0.16, 0.1, 0.18], [-0.1, 0.03, 0]],
    ];
    root.traverse((o) => {
      const plate = plates.find(([name]) => name.test(o.name));
      if (!plate) return;
      // The rig is in centimetres: undo the bone's world scale to size the plate in metres.
      o.getWorldScale(scale);
      const k = scale.x > 1e-6 ? 1 / scale.x : 1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...plate[1]), metal);
      mesh.scale.setScalar(k);
      mesh.position.set(...plate[2]).multiplyScalar(k);
      o.add(mesh);
    });
  }

  /** Applies the graphics options: shadows, shadow resolution, render resolution and gore. */
  applyGraphics(g: {
    shadows: boolean;
    shadowMapSize: number;
    resolutionScale: number;
    gore: boolean;
    parallax: number;
    textures: number;
    water: number;
    rainFx: boolean;
    clouds: number;
    filmic: boolean;
    reflect: number;
    lens: number;
  }): void {
    this.goreEnabled = g.gore;
    this.waterQuality = g.water;
    this.ocean?.setQuality(g.water);
    this.environment.setRainFx(g.rainFx);
    this.filmic = g.filmic;
    this.setReflectionQuality(g.reflect);
    this.setLensDrops(g.lens);
    this.renderer.toneMapping = g.filmic ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    // Octaves of the cloud noise: 3, 4 or 5 (0 keeps the puffs).
    this.environment.setCloudSteps(g.clouds === 0 ? 0 : g.clouds + 2);
    setPomQuality(g.parallax);
    setTextureQuality(g.textures);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * g.resolutionScale);
    // Below half resolution the picture is drawn in plain blocks instead of blurred.
    this.renderer.domElement.style.imageRendering = g.resolutionScale < 0.5 ? 'pixelated' : 'auto';
    this.resize();
    this.sun.castShadow = g.shadows;
    if (this.sun.shadow.mapSize.x !== g.shadowMapSize) {
      this.sun.shadow.mapSize.set(g.shadowMapSize, g.shadowMapSize);
      // The old shadow map has the wrong size; it is rebuilt on the next frame.
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  get isDark(): boolean {
    return this.dark;
  }

  /** Switches between normal lighting and the dark mode with a flashlight per soldier. */
  setDark(dark: boolean): void {
    this.dark = dark;
    this.environment.setDark(dark);
  }

  /** The sky, time of day, light colour and weather of the map. */
  /** The loaded vehicle model (null keeps the box jeep). Applies to vehicles drawn from now on. */
  setVehicleModel(model: THREE.Object3D | null): void {
    this.vehicleModel = model;
  }

  setEnvironment(env: Environment): void {
    this.environment.set(env);
    this.waterLook = env.water;
    this.ocean?.setLook(env.water);
    this.season = env.season;
    this.applySeason();
  }

  /** Tints the ground for the season: green spring, plain summer, orange autumn, white-blue winter snow. */
  private applySeason(): void {
    const ground = this.arenaGroup.getObjectByName('ground');
    if (!(ground instanceof THREE.Mesh)) return;
    const look = SEASONS[this.season];
    const m = ground.material as THREE.MeshStandardMaterial;
    m.color.setHex(look.tint);
    m.emissive.setHex(look.glow);
    m.emissiveIntensity = look.glow === 0 ? 0 : 0.35;
    patchGroundRain(m);
  }

  /** Gets the distance (m) of every lightning bolt, to play the thunder. */
  set onThunder(callback: ((distance: number) => void) | null) {
    this.environment.onStrike = callback;
  }

  /** The rain-on-the-lens option: 0 off, 1 beads that swell and dry, 2 plus running drops. */
  private setLensDrops(level: number): void {
    if (level <= 0) {
      this.lens?.dispose();
      this.lens = null;
      return;
    }
    this.lens ??= new LensDrops();
    this.lens.setDetail(level);
  }

  /** The water reflection option: 0 off, 1 a half-size mirror, 2 a full-size one. */
  private setReflectionQuality(q: number): void {
    const scale = q === 0 ? 0 : q === 1 ? 0.5 : 1;
    if (!scale) {
      this.reflection?.dispose();
      this.reflection = null;
      return;
    }
    if (this.reflection && this.reflectionScale === scale) return;
    this.reflection?.dispose();
    this.reflectionScale = scale;
    this.reflection = new WaterReflection(scale);
    this.resizeReflection();
  }

  private reflectionScale = 0;

  private resizeReflection(): void {
    if (!this.reflection) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.reflection.resize(size.x, size.y);
  }

  /** Draws the mirror of the world for the ocean, when there is an ocean and the option is on. */
  private drawWaterMirror(): void {
    const ocean = this.ocean;
    if (!ocean) return;
    const level = this.config.arena.terrain.water;
    if (!this.reflection || level === null || this.waterQuality === 0) {
      ocean.setReflection(null, new THREE.Matrix4());
      return;
    }
    this.camera.updateMatrixWorld();
    const drawn = this.reflection.render(
      this.renderer,
      this.scene,
      this.camera,
      level,
      ocean.object,
    );
    ocean.setReflection(drawn ? this.reflection.target.texture : null, this.reflection.matrix);
  }

  /** Swaps the flat water plane for the wave ocean when the map has the `ocean` rule (or back). */
  private syncOcean(arena: GameConfig['arena']): void {
    if (this.ocean) {
      this.scene.remove(this.ocean.object);
      this.ocean.dispose();
      this.ocean = null;
    }
    const level = arena.terrain.water;
    if (!this.config.oceanOn || level === null || !arena.terrain.heights) return;
    this.arenaGroup.getObjectByName('water')?.removeFromParent();
    this.ocean = new OceanView(arena, level, this.config.ocean);
    this.ocean.setQuality(this.waterQuality);
    if (this.waterLook) this.ocean.setLook(this.waterLook);
    this.scene.add(this.ocean.object);
  }

  /** A warm spotlight held at chest height, pointing at the ground ahead of the soldier. */
  private createFlashlight(): { group: THREE.Group; light: THREE.SpotLight } {
    const light = new THREE.SpotLight(
      0xfff0d0,
      FLASHLIGHT_INTENSITY,
      FLASHLIGHT_RANGE,
      FLASHLIGHT_ANGLE,
      0.6,
    );
    light.decay = 1.5;
    light.position.set(0, FLASHLIGHT_HEIGHT, 0.3);
    light.target.position.set(0, 0, FLASHLIGHT_REACH);
    const group = new THREE.Group();
    group.add(light, light.target);
    this.scene.add(group);
    return { group, light };
  }

  /**
   * Keeps a flashlight on its soldier. It lives outside the model's group so it keeps
   * shining in first person, when the model itself is hidden.
   */
  private updateFlashlight(id: number, unit: THREE.Object3D, heading: number, on: boolean): void {
    const lamp = this.flashlights.get(id);
    if (!lamp) return;
    lamp.group.position.set(unit.position.x, 0, unit.position.z);
    lamp.group.rotation.y = heading;
    // Dimming to zero (not hiding) keeps the light count, and so the shaders, unchanged.
    lamp.light.intensity =
      on && this.environment.isNight && !this.config.skyShowOn ? FLASHLIGHT_INTENSITY : 0;
  }

  private addLights(halfSize: number): void {
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30343a, DAY_AMBIENT);
    this.scene.add(this.hemi);
    const sun = this.sun;
    sun.intensity = DAY_SUN;
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
    this.resizeReflection();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(w / h);
  };
}

/**
 * A sky-and-ground gradient baked once into a prefiltered cube map: the reflection source for
 * metal, glass, wet floors and the soldiers' gear. EnvironmentView scales its strength with the
 * daylight, so the same map serves day and night.
 */
function buildReflectionMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(50, 32, 16);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const stops: [number, number][] = [
    [-1, 0x3b3f3a],
    [-0.05, 0x7a8088],
    [0.05, 0xd2e2f2],
    [0.5, 0x7fb0e6],
    [1, 0x3f7fd0],
  ];
  const color = new THREE.Color();
  const low = new THREE.Color();
  const high = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / 50;
    let k = 1;
    while (k < stops.length - 1 && t > stops[k]![0]) k++;
    const [t0, c0] = stops[k - 1]!;
    const [t1, c1] = stops[k]!;
    low.set(c0);
    high.set(c1);
    color.copy(low).lerp(high, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }),
    ),
  );
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(5, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2d0 }),
  );
  sun.position.set(25, 30, 20);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return texture;
}
