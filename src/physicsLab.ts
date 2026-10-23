import './physicsLab.css';
import type * as THREE from 'three';
import {
  createRng,
  heightAt,
  nextFloat,
  type Arena,
  type GameConfig,
  type GameState,
  type Vec2,
} from './sim';
import { NODES, NODE_COUNT } from './sim/physics/ragdoll';
import {
  BALL_MASS,
  BALL_RADIUS,
  BODY_CAPACITY,
  BOX_HALF,
  BOX_MASS,
  DEFAULT_RAPIER_PARAMS,
  type RapierParams,
} from './sim/physics/bodies';
import type { RapierWorld } from './sim/physics/rapierWorld';
import type { CharacterFactories } from './render/assetLoader';
import { PhysicsHands } from './physicsHands';
import { PhysicsLabView } from './render/physicsLabView';
import { RIGS, RagdollRig } from './render/ragdollRig';

/** Where the lab drops things: in front of this unit. */
export interface LabAnchor {
  x: number;
  z: number;
  facing: number;
}

/** How far in front of the soldier the lab drops things (m). */
const AHEAD = 10;
/** The most zombie models the lab keeps alive at once (each is a full skinned mesh). */
const MAX_DRESSED = 12;
/** The golden angle (rad): successive points of a Vogel spiral never line up. */
const GOLDEN_ANGLE = 2.3999632297;
/** Spacing of the Vogel spiral the lab drops balls and boxes on (m per square root of the index). */
const SPIRAL = 1.1;
/** Side of the square box pyramid (boxes on the floor): 6 makes 91 boxes. */
const PYRAMID_BASE = 6;

interface SliderDef {
  key: keyof RapierParams;
  label: string;
  min: number;
  max: number;
  step: number;
  /** The slider is on a log10 scale (stiffness spans decades). */
  log?: boolean;
  digits: number;
}

