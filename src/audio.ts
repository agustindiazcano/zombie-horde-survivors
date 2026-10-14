import type { GameState } from './sim';

const MASTER_VOLUME = 0.25;

/**
 * Procedural sound effects (Web Audio synthesis), so the game needs no audio assets.
 * The AudioContext starts suspended and is resumed on the first user gesture.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  constructor() {
    const unlock = () => this.ensureContext();
    window.addEventListener('mousedown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    return this.muted;
  }

  /** Plays sounds for the events produced by a simulation step. */
  onStep(state: GameState): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    for (const e of state.events) {
      if (e.type === 'shot') this.shot(e.shooterId === state.controlledId ? 1 : 0.35);
      else if (e.type === 'zombieKilled') this.kill();
      else if (e.type === 'crateDropped') this.tone('sine', 500, 900, 0.14, 0.3);
      else if (e.type === 'soldierHurt') this.hurt(e.soldierId === state.controlledId ? 1 : 0.4);
      else if (e.type === 'soldierDied') this.tone('sawtooth', 180, 50, 0.5, 0.5);
      else if (e.type === 'waveStarted') this.wave();
      else if (e.type === 'gameOver') this.gameOver();
    }
  }

  private ensureContext(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);

      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private shot(volume: number): void {
    this.noiseBurst(0.09, 'bandpass', 1800, 0.9 * volume);
    this.tone('sine', 160, 60, 0.1, 0.6 * volume);
  }

  private kill(): void {
    this.noiseBurst(0.18, 'lowpass', 600, 0.7);
    this.tone('sawtooth', 110, 40, 0.25, 0.3);
  }

  private hurt(volume: number): void {
    this.tone('sawtooth', 140, 55, 0.22, 0.7 * volume);
  }

  private wave(): void {
    this.tone('square', 220, 220, 0.18, 0.3);
    this.tone('square', 330, 330, 0.3, 0.3, 0.16);
  }

  private gameOver(): void {
    this.tone('sawtooth', 220, 40, 1.0, 0.6);
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
    delay = 0,
  ): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  private noiseBurst(
    duration: number,
    filterType: BiquadFilterType,
    frequency: number,
    volume: number,
  ): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration);
  }
}
