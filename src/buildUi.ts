import './build.css';
import {
  ammoRefillCost,
  doorInReach,
  refillWithGold,
  footprint,
  getStructure,
  localPlayer,
  orderBuild,
  placeStructure,
  placementError,
  removeStructure,
  repairCost,
  repairStructure,
  structureDef,
  toggleDoor,
  upgradeCost,
  upgradeStructure,
  type GameConfig,
  type GameState,
  type Structure,
  type Vec2,
} from './sim';
import type { BuildGhost } from './render/structures';

/** Placement snaps to this grid (metres), so walls line up. */
const SNAP = 0.25;
/** In direct control a structure can go at most this far from the soldier (metres). */
const QUICK_REACH = 8;
/** Slack (metres) when clicking a structure to select it. */
const PICK_SLACK = 0.3;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/**
 * The build menu (key N): pick a structure, a green or red ghost follows the cursor, click to
 * place a blueprint, R turns it, Esc or a right click puts it away. With the menu open and
 * nothing picked, clicking a structure shows its upgrade, repair, door and remove buttons.
 */
export class BuildUi {
  private readonly root = el('div', 'bld');
  private readonly note = el('div', 'bld__note', this.root);
  private readonly info = el('div', 'bld__info', this.root);
  private readonly bar = el('div', 'bld__bar', this.root);
  private open = false;
  private armed: string | null = null;
  private turns = 0;
  private selectedId: number | null = null;
  private shown = '';
  private message = '';
  private messageUntil = 0;

  constructor(
    parent: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly config: GameConfig,
    private readonly getState: () => GameState,
    /** The ground point under the cursor (or where the player looks). */
    private readonly pointer: () => Vec2 | null,
    /** The soldiers selected in RTS mode. */
    private readonly selection: () => number[],
  ) {
    parent.appendChild(this.root);
    window.addEventListener('mousedown', this.onMouseDown, true);
  }

  /** True while a structure is picked: clicks place it instead of selecting or shooting. */
  get isArmed(): boolean {
    return this.open && this.armed !== null;
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (!this.config.build) {
      this.say('Building is off on this map');
      return;
    }
    this.open = !this.open;
    if (!this.open) this.disarm();
    this.shown = '';
  }

  close(): void {
    this.open = false;
    this.disarm();
    this.shown = '';
  }

  private disarm(): void {
    this.armed = null;
    this.selectedId = null;
  }

  /** Esc: put the picked structure away first, then close the menu. Returns whether it did anything. */
  cancel(): boolean {
    if (!this.open) return false;
    if (this.armed !== null || this.selectedId !== null) this.disarm();
    else this.open = false;
    this.shown = '';
    return true;
  }

  rotate(): void {
    this.turns = (this.turns + 1) % 4;
  }

  private say(text: string): void {
    this.message = text;
    this.messageUntil = performance.now() + 2500;
    this.shown = '';
  }

  /** Where the structure would stand: snapped, and near the soldier in direct control. */
  private target(): Vec2 | null {
    const p = this.pointer();
    if (!p) return null;
    const state = this.getState();
    const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
    let { x, z } = p;
    if (unit) {
      const d = Math.hypot(x - unit.pos.x, z - unit.pos.z);
      if (d > QUICK_REACH) {
        x = unit.pos.x + ((x - unit.pos.x) / d) * QUICK_REACH;
        z = unit.pos.z + ((z - unit.pos.z) / d) * QUICK_REACH;
      }
    }
    return { x: Math.round(x / SNAP) * SNAP, z: Math.round(z / SNAP) * SNAP };
  }

