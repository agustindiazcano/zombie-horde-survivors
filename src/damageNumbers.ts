import { localPlayer, type GameState, type HitKind, type Vec2 } from './sim';

/** Seconds a number floats, its rise in pixels, and the most numbers shown at once. */
const LIFE = 0.8;
const RISE = 46;
const MAX_ACTIVE = 40;
/** Height above the ground (metres) where a number appears, for a head hit and for the rest. */
const HEAD_Y = 1.9;
const BODY_Y = 1.2;

interface Floating {
  el: HTMLElement;
  x: number;
  z: number;
  y: number;
  age: number;
}

/**
 * Damage numbers that float up from the enemy that was hit: white for a body hit, orange for a
 * head hit, yellow for a critical hit. Only the controlled soldier's plain hits are shown, so a
 * crowd of squad bullets does not fill the screen; anyone's head and critical hits are.
 */
export class DamageNumbers {
  private readonly active: Floating[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly project: (x: number, z: number, y: number) => Vec2 | null,
  ) {}

  /** Adds the numbers of the hits in the events of one simulation step. */
  onStep(state: GameState): void {
    const mine = localPlayer(state).controlledId;
    for (const e of state.events) {
      if (e.type === 'shot' && e.hit) {
        if (e.shooterId === mine || e.hit.kind !== 'body') this.add(e.to, e.hit.kind, e.hit.damage);
      } else if (e.type === 'melee' && e.hit) {
        const target = state.zombies.find((z) => z.id === e.hitZombieId);
        if (target && (e.attackerId === mine || e.hit.kind !== 'body')) {
          this.add(target.pos, e.hit.kind, e.hit.damage);
        }
      }
    }
  }

  private add(at: Vec2, kind: HitKind, damage: number): void {
    if (this.active.length >= MAX_ACTIVE) this.remove(0);
    const el = document.createElement('div');
    el.className = `dmgnum dmgnum--${kind}`;
    el.textContent = kind === 'body' ? `${Math.round(damage)}` : `${Math.round(damage)}!`;
    this.root.appendChild(el);
    this.active.push({
      el,
      x: at.x,
      z: at.z,
      y: kind === 'head' ? HEAD_Y : BODY_Y,
      age: 0,
    });
  }

  private remove(index: number): void {
    this.active[index]?.el.remove();
    this.active.splice(index, 1);
  }

  /** Moves the numbers with the camera and fades them; call once per frame. */
  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      if (!f) continue;
      f.age += dt;
      const p = f.age < LIFE ? this.project(f.x, f.z, f.y) : null;
      if (!p) {
        this.remove(i);
        continue;
      }
      const t = f.age / LIFE;
      f.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.z - RISE * t)}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(1 - t * t);
    }
  }
}
