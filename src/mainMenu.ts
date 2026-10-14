import './mainMenu.css';
import { MenuModel } from './menuModel';
import type { CharacterFactory } from './render/characters';

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
 * The title screen shown when the page loads. The game stays frozen behind it until Start
 * (button, Enter or Space). Clicking Start is also the user gesture browsers need for audio.
 */
export class MainMenu {
  private readonly root = el('div', 'menu');
  private open = true;
  private model: MenuModel | null = null;

  /** `preview` makes the character that floats on the right of the title screen. */
  constructor(
    parent: HTMLElement,
    private readonly onStart: () => void,
    preview?: CharacterFactory,
    onSettings?: () => void,
  ) {
    const panel = el('div', 'menu__panel', this.root);
    el('h1', 'menu__title', panel, 'Zombie Horde Survivors');
    el(
      'p',
      'menu__tagline',
      panel,
      'Command a squad of soldiers and a drone against endless waves of zombies, aliens and monsters.',
    );
    const start = el('button', 'menu__start', panel, 'Start');
    start.addEventListener('click', () => this.start());
    if (onSettings) {
      const settings = el('button', 'menu__settings', panel, '⚙ Settings (O)');
      settings.addEventListener('click', onSettings);
    }
    const tips = el('ul', 'menu__tips', panel);
    for (const tip of [
      'WASD move · Mouse aim · Click fire',
      'T: third / first person · Y: RTS mode',
      'Level up for perks · B: shop between waves',
    ]) {
      el('li', '', tips, tip);
    }
    parent.appendChild(this.root);
    if (preview) {
      const stage = el('div', 'menu__stage', this.root);
      this.model = new MenuModel(stage, preview);
    }
    start.focus();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** While the menu is up it swallows every key; Enter / Space start the game. */
  onKey(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') this.start();
    return true;
  }

  private start(): void {
    if (!this.open) return;
    this.open = false;
    this.model?.stop();
    this.model = null;
    this.root.classList.add('menu--hidden');
    this.onStart();
  }
}
