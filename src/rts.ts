import type { GameRenderer } from './render/gameRenderer';
import {
  orderBoard,
  orderFollow,
  orderMove,
  type GameConfig,
  type GameState,
  type Soldier,
} from './sim';

/** Pointer movement below this (px) is a click, above it a box selection. */
const DRAG_THRESHOLD = 6;
/** How close (px) a click must be to a soldier to select it. */
const PICK_RADIUS = 40;
/** Soldiers are about this tall; their screen position is measured at mid-body. */
const BODY_MID = 1;

/**
 * RTS-mode mouse and keyboard handling: click/box selection, right-click move orders,
 * number keys, E (select all) and F (follow). Does nothing while `isActive()` is false.
 */
export class RtsController {
  /** Insertion-ordered; the first id is the one Y takes control of. */
  selected = new Set<number>();
  private rightDown: { x: number; y: number } | null = null;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private readonly box = document.createElement('div');

  constructor(
    canvas: HTMLElement,
    private readonly renderer: GameRenderer,
    private readonly config: GameConfig,
    private readonly getState: () => GameState,
    private readonly isActive: () => boolean,
  ) {
    this.box.className = 'selection-box';
    document.body.appendChild(this.box);

    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** Replaces the selection (used by the squad panel and by taking control). */
  set(ids: Iterable<number>): void {
    this.selected = new Set(ids);
    this.publish();
  }

  toggle(id: number, additive: boolean): void {
    const next = new Set(additive ? this.selected : []);
    if (additive && next.has(id)) next.delete(id);
    else next.add(id);
    this.set(next);
  }

  /** Drops dead soldiers from the selection. Call every frame. */
  prune(): void {
    const state = this.getState();
    const alive = [...this.selected].filter((id) =>
      state.soldiers.some((s) => s.id === id && !s.dead),
    );
    if (alive.length !== this.selected.size) this.set(alive);
  }

  private publish(): void {
    this.renderer.selection = this.selected;
  }

  private living(): Soldier[] {
    return this.getState().soldiers.filter((s) => !s.dead);
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.isActive()) return;
    if (e.button === 0) {
      this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    } else if (e.button === 2) {
      // A right click orders on release; dragging with it rotates the camera instead.
      this.rightDown = { x: e.clientX, y: e.clientY };
    }
  };

  private finishRightClick(e: MouseEvent): void {
    const start = this.rightDown;
    this.rightDown = null;
    if (!start || !this.isActive() || this.selected.size === 0) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= DRAG_THRESHOLD) return;
    const ground = this.renderer.screenToGround(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    if (!ground) return;
    // Right-clicking a vehicle with a free seat sends the selection to climb in.
    const state = this.getState();
    const vehicle = state.vehicles.find(
      (v) =>
        v.seats.includes(null) &&
        Math.hypot(v.pos.x - ground.x, v.pos.z - ground.z) <=
          this.config.vehicles[v.type]!.radius + 1,
    );
    if (vehicle) {
      orderBoard(state, [...this.selected], vehicle.id);
      this.renderer.pulse(vehicle.pos);
      return;
    }
    orderMove(this.getState(), this.config, [...this.selected], ground);
    this.renderer.pulse(ground);
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.drag) return;
    this.drag.x1 = e.clientX;
    this.drag.y1 = e.clientY;
    const { x0, y0, x1, y1 } = this.drag;
    if (Math.hypot(x1 - x0, y1 - y0) < DRAG_THRESHOLD) return;
    const style = this.box.style;
    style.display = 'block';
    style.left = `${Math.min(x0, x1)}px`;
    style.top = `${Math.min(y0, y1)}px`;
    style.width = `${Math.abs(x1 - x0)}px`;
    style.height = `${Math.abs(y1 - y0)}px`;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) {
      this.finishRightClick(e);
      return;
    }
    if (e.button !== 0 || !this.drag) return;
    const { x0, y0 } = this.drag;
    const x1 = e.clientX;
    const y1 = e.clientY;
    this.drag = null;
    this.box.style.display = 'none';
    if (!this.isActive()) return;

    if (Math.hypot(x1 - x0, y1 - y0) < DRAG_THRESHOLD) this.clickSelect(x1, y1, e.shiftKey);
    else this.boxSelect(x0, y0, x1, y1, e.shiftKey);
  };

  private screenPos(s: Soldier) {
    return this.renderer.worldToScreen(s.pos.x, s.pos.z, BODY_MID);
  }

  private clickSelect(px: number, py: number, additive: boolean): void {
    let best: Soldier | null = null;
    let bestD = PICK_RADIUS;
    for (const s of this.living()) {
      const p = this.screenPos(s);
      const d = Math.hypot(p.x - px, p.z - py);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best) this.toggle(best.id, additive);
    else if (!additive) this.set([]);
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const [left, right] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [top, bottom] = [Math.min(y0, y1), Math.max(y0, y1)];
    const ids = this.living()
      .filter((s) => {
        const p = this.screenPos(s);
        return p.x >= left && p.x <= right && p.z >= top && p.z <= bottom;
      })
      .map((s) => s.id);
    this.set(additive ? [...this.selected, ...ids] : ids);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isActive()) return;
    if (e.code === 'KeyE') {
      this.set(this.living().map((s) => s.id));
    } else if (e.code === 'KeyF') {
      orderFollow(this.getState(), [...this.selected]);
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const soldier = this.getState().soldiers[Number(e.code.slice(5)) - 1];
      if (soldier && !soldier.dead) this.toggle(soldier.id, e.shiftKey);
    }
  };
}
