import './hud.css';
import {
  getSoldier,
  levelInfo,
  maxHealthOf,
  weaponDef,
  type GameConfig,
  type GameState,
} from './sim';

const BANNER_MS = 1800;
const LOW_HEALTH = 0.3;
const BEST_KEY = 'zombie-horde-survivors.best-kills';
/** Key used before the game was renamed; still read so saved scores aren't lost. */
const LEGACY_BEST_KEY = 'zombie-shooter.best-kills';

function loadBest(): number {
  try {
    return (
      Number(localStorage.getItem(BEST_KEY)) || Number(localStorage.getItem(LEGACY_BEST_KEY)) || 0
    );
  } catch {
    return 0;
  }
}

function saveBest(kills: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(kills));
  } catch {
    // Storage can be unavailable (private mode); the best score is optional.
  }
}

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

/** DOM overlay: health, wave, kills, wave banner and the game over screen. */
export class Hud {
  private readonly healthLabel: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly kills: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly level: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly damage: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly summary: HTMLElement;
  private bannerTimer = 0;
  // Last rendered values, so the DOM is only touched when something changes.
  private shown = {
    health: -1,
    wave: -1,
    kills: -1,
    over: false,
    countdown: '',
    focus: -1,
    weapon: '',
    gold: -1,
    xp: -1,
  };

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    onRestart: () => void,
  ) {
    const root = el('div', 'hud', parent);

    const health = el('div', 'hud__health', root);
    this.healthLabel = el('div', 'hud__health-label', health);
    this.healthFill = el('div', 'hud__bar-fill', el('div', 'hud__bar', health));

    const stats = el('div', 'hud__stats', root);
    this.wave = el('span', '', stats);
    this.kills = el('span', '', stats);
    this.gold = el('span', 'hud__gold', stats);
    this.level = el('span', 'hud__level', stats);
    this.xpFill = el('div', 'hud__xp-fill', el('div', 'hud__xp', root));
    this.banner = el('div', 'hud__banner', root);
    this.damage = el('div', 'hud__damage', root);
    this.countdown = el('div', 'hud__countdown', root);
    this.hint = el('div', 'hud__hint', root);
    this.crosshair = el('div', 'hud__crosshair', root);

    this.pause = el('div', 'hud__pause', root);
    el('h1', '', this.pause, 'PAUSED');
    el('p', '', this.pause, 'Press P or Esc to resume');

    this.gameOver = el('div', 'hud__gameover', root);
    el('h1', '', this.gameOver, 'GAME OVER');
    this.summary = el('p', '', this.gameOver);
    const button = el('button', '', this.gameOver, 'Restart (R)');
    button.addEventListener('click', onRestart);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.shown.over) onRestart();
    });
  }

  /** Forces a full refresh on the next update (call after restarting). */
  reset(): void {
    this.shown = {
      health: -1,
      wave: -1,
      kills: -1,
      over: false,
      countdown: '',
      focus: -1,
      weapon: '',
      gold: -1,
      xp: -1,
    };
    this.gameOver.classList.remove('hud__gameover--visible');
    this.banner.classList.remove('hud__banner--visible');
  }

  /** Reacts to events from a simulation step (call after every step). */
  onStep(state: GameState): void {
    for (const e of state.events) {
      if (e.type === 'soldierHurt' && e.soldierId === state.controlledId) this.flashDamage();
      else if (e.type === 'levelUp') this.showBanner(`LEVEL UP! Lv ${e.level}`);
      else if (e.type === 'bossSpawned') this.showBanner('MINI BOSS!');
    }
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle('hud__pause--visible', paused);
  }

  setCrosshair(visible: boolean): void {
    this.crosshair.classList.toggle('hud__crosshair--visible', visible);
  }

  /** Text describing the current mode and its keys. */
  setHint(text: string): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  /** `focusId` is the soldier whose health is shown (controlled or selected). */
  update(state: GameState, focusId: number | null): void {
    const focus =
      getSoldier(state, focusId) ?? state.soldiers.find((s) => !s.dead) ?? state.soldiers[0];
    const health = Math.ceil(focus?.health ?? 0);
    const focusKey = focus?.id ?? 0;
    const weapon = focus
      ? focus.weapon
        ? weaponDef(this.config, focus.weapon).name
        : 'Unarmed'
      : '';
    if (
      health !== this.shown.health ||
      focusKey !== this.shown.focus ||
      weapon !== this.shown.weapon
    ) {
      this.shown.health = health;
      this.shown.focus = focusKey;
      this.shown.weapon = weapon;
      const max = Math.round(maxHealthOf(state, this.config));
      this.healthLabel.textContent = `${focus?.kind === 'drone' ? 'Drone' : 'Soldier'} ${focusKey} · ${weapon} — Health ${health} / ${max}`;
      this.healthFill.style.width = `${(health / max) * 100}%`;
      this.healthFill.classList.toggle('hud__bar-fill--low', health / max < LOW_HEALTH);
    }

    if (state.wave !== this.shown.wave) {
      this.shown.wave = state.wave;
      this.wave.textContent = `Wave ${state.wave}`;
      if (state.wave > 0) this.showBanner(`Wave ${state.wave}`);
    }

    if (state.kills !== this.shown.kills) {
      this.shown.kills = state.kills;
      this.kills.textContent = `Kills ${state.kills}`;
    }

    if (state.gold !== this.shown.gold) {
      this.shown.gold = state.gold;
      this.gold.textContent = `Gold ${state.gold}`;
    }
    if (state.xp !== this.shown.xp) {
      this.shown.xp = state.xp;
      const info = levelInfo(state.xp, this.config);
      this.level.textContent = `Lv ${info.level}`;
      this.xpFill.style.width = `${(info.into / info.needed) * 100}%`;
    }

    const countdown =
      state.status === 'playing' && state.spawner.phase === 'intermission'
        ? `Next wave in ${Math.ceil(state.spawner.timer)}s · B: shop`
        : '';
    if (countdown !== this.shown.countdown) {
      this.shown.countdown = countdown;
      this.countdown.textContent = countdown;
    }

    const over = state.status === 'gameover';
    if (over !== this.shown.over) {
      this.shown.over = over;
      this.gameOver.classList.toggle('hud__gameover--visible', over);
      if (over) {
        const best = Math.max(loadBest(), state.kills);
        saveBest(best);
        this.summary.textContent = `You survived to wave ${state.wave} with ${state.kills} kills. Best: ${best}`;
      }
    }
  }

  private flashDamage(): void {
    const style = this.damage.style;
    style.transition = 'none';
    style.opacity = '1';
    void this.damage.offsetWidth; // restart the transition
    style.transition = 'opacity 0.45s ease-out';
    style.opacity = '0';
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.add('hud__banner--visible');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(
      () => this.banner.classList.remove('hud__banner--visible'),
      BANNER_MS,
    );
  }
}
