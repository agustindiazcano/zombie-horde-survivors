import './pausePanel.css';
import { levelInfo, maxHealthOf, type GameConfig, type GameState } from './sim';

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

const percent = (multiplier: number): string =>
  `${multiplier >= 1 ? '+' : ''}${Math.round((multiplier - 1) * 100)}%`;

/** Left-hand panel shown while the game is paused: owned perks as icon cards, plus the squad's stats. */
export class PausePanel {
  private readonly root = el('div', 'pp');
  private wasPaused = false;

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    private readonly onSettings: () => void,
  ) {
    parent.appendChild(this.root);
  }

  /** Call every frame; the panel is redrawn once each time the game pauses. */
  update(paused: boolean, state: GameState): void {
    if (paused === this.wasPaused) return;
    this.wasPaused = paused;
    this.root.classList.toggle('pp--open', paused);
    if (paused) this.render(state);
  }

  private render(state: GameState): void {
    this.root.replaceChildren();
    const settings = el('button', 'pp__settings', this.root, '⚙ Settings (O)');
    settings.addEventListener('click', this.onSettings);
    this.renderPerks(state);
    this.renderStats(state);
  }

  private renderPerks(state: GameState): void {
    el('h3', 'pp__heading', this.root, 'Bonuses');
    const owned = this.config.perks.list.filter((p) => (state.upgrades[p.id] ?? 0) > 0);
    if (owned.length === 0) {
      el('p', 'pp__empty', this.root, 'None yet. Level up to pick your first perk.');
      return;
    }
    const list = el('div', 'pp__perks', this.root);
    for (const perk of owned) {
      const stacks = state.upgrades[perk.id] ?? 0;
      const total = perk.amount * stacks;
      const effect =
        perk.stat === 'regen' ? `+${total.toFixed(1)} HP/s` : `+${Math.round(total * 100)}%`;
      const row = el('div', 'pp__perk', list);
      const icon = el('div', 'pp__icon', row);
      el('span', 'pp__symbol', icon, perk.icon);
      el('span', 'pp__stacks', icon, `${stacks}`);
      const text = el('div', 'pp__text', row);
      el('div', 'pp__name', text, `${perk.name} · ${effect}`);
      el('div', 'pp__desc', text, perk.description);
    }
  }

  private renderStats(state: GameState): void {
    const mods = state.mods;
    const info = levelInfo(state.xp, this.config);
    el('h3', 'pp__heading', this.root, 'Stats');
    const rows: [string, string][] = [
      ['Level', `${info.level}  (${info.into} / ${info.needed} XP)`],
      ['Wave', `${state.wave}`],
      ['Kills', `${state.kills}`],
      ['Gold', `${state.gold}`],
      [
        'Max health',
        `${Math.round(maxHealthOf(state, this.config))}  (${percent(mods.maxHealth)})`,
      ],
      ['Damage', percent(mods.damage)],
      ['Fire rate', percent(mods.fireRate)],
      ['Move speed', percent(mods.speed)],
      ['Regeneration', `${mods.regen.toFixed(1)} HP/s`],
      ['Pickup radius', percent(mods.pickupRadius)],
    ];
    const table = el('div', 'pp__stats', this.root);
    for (const [name, value] of rows) {
      el('span', 'pp__stat-name', table, name);
      el('span', 'pp__stat-value', table, value);
    }
  }
}
