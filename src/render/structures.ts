import * as THREE from 'three';
import {
  doorRulesOf,
  footprint,
  structureDef,
  type GameConfig,
  type GameState,
  type Structure,
} from '../sim';
import type { HealthBars } from './healthBars';

/** Id offset in the shared health bars so a structure never clashes with a unit or a vehicle. */
const BAR_BASE = -1_000_000;
/** A shutter rolled fully up still shows this share of its height. */
const SHUTTER_REST = 0.06;
const BLUEPRINT_OPACITY = 0.35;

export interface BuildGhost {
  type: string;
  x: number;
  z: number;
  turns: number;
  valid: boolean;
}

interface Entry {
  group: THREE.Group;
  body: THREE.Mesh;
  /** The second leaf of a double door. */
  leafB: THREE.Mesh | null;
  /** A small status light: red locked, amber unpowered, green on or powered. */
  lamp: THREE.Mesh | null;
  barrel: THREE.Mesh | null;
  stripes: THREE.Mesh[];
  built: boolean;
  level: number;
}

const box = new THREE.BoxGeometry(1, 1, 1);

/** Draws the structures of the state as plain boxes (blueprints are ghosts that fill as they are built). */
export class StructureViews {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private ghost: THREE.Mesh | null = null;

  constructor(
    private readonly config: GameConfig,
    private readonly groundAt: (x: number, z: number) => number,
    private readonly bars: HealthBars,
  ) {}

