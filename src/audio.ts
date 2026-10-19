import { localPlayer, type GameState } from './sim';

/** Master gain at 100% volume. */
const MASTER_VOLUME = 0.35;

/**
 * Procedural sound effects (Web Audio synthesis), so the game needs no audio assets.
 * The AudioContext starts suspended and is resumed on the first user gesture.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.7;

  constructor() {
    const unlock = () => this.ensureContext();
    window.addEventListener('mousedown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolume();
    return this.muted;
  }

  /** Sets the sound effects volume, from 0 to 1. */
  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOLUME * this.volume;
  }

  /** Plays sounds for the events produced by a simulation step. */
  onStep(state: GameState): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    for (const e of state.events) {
      if (e.type === 'shot') this.shot(e.shooterId === localPlayer(state).controlledId ? 1 : 0.35);
      else if (e.type === 'zombieKilled') {
        if (e.exploded) this.splat();
        else this.kill();
      } else if (e.type === 'pickupCollected') {
        if (e.kind === 'gold') this.tone('sine', 1300, 1900, 0.07, 0.25);
        else this.tone('sine', 700, 1100, 0.09, 0.2);
      } else if (e.type === 'levelUp') {
        this.tone('square', 440, 440, 0.1, 0.25);
        this.tone('square', 660, 660, 0.1, 0.25, 0.1);
        this.tone('square', 880, 880, 0.2, 0.25, 0.2);
      } else if (e.type === 'crateDropped') this.tone('sine', 500, 900, 0.14, 0.3);
      else if (e.type === 'soldierHurt')
        this.hurt(e.soldierId === localPlayer(state).controlledId ? 1 : 0.4);
      else if (e.type === 'dryFire') {
        if (e.shooterId === localPlayer(state).controlledId)
          this.tone('square', 1800, 1500, 0.03, 0.2);
      } else if (e.type === 'melee') {
        const v = e.attackerId === localPlayer(state).controlledId ? 1 : 0.4;
        this.tone('sawtooth', e.hitZombieId !== null ? 140 : 300, 60, 0.1, 0.3 * v);
      } else if (e.type === 'reloadStarted') {
        const v = e.soldierId === localPlayer(state).controlledId ? 1 : 0.3;
        this.tone('square', 500, 380, 0.05, 0.25 * v);
        this.tone('square', 700, 900, 0.06, 0.25 * v, 0.4);
      } else if (e.type === 'grenadeThrown') this.tone('sine', 260, 520, 0.1, 0.2);
      else if (e.type === 'explosion') {
        this.tone('sawtooth', 160, 30, 0.7, 0.6);
        this.tone('square', 90, 25, 0.5, 0.4);
      } else if (e.type === 'soldierDowned') this.tone('sawtooth', 220, 90, 0.3, 0.4);
      else if (e.type === 'soldierRevived') this.tone('square', 330, 660, 0.2, 0.25);
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
      this.applyVolume();
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

  private splat(): void {
    this.noiseBurst(0.3, 'lowpass', 500, 0.9);
    this.tone('sine', 120, 35, 0.3, 0.7);
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