const SLIDERS: SliderDef[] = [
  { key: 'gravity', label: 'Gravedad', min: 0, max: 40, step: 0.5, digits: 1 },
  { key: 'restitution', label: 'Rebote', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'friction', label: 'Fricción', min: 0, max: 1.5, step: 0.05, digits: 2 },
  { key: 'linearDamping', label: 'Amort. lineal', min: 0, max: 2, step: 0.05, digits: 2 },
  { key: 'angularDamping', label: 'Amort. angular', min: 0, max: 5, step: 0.1, digits: 1 },
  { key: 'solverIterations', label: 'Iter. solver', min: 1, max: 40, step: 1, digits: 0 },
  { key: 'blastPower', label: 'Fuerza explosión', min: 0, max: 800, step: 10, digits: 0 },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  parent: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/**
 * The physics lab of Map 12: Rapier (`src/sim/physics/rapierWorld.ts`, the deterministic build)
 * stepped alongside the game, drawn into the game's scene, with a panel to drop balls, boxes and
 * ragdolls and turn the numbers live. Rapier and its WASM are loaded the first time Map 12 opens.
 * The marine zombie ragdolls wear the real model of `data/characters.json`.
 */
export class PhysicsLab {
  private world: RapierWorld | null = null;
  private loading = false;
  /** The arena the static colliders were built from. */
  private builtFor: Arena | null = null;
  private readonly view = new PhysicsLabView(BODY_CAPACITY);
  private readonly hands = new PhysicsHands();
  private readonly panel: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly noteNode: HTMLElement;
  private readonly rng = createRng(12);
  private active = false;
  private paused = false;
  private stepOnce = false;
  private stepMs = 0;
  private hashAge = 0;
  /** What the sliders hold; written into the world when it loads and on every change. */
  private readonly params: RapierParams = { ...DEFAULT_RAPIER_PARAMS };

  constructor(
    scene: THREE.Scene,
    parent: HTMLElement,
    private readonly factories: CharacterFactories,
    private readonly arena: () => Arena,
    private readonly anchor: () => LabAnchor | null,
    /** The game's one gravity: the lab reads it every step and its slider writes it. */
    private readonly gravity: { get: () => number; set: (v: number) => void },
  ) {
    scene.add(this.view.group);
    this.view.group.visible = false;

    this.panel = el('div', parent);
    this.panel.id = 'physics-lab';
    this.panel.style.display = 'none';
    el('h2', this.panel, 'Laboratorio de física (Map 12)');
    el('div', this.panel, 'Rapier. Esc libera el mouse. Todo cae delante del soldado.');

    el('h3', this.panel, 'Soltar');
    const drop = el('div', this.panel);
    drop.className = 'row';
    this.button(drop, '+100 bolas', () => this.balls(100));
    this.button(drop, '+1000 bolas', () => this.balls(1000));
    const crates = el('div', this.panel);
    crates.className = 'row';
    this.button(crates, 'Pirámide de cajas', () => this.pyramid());
    this.button(crates, '+30 cajas', () => this.looseBoxes(30));
    const dolls = el('div', this.panel);
    dolls.className = 'row';
    this.button(dolls, 'Zombie marine', () => this.ragdoll('marine_zombie'));
    this.button(dolls, 'Ragdoll sin modelo', () => this.ragdoll(null));
    const fx = el('div', this.panel);
    fx.className = 'row';
    this.button(fx, 'Explosión', () => this.blast());
    this.button(fx, '5 zombies + explosión', () => this.pileAndBlast());

    el('h3', this.panel, 'Física');
    for (const def of SLIDERS) this.slider(def);

    el('h3', this.panel, 'Control');
    const ctl = el('div', this.panel);
    ctl.className = 'row';
    const pause = this.button(ctl, 'Pausa', () => {
      this.paused = !this.paused;
      pause.textContent = this.paused ? 'Seguir' : 'Pausa';
    });
    this.button(ctl, 'Un paso', () => {
      this.paused = true;
      pause.textContent = 'Seguir';
      this.stepOnce = true;
    });
    const clear = this.button(ctl, 'Reiniciar', () => this.reset());
    clear.className = 'danger';
    const debug = el('label', this.panel);
    debug.className = 'check';
    const box = el('input', debug);
    box.type = 'checkbox';
    box.addEventListener('change', () => this.view.setDebug(box.checked));
    el('span', debug, 'Ver cuerpos (cápsulas) bajo los modelos');

    this.stats = el('div', this.panel);
    this.stats.className = 'stats';
    this.noteNode = el('div', this.panel);
    this.noteNode.className = 'note';
  }

  /** Turns the lab on or off with the map (Map 12 has the `physicsLab` rule). */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.panel.style.display = on ? 'block' : 'none';
    this.view.group.visible = on;
    this.reset();
    if (on && !this.world && !this.loading) void this.load();
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Loads Rapier (a separate chunk with its WASM) the first time the lab opens. */
  private async load(): Promise<void> {
    this.loading = true;
    this.note('Cargando Rapier…');
    try {
      const { RapierWorld } = await import('./sim/physics/rapierWorld');
      this.world = await RapierWorld.create();
      Object.assign(this.world.params, this.params);
      this.note('');
    } catch (e) {
      this.note(`No se pudo cargar Rapier: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.loading = false;
    }
  }

  /** Clears every body and model. */
  reset(): void {
    this.view.clear();
    this.world?.clear();
    this.hands.clear();
    this.note(this.loading ? 'Cargando Rapier…' : '');
  }

  /** The world, with its fixed scenery built from the current map. */
  private ready(): RapierWorld | null {
    const w = this.world;
    if (!w) return null;
    const arena = this.arena();
    if (this.builtFor !== arena) {
      w.setArena(arena);
      this.builtFor = arena;
    }
    return w;
  }

  /** E: lifts the closest body over the head, or drops it. A string is a message; true, the key was used here. */
  grab(state: GameState, unitId: number): string | boolean {
    const w = this.active ? this.ready() : null;
    if (!w) return false;
    const r = this.hands.grab(w, state, unitId, this.arena());
    return r.notice ?? r.handled;
  }

  /** G: drags the closest body on a rope, or lets go. Returns a message when it cannot. */
  drag(state: GameState, unitId: number): string | null {
    const w = this.active ? this.ready() : null;
    return w ? this.hands.drag(w, state, unitId, this.arena()) : null;
  }

  /** Lets go of a dragged body; false when none was dragged. */
  releaseDrag(): boolean {
    return this.hands.releaseDrag();
  }

  /** The fire button: throws what is held. True when the press was used and the gun must not fire. */
  fire(pressed: boolean, aim: Vec2, state: GameState): boolean {
    return this.active && this.hands.fire(pressed, aim, state);
  }

  /** One fixed step of the game: blasts of the sim become blasts of the lab, the hands act, then the lab steps. */
  step(state: GameState, config: GameConfig): void {
    if (!this.active) return;
    const w = this.ready();
    if (!w) return;
    const arena = this.arena();
    for (const e of state.events) {
      if (e.type !== 'explosion') continue;
      const y = heightAt(arena.terrain.heights, arena.halfSize, e.pos.x, e.pos.z);
      w.explosion(e.pos.x, y + 0.5, e.pos.z, Math.max(e.radius, 6));
    }
    if (this.paused && !this.stepOnce) return;
    this.stepOnce = false;
    w.params.gravity = this.gravity.get();
    // The Map 13 ocean: bodies float on the same waves the water shader draws.
    const sea = arena.terrain.water;
    w.ocean =
      config.oceanOn && sea !== null
        ? {
            params: config.ocean,
            level: sea,
            groundAt: (x, z) => heightAt(arena.terrain.heights, arena.halfSize, x, z),
          }
        : null;
    w.oceanTime = state.time;
    this.hands.control(w, state, config, arena);
    const t0 = performance.now();
    w.step();
    this.stepMs += (performance.now() - t0 - this.stepMs) * 0.1;
    this.hands.publish(w, arena);
  }

  /** Once per frame: the meshes follow the bodies and the numbers refresh. */
  render(dt: number): void {
    const w = this.world;
    if (!this.active || !w) return;
    this.view.update(w);
    this.hashAge += dt;
    if (this.hashAge > 0.5) {
      this.hashAge = 0;
      this.stats.textContent = [
        `cuerpos     ${w.count} / ${w.capacity}`,
        `dormidos    ${w.sleeping}`,
        `modelos     ${this.view.dressedCount} / ${MAX_DRESSED}`,
        `paso física ${this.stepMs.toFixed(2)} ms`,
        `hash        ${w.stateHash().toString(16).padStart(8, '0')}`,
      ].join('\n');
    }
  }

  private note(text: string): void {
    this.noteNode.textContent = text;
  }

  private button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', parent, label);
    b.addEventListener('click', onClick);
    return b;
  }

  private slider(def: SliderDef): void {
    const row = el('label', this.panel);
    el('span', row, def.label);
    const input = el('input', row);
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    const value = el('span', row);
    value.className = 'value';
    const show = (): void => {
      value.textContent = this.valueOf(def.key).toFixed(def.digits);
    };
    input.value = String(this.valueOf(def.key));
    show();
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (def.key === 'gravity') this.gravity.set(v);
      else {
        this.params[def.key] = v;
        if (this.world) this.world.params[def.key] = v;
      }
      show();
    });
  }

  /** The current value of a slider: gravity comes from the game, the rest from the world. */
  private valueOf(key: keyof RapierParams): number {
    return key === 'gravity' ? this.gravity.get() : this.params[key];
  }

  /** The spot in front of the soldier where things appear, and the ground height there. */
  private spot(): { x: number; y: number; z: number; yaw: number } | null {
    const a = this.anchor();
    if (!a) return null;
    const arena = this.arena();
    const lim = arena.halfSize - 3;
    const x = Math.min(Math.max(a.x + Math.sin(a.facing) * AHEAD, -lim), lim);
    const z = Math.min(Math.max(a.z + Math.cos(a.facing) * AHEAD, -lim), lim);
    return {
      x,
      z,
      y: heightAt(arena.terrain.heights, arena.halfSize, x, z),
      yaw: a.facing + Math.PI,
    };
  }

  private balls(count: number): void {
    const s = this.spot();
    const w = this.ready();
    if (!s || !w) return;
    let made = 0;
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(i) * SPIRAL;
      const a = i * GOLDEN_ANGLE;
      const id = w.addBall(
        s.x + Math.cos(a) * r,
        s.y + 14 + i * 0.03,
        s.z + Math.sin(a) * r,
        BALL_RADIUS,
        BALL_MASS,
        [0, -6, 0],
      );
      if (id < 0) break;
      made++;
    }
    this.note(made < count ? 'Sin espacio: Reiniciar libera el pool.' : '');
  }

  private pyramid(): void {
    const s = this.spot();
    const w = this.ready();
    if (!s || !w) return;
    const d = BOX_HALF * 2;
    for (let layer = 0; layer < PYRAMID_BASE; layer++) {
      const side = PYRAMID_BASE - layer;
      const half = ((side - 1) * d) / 2;
      for (let i = 0; i < side; i++)
        for (let j = 0; j < side; j++)
          if (
            w.addBox(
              s.x - half + i * d,
              s.y + BOX_HALF + 0.005 + layer * (d + 0.005),
              s.z - half + j * d,
              BOX_HALF,
              BOX_HALF,
              BOX_HALF,
              s.yaw,
            ) < 0
          ) {
            this.note('Sin espacio: Reiniciar libera el pool.');
            return;
          }
    }
  }

  /** Boxes of random size dropped turned at random, to tumble and pile up. */
  private looseBoxes(count: number): void {
    const s = this.spot();
    const w = this.ready();
    if (!s || !w) return;
    for (let i = 0; i < count; i++) {
      const hx = 0.3 + nextFloat(this.rng) * 0.5;
      const hy = 0.3 + nextFloat(this.rng) * 0.5;
      const hz = 0.3 + nextFloat(this.rng) * 0.5;
      const mass = (BOX_MASS * (hx * hy * hz)) / (BOX_HALF * BOX_HALF * BOX_HALF);
      const r = Math.sqrt(i) * SPIRAL;
      const a = i * GOLDEN_ANGLE;
      if (
        w.addBox(
          s.x + Math.cos(a) * r,
          s.y + 5 + i * 0.4,
          s.z + Math.sin(a) * r,
          hx,
          hy,
          hz,
          nextFloat(this.rng) * Math.PI,
          mass,
        ) < 0
      ) {
        this.note('Sin espacio: Reiniciar libera el pool.');
        return;
      }
    }
  }

  /** Drops one ragdoll; `id` null is the plain capsules (no model, shown as cylinders). */
  private ragdoll(id: string | null, offset = 0): void {
    const s = this.spot();
    const w = this.ready();
    if (!s || !w) return;
    const x = s.x + offset;
    const y = s.y + 3;
    const jitter = { rng: this.rng, speed: 0.8 };
    if (id === null) {
      const cos = Math.cos(s.yaw);
      const sin = Math.sin(s.yaw);
      const pose = new Float32Array(NODE_COUNT * 3);
      NODES.forEach((n, i) => {
        const [rx, ry, rz] = n.rest;
        pose[i * 3] = x + rx * cos + rz * sin;
        pose[i * 3 + 1] = y + ry;
        pose[i * 3 + 2] = s.z - rx * sin + rz * cos;
      });
      if (!w.addRagdoll(pose, 1, { yaw: s.yaw, jitter })) this.note('Sin espacio: Reiniciar.');
      return;
    }
    if (this.view.dressedCount >= MAX_DRESSED) {
      this.note(`Máximo ${MAX_DRESSED} modelos: Reiniciar.`);
      return;
    }
    const spec = RIGS[id];
    const factory = this.factories.enemies[id];
    if (!spec || !factory) return;
    const view = factory();
    const rig = RagdollRig.create(view.object, spec);
    if (!rig) {
      this.note(`El modelo "${id}" no tiene los huesos esperados.`);
      return;
    }
    const pose = rig.poseAt(x, y, s.z, s.yaw, 0.15);
    const doll = w.addRagdoll(pose, rig.scale, {
      torsoRadius: rig.thickness * 0.8,
      yaw: s.yaw,
      jitter,
    });
    if (!doll) {
      this.note('Sin espacio: Reiniciar libera el pool.');
      return;
    }
    this.view.dress(rig, view, doll, w.group[doll.bodies[0]!]!);
  }

  private blast(): void {
    const s = this.spot();
    const w = this.ready();
    if (!s || !w) return;
    w.explosion(s.x, s.y + 0.5, s.z, 14);
  }

  private pileAndBlast(): void {
    for (let i = 0; i < 5; i++) this.ragdoll('marine_zombie', (i - 2) * 1.4);
    this.blast();
  }
}
