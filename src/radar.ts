import { localPlayer, type GameState } from './sim';

const SIZE = 210;
const MARGIN = 8;
/** How far the radar sees from the squad, in world units. */
const RANGE = 30;
/** Seconds between pulses; the ring takes `PULSE_TRAVEL` of that to reach the edge. */
const PULSE_PERIOD = 2.4;
const PULSE_TRAVEL = 1.7;
/** Seconds a detected blip stays on screen (it fades out). */
const BLIP_LIFE = 2.2;
const TAU = Math.PI * 2;

/** Light-blue palette. */
const CYAN = '110, 215, 255';
const BRIGHT = '200, 246, 255';

interface Blip {
  x: number;
  z: number;
  size: number;
  age: number;
}

/**
 * A motion tracker in the bottom-right corner, in the style of the one from Aliens: a pulse
 * ring spreads out from the centre of the squad, and enemies only show up as blips when the
 * ring crosses them, then fade until the next ping. It is centred on your living units and
 * only sees `RANGE` around them. North (-z) is up.
 */
export class Radar {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly radius = SIZE / 2 - MARGIN;
  private readonly pxPerUnit = (SIZE / 2 - MARGIN) / RANGE;
  private cx = 0;
  private cz = 0;
  private centred = false;
  private time = 0;
  private pulse = 0;
  private blips: Blip[] = [];

  constructor(parent: HTMLElement) {
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
      filter: `drop-shadow(0 0 8px rgba(${CYAN}, 0.35))`,
    });
    this.ctx = this.canvas.getContext('2d');
    this.ctx?.scale(dpr, dpr);
    this.canvas.classList.add('radar');
    parent.appendChild(this.canvas);
  }

  /** Call every frame. `dt` is 0 while the game is paused, which freezes the radar. */
  update(state: GameState, dt: number): void {
    this.follow(state, dt);
    this.time += dt;
    this.blips = this.blips.filter((b) => (b.age += dt) < BLIP_LIFE);

    // The ring runs from the centre to the edge, then rests until the next ping.
    const phase = this.time % PULSE_PERIOD;
    const prev = this.pulse;
    this.pulse = Math.min(phase / PULSE_TRAVEL, 1);
    if (dt > 0) this.detect(state, phase < dt ? -1 : prev, this.pulse);
    this.draw(state);
  }

  /** Moves the centre to the middle of the living units (eased, so it doesn't jitter). */
  private follow(state: GameState, dt: number): void {
    let x = 0;
    let z = 0;
    let n = 0;
    for (const s of state.soldiers) {
      if (s.dead) continue;
      x += s.pos.x;
      z += s.pos.z;
      n++;
    }
    if (n === 0) return;
    if (!this.centred) {
      this.cx = x / n;
      this.cz = z / n;
      this.centred = true;
      return;
    }
    const k = 1 - Math.exp(-6 * dt);
    this.cx += (x / n - this.cx) * k;
    this.cz += (z / n - this.cz) * k;
  }

  /** Adds a blip for every living enemy the ring crossed between two radii (0..1 of the range). */
  private detect(state: GameState, from: number, to: number): void {
    for (const z of state.zombies) {
      if (z.state === 'death') continue;
      const d = Math.hypot(z.pos.x - this.cx, z.pos.z - this.cz) / RANGE;
      if (d > 1 || d <= from || d > to) continue;
      this.blips.push({ x: z.pos.x, z: z.pos.z, size: z.radius, age: 0 });
    }
  }

  private sx(x: number): number {
    return SIZE / 2 + (x - this.cx) * this.pxPerUnit;
  }

  private sz(z: number): number {
    return SIZE / 2 + (z - this.cz) * this.pxPerUnit;
  }

  private draw(state: GameState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const c = SIZE / 2;
    const r = this.radius;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Screen: a dark glass disc with a glowing rim.
    ctx.fillStyle = 'rgba(4, 18, 26, 0.86)';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.clip();

    // Range rings and crosshair.
    ctx.strokeStyle = `rgba(${CYAN}, 0.2)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      ctx.moveTo(c + r * f, c);
      ctx.arc(c, c, r * f, 0, TAU);
    }
    ctx.moveTo(c - r, c);
    ctx.lineTo(c + r, c);
    ctx.moveTo(c, c - r);
    ctx.lineTo(c, c + r);
    ctx.stroke();

    // The pulse: a bright ring with a soft glow behind it, fading as it spreads.
    if (this.pulse > 0 && this.pulse < 1) {
      const pr = r * this.pulse;
      const alpha = 1 - this.pulse * 0.75;
      const glow = ctx.createRadialGradient(c, c, Math.max(pr - r * 0.22, 0), c, c, pr);
      glow.addColorStop(0, `rgba(${CYAN}, 0)`);
      glow.addColorStop(1, `rgba(${CYAN}, ${0.3 * alpha})`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c, c, pr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${BRIGHT}, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, pr, 0, TAU);
      ctx.stroke();
    }

    // Detected enemies, as seen when the ring last crossed them.
    let nearest = Infinity;
    for (const b of this.blips) {
      const fade = 1 - b.age / BLIP_LIFE;
      const px = this.sx(b.x);
      const pz = this.sz(b.z);
      const size = Math.max(2.4, b.size * this.pxPerUnit * 1.3);
      if (b.age < 0.35) {
        ctx.strokeStyle = `rgba(${BRIGHT}, ${(1 - b.age / 0.35) * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, pz, size + b.age * 28, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${BRIGHT}, ${fade})`;
      ctx.shadowColor = `rgba(${CYAN}, ${fade})`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, pz, size, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      nearest = Math.min(nearest, Math.hypot(b.x - this.cx, b.z - this.cz));
    }

    // Your own units: hollow rings, the controlled one filled.
    for (const s of state.soldiers) {
      if (s.dead) continue;
      const px = this.sx(s.pos.x);
      const pz = this.sz(s.pos.z);
      if (Math.hypot(px - c, pz - c) > r) continue;
      const mine = s.id === localPlayer(state).controlledId;
      ctx.strokeStyle = `rgba(${mine ? BRIGHT : CYAN}, 0.95)`;
      ctx.fillStyle = `rgba(${BRIGHT}, 0.95)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (s.kind === 'drone') {
        ctx.rect(px - 3, pz - 3, 6, 6);
      } else {
        ctx.arc(px, pz, mine ? 3.6 : 3, 0, TAU);
      }
      if (mine) ctx.fill();
      else ctx.stroke();
    }
    ctx.restore();

    // Rim and the distance readout of the closest contact, like the original's display.
    ctx.strokeStyle = `rgba(${CYAN}, 0.7)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = `rgba(${BRIGHT}, 0.9)`;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(nearest === Infinity ? '-- m' : `${Math.round(nearest)} m`, c, SIZE - 2);
  }
}