  setGhost(g: BuildGhost | null): void {
    if (!g) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(
        box,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
      );
      this.group.add(this.ghost);
    }
    const def = this.config.structures.types[g.type];
    if (!def) return;
    const { halfW, halfD } = footprint(this.config, g.type, g.turns);
    this.ghost.visible = true;
    this.ghost.scale.set(halfW * 2, def.height, halfD * 2);
    this.ghost.position.set(g.x, this.groundAt(g.x, g.z) + def.height / 2, g.z);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(g.valid ? 0x40ff70 : 0xff4040);
  }

  private create(s: Structure): Entry {
    const def = structureDef(this.config, s);
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: def.color });
    const body = new THREE.Mesh(box, material);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    let barrel: THREE.Mesh | null = null;
    if (def.turret || def.post) {
      barrel = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x222222 }));
      barrel.scale.set(0.14, 0.14, 0.9);
      group.add(barrel);
    }
    this.group.add(group);
    let leafB: THREE.Mesh | null = null;
    if (def.door && doorRulesOf(def).look === 'double') {
      leafB = new THREE.Mesh(box, material);
      leafB.castShadow = true;
      group.add(leafB);
    }
    let lamp: THREE.Mesh | null = null;
    if (def.door || def.switch) {
      lamp = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x000000 }));
      lamp.scale.set(0.18, 0.18, 0.18);
      group.add(lamp);
    }
    return { group, body, leafB, lamp, barrel, stripes: [], built: !s.built, level: 0 };
  }

  update(state: GameState, camera: THREE.Camera): void {
    const live = new Set<number>();
    for (const s of state.structures) {
      live.add(s.id);
      const def = structureDef(this.config, s);
      let e = this.entries.get(s.id);
      if (!e) {
        e = this.create(s);
        this.entries.set(s.id, e);
      }
      const { halfW, halfD } = footprint(this.config, s.type, s.turns);
      const ground = this.groundAt(s.x, s.z);
      const material = e.body.material as THREE.MeshStandardMaterial;
      if (e.built !== s.built) {
        e.built = s.built;
        material.transparent = !s.built;
        material.opacity = s.built ? 1 : BLUEPRINT_OPACITY;
        material.needsUpdate = true;
      }
      // A blueprint rises with the work done.
      const done = s.built ? 1 : Math.max(0.1, s.progress / def.buildWork);
      const height = def.height * done;
      if (def.door) this.poseDoor(e, s, def, halfW, halfD, ground, height);
      else {
        e.body.scale.set(halfW * 2, height, halfD * 2);
        e.body.position.set(s.x, ground + height / 2, s.z);
      }
      if (e.lamp) {
        e.lamp.visible = s.built;
        e.lamp.position.set(s.x, ground + height + 0.15, s.z);
        const rules = def.door ? doorRulesOf(def) : null;
        const color =
          s.lock !== null
            ? 0xff3030
            : def.switch
              ? s.open
                ? 0x40ff70
                : 0xff3030
              : rules?.powered
                ? s.open
                  ? 0x40ff70
                  : 0xffb020
                : null;
        e.lamp.visible = s.built && color !== null;
        if (color !== null) (e.lamp.material as THREE.MeshBasicMaterial).color.set(color);
      }
      if (e.barrel) {
        e.barrel.visible = s.built && (def.turret !== undefined || s.crew !== null);
        e.barrel.position.set(
          s.x + Math.sin(s.facing) * 0.5,
          ground + def.height + 0.1,
          s.z + Math.cos(s.facing) * 0.5,
        );
        e.barrel.rotation.y = s.facing;
      }
      // One small lighter block on top per level above the first.
      if (e.level !== s.level) {
        e.level = s.level;
        for (const m of e.stripes) e.group.remove(m);
        e.stripes = [];
        for (let i = 1; i < s.level; i++) {
          const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0xffd24a }));
          m.scale.set(0.18, 0.18, 0.18);
          e.group.add(m);
          e.stripes.push(m);
        }
      }
      e.stripes.forEach((m, i) => {
        m.position.set(s.x - 0.25 + i * 0.3, ground + def.height + 0.3, s.z);
      });
      // A bar shows while it is damaged or being built.
      const ratio = s.built ? s.health / s.maxHealth : s.progress / def.buildWork;
      if (ratio < 0.999) {
        this.bars.show(
          BAR_BASE - s.id,
          s.x,
          ground + def.height + 0.8,
          s.z,
          Math.max(1.2, halfW * 2),
          ratio,
          camera,
        );
      } else this.bars.hide(BAR_BASE - s.id);
    }
    for (const [id, e] of this.entries) {
      if (live.has(id)) continue;
      this.group.remove(e.group);
      if (e.body.material instanceof THREE.Material) e.body.material.dispose();
      this.bars.release(BAR_BASE - id);
      this.entries.delete(id);
    }
  }

  /**
   * Places the leaf (or leaves) of a door for its openness: a swing door turns on a hinge at one
   * end, a sliding one moves along the wall, a double one parts in two, a shutter rolls up.
   */
  private poseDoor(
    e: Entry,
    s: Structure,
    def: GameConfig['structures']['types'][string],
    halfW: number,
    halfD: number,
    ground: number,
    height: number,
  ): void {
    const rules = doorRulesOf(def);
    const alongX = halfW >= halfD;
    const length = 2 * Math.max(halfW, halfD);
    const thick = 2 * Math.min(halfW, halfD);
    const ax = alongX ? 1 : 0;
    const az = alongX ? 0 : 1;
    // Perpendicular to the wall: a swing door opens towards this side.
    const px = -az;
    const pz = ax;
    const o = s.built ? s.openness : 0;
    const place = (
      mesh: THREE.Mesh,
      len: number,
      cx: number,
      cz: number,
      dx: number,
      dz: number,
      h = height,
      y = 0,
    ): void => {
      mesh.scale.set(len, h, thick);
      mesh.position.set(cx, ground + y + h / 2, cz);
      mesh.rotation.y = Math.atan2(-dz, dx);
    };
    switch (rules.look) {
      case 'swing': {
        const angle = (o * Math.PI) / 2;
        const dx = ax * Math.cos(angle) + px * Math.sin(angle);
        const dz = az * Math.cos(angle) + pz * Math.sin(angle);
        const hx = s.x - (ax * length) / 2;
        const hz = s.z - (az * length) / 2;
        place(e.body, length, hx + (dx * length) / 2, hz + (dz * length) / 2, dx, dz);
        break;
      }
      case 'slide':
        place(e.body, length, s.x + ax * length * o * 0.95, s.z + az * length * o * 0.95, ax, az);
        break;
      case 'double': {
        const half = length / 2;
        const out = half * o * 0.95;
        place(e.body, half, s.x - ax * (half / 2 + out), s.z - az * (half / 2 + out), ax, az);
        if (e.leafB) {
          place(e.leafB, half, s.x + ax * (half / 2 + out), s.z + az * (half / 2 + out), ax, az);
        }
        break;
      }
      case 'shutter': {
        const h = Math.max(height * SHUTTER_REST, height * (1 - o));
        place(e.body, length, s.x, s.z, ax, az, h, height - h);
        break;
      }
    }
  }

  /** Drops every structure view (a new run or map). */
  clear(): void {
    for (const [id, e] of this.entries) {
      this.group.remove(e.group);
      this.bars.release(BAR_BASE - id);
    }
    this.entries.clear();
  }
}