  private structureAt(p: Vec2): Structure | undefined {
    return this.getState().structures.find((s) => {
      const f = footprint(this.config, s.type, s.turns);
      return (
        Math.abs(p.x - s.x) <= f.halfW + PICK_SLACK && Math.abs(p.z - s.z) <= f.halfD + PICK_SLACK
      );
    });
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.open || e.target !== this.canvas) return;
    if (e.button === 2 && this.armed !== null) {
      // Only drop the pick: the camera still gets the right button.
      this.armed = null;
      this.shown = '';
      return;
    }
    if (e.button !== 0) return;
    const state = this.getState();
    if (state.status !== 'playing') return;
    const at = this.target();
    if (!at) return;
    if (this.armed === null) {
      // Nothing picked: a click on a structure selects it, any other click goes on (RTS selection).
      const hit = this.structureAt(at);
      if (!hit) {
        if (this.selectedId !== null) this.shown = '';
        this.selectedId = null;
        return;
      }
      e.stopImmediatePropagation();
      this.selectedId = hit.id;
      this.shown = '';
      return;
    }
    e.stopImmediatePropagation();
    const why = placementError(state, this.config, this.armed, at.x, at.z, this.turns);
    if (why) {
      this.say(why);
      return;
    }
    const made = placeStructure(state, this.config, this.armed, at.x, at.z, this.turns);
    if (!made) return;
    // Selected soldiers go to work; with none selected, the closest two do.
    const controlled = localPlayer(state).controlledId;
    let workers = this.selection();
    if (workers.length === 0) {
      const dist = (s: { pos: Vec2 }) => Math.hypot(s.pos.x - at.x, s.pos.z - at.z);
      workers = state.soldiers
        .filter((s) => !s.dead && s.kind === 'soldier' && s.id !== controlled)
        .sort((a, b) => dist(a) - dist(b))
        .slice(0, 2)
        .map((s) => s.id);
    }
    orderBuild(state, workers, made.id);
    this.say(`${structureDef(this.config, made).name} blueprint placed`);
  };

  /** The ghost for the renderer, or null. Call every frame. */
  ghost(): BuildGhost | null {
    if (!this.isArmed || this.armed === null) return null;
    const at = this.target();
    if (!at) return null;
    const ok =
      placementError(this.getState(), this.config, this.armed, at.x, at.z, this.turns) === null;
    return { type: this.armed, x: at.x, z: at.z, turns: this.turns, valid: ok };
  }

  /** E next to a door opens or closes it. Returns true if there was one. */
  useDoor(): boolean {
    const state = this.getState();
    const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
    const door = unit ? doorInReach(state, this.config, unit.pos) : undefined;
    return door ? toggleDoor(state, this.config, door.id, unit?.id) : false;
  }

  /** Redraws the panel when something it shows changed. Call every frame. */
  update(): void {
    this.root.classList.toggle('bld--open', this.open);
    if (!this.open) return;
    const state = this.getState();
    const sel = this.selectedId === null ? undefined : getStructure(state, this.selectedId);
    if (this.selectedId !== null && !sel) this.selectedId = null;
    const text = performance.now() < this.messageUntil ? this.message : this.hint();
    const key = [
      this.armed,
      sel
        ? `${sel.id}:${sel.level}:${sel.built}:${sel.open}:${Math.ceil(sel.health)}:${sel.ammo}`
        : '',
      state.gold,
      text,
    ].join('|');
    if (key === this.shown) return;
    this.shown = key;
    this.note.textContent = text;
    this.bar.replaceChildren();
    for (const [id, def] of Object.entries(this.config.structures.types)) {
      const b = el('button', 'bld__btn', this.bar, def.name);
      b.classList.toggle('bld__btn--on', this.armed === id);
      b.disabled = state.gold < def.cost;
      el('span', 'bld__cost', b, `${def.cost} gold`);
      b.addEventListener('click', () => {
        this.armed = this.armed === id ? null : id;
        this.selectedId = null;
        this.shown = '';
      });
    }
    this.info.replaceChildren();
    this.info.style.display = sel ? 'flex' : 'none';
    if (!sel) return;
    const def = structureDef(this.config, sel);
    const label = `${def.name} L${sel.level}  ${Math.ceil(sel.health)}/${Math.ceil(sel.maxHealth)}`;
    el('span', 'bld__note', this.info, label);
    const act = (name: string, cost: number | null, run: () => void) => {
      const b = el('button', 'bld__btn', this.info, name);
      b.disabled = cost !== null && state.gold < cost;
      if (cost !== null) el('span', 'bld__cost', b, `${cost} gold`);
      b.addEventListener('click', () => {
        run();
        this.shown = '';
      });
    };
    if (!sel.built) {
      act('Cancel', null, () => removeStructure(state, this.config, sel.id));
      return;
    }
    const up = upgradeCost(this.config, sel);
    if (up !== null) act('Upgrade', up, () => upgradeStructure(state, this.config, sel.id));
    const fix = repairCost(state, this.config, sel);
    if (fix !== null) act('Repair', fix, () => repairStructure(state, this.config, sel.id));
    if (def.ammo) {
      el('span', 'bld__note', this.info, `Ammo ${sel.ammo}/${def.ammo.capacity}`);
      const refill = ammoRefillCost(this.config, sel);
      if (refill !== null) act('Refill', refill, () => refillWithGold(state, this.config, sel.id));
    }
    if (def.door || def.switch) {
      const on = def.switch ? ['Switch off', 'Switch on'] : ['Close', 'Open'];
      const by = localPlayer(state).controlledId ?? undefined;
      act(sel.open ? on[0]! : on[1]!, null, () => toggleDoor(state, this.config, sel.id, by));
    }
    act('Remove', null, () => removeStructure(state, this.config, sel.id));
  }

  private hint(): string {
    if (this.armed !== null) return 'Click: place · R: turn · Right click / Esc: put away';
    return 'Pick a structure, or click one to upgrade, repair or open it · N: close';
  }
}
