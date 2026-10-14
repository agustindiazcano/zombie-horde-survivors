import type { GameConfig, GameState } from './sim';

const SIZE = 190;
/** Seconds the sweep takes for a full turn. */
const SWEEP_PERIOD = 3.2;
/** Seconds a detected blip stays on screen (it fades out), and the trail behind the sweep. */
const BLIP_LIFE = 2.6;
const TRAIL = 0.9;
const TAU = Math.PI * 2;

interface Blip {
  x: number;
  z: number;
  size: number;
  age: number;
}

/**
 * A radar minimap in the bottom-right corner. A sweep turns around the centre of the arena
 * and enemies only show up when it passes over them; each blip then fades until the next pass.
 * Your own units are always visible. North (-z) is up.
 */
export class Radar {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly scale: number;
  private angle = 0;
  private blips: Blip[] = [];

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
  ) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = Math.round(SIZE * dpr);
    Object.assign(this.canvas.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      zIndex: '15',
      pointerEvents: 'none',
      border: '2px solid rgba(90, 255, 140, 0.55)',
      borderRadius: '6px',
      boxShadow: '0 0 12px rgba(0, 0, 0, 0.7)',
    });
    this.ctx = this.canvas.getContext('2d');
    this.ctx?.scale(dpr, dpr);
    this.scale = SIZE / (config.arena.halfSize * 2);
    parent.appendChild(this.canvas);
  }

  /** Call every frame. `dt` is 0 while the game is paused, which freezes the sweep. */
  update(state: GameState, dt: number): void {
    const prev = this.angle;
    this.angle = (this.angle + (TAU * dt) / SWEEP_PERIOD) % TAU;
    this.blips = this.blips.filter((b) => (b.age += dt) < BLIP_LIFE);
    if (dt > 0) this.detect(state, prev, this.angle);
    this.draw(state);
  }

  /** Adds a blip for every living enemy the sweep passed over between two angles. */
  private detect(state: GameState, from: number, to: number): void {
    const span = (to - from + TAU) % TAU;
    for (const z of state.zombies) {
      if (z.state === 'death') continue;
      const a = (Math.atan2(z.pos.z, z.pos.x) + TAU) % TAU;
      if ((a - from + TAU) % TAU > span) continue;
      this.blips.push({ x: z.pos.x, z: z.pos.z, size: z.radius, age: 0 });
    }
  }

  private px(x: number): number {
    return SIZE / 2 + x * this.scale;
  }

  private draw(state: GameState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const c = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(6, 18, 10, 0.82)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid and obstacles.
    ctx.strokeStyle = 'rgba(90, 255, 140, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, SIZE);
    ctx.moveTo(0, c);
    ctx.lineTo(SIZE, c);
    ctx.arc(c, c, SIZE * 0.25, 0, TAU);
    ctx.moveTo(c + SIZE * 0.5, c);
    ctx.arc(c, c, SIZE * 0.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(90, 255, 140, 0.22)';
    for (const o of this.config.arena.obstacles) {
      ctx.fillRect(
        this.px(o.x - o.halfW),
        this.px(o.z - o.halfD),
        o.halfW * 2 * this.scale,
        o.halfD * 2 * this.scale,
      );
    }

    // The sweep: a bright arm with a fading trail behind it.
    const trailAngle = (TAU * TRAIL) / SWEEP_PERIOD;
    const reach = SIZE * 0.75;
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a1 = this.angle - (trailAngle * i) / steps;
      const a0 = this.angle - (trailAngle * (i + 1)) / steps;
      ctx.fillStyle = `rgba(90, 255, 140, ${0.28 * (1 - i / steps)})`;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, reach, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(150, 255, 190, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(this.angle) * reach, c + Math.sin(this.angle) * reach);
    ctx.stroke();

    // Enemy blips, as seen when the sweep last passed.
    for (const b of this.blips) {
      const fade = 1 - b.age / BLIP_LIFE;
      ctx.fillStyle = `rgba(255, 70, 60, ${fade})`;
      ctx.beginPath();
      ctx.arc(this.px(b.x), this.px(b.z), Math.max(2, b.size * this.scale * 1.4), 0, TAU);
      ctx.fill();
    }

    // Your units are always known.
    for (const s of state.soldiers) {
      if (s.dead) continue;
      ctx.fillStyle = s.kind === 'drone' ? '#6cf' : s.id === state.controlledId ? '#fff' : '#7f7';
      ctx.beginPath();
      ctx.arc(this.px(s.pos.x), this.px(s.pos.z), s.id === state.controlledId ? 3.5 : 3, 0, TAU);
      ctx.fill();
    }
  }
}
