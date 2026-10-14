import './hud.css';
import type { GameConfig, GameState } from './sim';

const BANNER_MS = 1800;
const LOW_HEALTH = 0.3;

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
  private readonly banner: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly summary: HTMLElement;
  private bannerTimer = 0;
  // Last rendered values, so the DOM is only touched when something changes.
  private shown = { health: -1, wave: -1, kills: -1, over: false };

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
    this.banner = el('div', 'hud__banner', root);

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
    this.shown = { health: -1, wave: -1, kills: -1, over: false };
    this.gameOver.classList.remove('hud__gameover--visible');
    this.banner.classList.remove('hud__banner--visible');
  }

  update(state: GameState): void {
    const health = Math.ceil(state.player.health);
    if (health !== this.shown.health) {
      this.shown.health = health;
      const max = this.config.player.maxHealth;
      this.healthLabel.textContent = `Health ${health} / ${max}`;
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

    const over = state.status === 'gameover';
    if (over !== this.shown.over) {
      this.shown.over = over;
      this.gameOver.classList.toggle('hud__gameover--visible', over);
      this.summary.textContent = `You survived to wave ${state.wave} with ${state.kills} kills.`;
    }
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
