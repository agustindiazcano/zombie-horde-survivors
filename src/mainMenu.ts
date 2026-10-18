import './mainMenu.css';
import { deleteMap, importMapFile, listMaps, pickMapFile, type MapEntry } from './maps';
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

/** The screens of the menu flow: title → mode → single player → story or the map list. */
type Screen = 'title' | 'mode' | 'single' | 'story' | 'maps';

/** Where "Back" goes from each screen. */
const BACK: Record<Exclude<Screen, 'title'>, Screen> = {
  mode: 'title',
  single: 'mode',
  story: 'single',
  maps: 'single',
};

/**
 * The title screen shown when the page loads, and the menus that lead into a game. The game stays
 * frozen behind it until a map is picked. Clicking there is also the user gesture browsers need for
 * audio. Buttons are native, so Enter / Space activate the focused one; Esc goes back.
 */
export class MainMenu {
  private readonly root = el('div', 'menu');
  private readonly panel = el('div', 'menu__panel', this.root);
  private open = true;
  private screen: Screen = 'title';
  private model: MenuModel | null = null;
  private stage: HTMLElement | null = null;
  private preview: CharacterFactory | undefined;

  /** `preview` makes the character that floats on the right of the title screen. */
  constructor(
    parent: HTMLElement,
    private readonly onPlay: (map: MapEntry) => void,
    preview?: CharacterFactory,
    private readonly onSettings?: () => void,
    private readonly onEditor: () => void = () => undefined,
    private readonly editorAvailable = true,
  ) {
    parent.appendChild(this.root);
    this.preview = preview;
    if (preview) {
      this.stage = el('div', 'menu__stage', this.root);
      this.model = new MenuModel(this.stage, preview);
    }
    this.go('title');
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** While the menu is up it swallows every key; Esc steps back, buttons handle Enter / Space. */
  onKey(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Escape' && this.screen !== 'title') this.go(BACK[this.screen]);
    return true;
  }

  /** Brings the title screen back (mobile menu button); the game stays frozen behind it. */
  show(): void {
    if (this.open) return;
    this.open = true;
    this.root.classList.remove('menu--hidden');
    if (this.stage && this.preview && !this.model)
      this.model = new MenuModel(this.stage, this.preview);
    this.go('title');
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.panel.replaceChildren();
    const first = this.build(screen);
    first?.focus();
  }

  /** Fills the panel for `screen`; returns the button that gets focus. */
  private build(screen: Screen): HTMLButtonElement | null {
    const panel = this.panel;
    if (screen === 'title') {
      el('h1', 'menu__title', panel, 'Zombie Horde Survivors');
      el(
        'p',
        'menu__tagline',
        panel,
        'Command a squad of soldiers and a drone against endless waves of zombies, aliens and monsters.',
      );
      const start = el('button', 'menu__start', panel, 'Start');
      start.addEventListener('click', () => this.go('mode'));
      if (this.onSettings) {
        const settings = el('button', 'menu__settings', panel, '⚙ Settings (O)');
        settings.addEventListener('click', this.onSettings);
      }
      const tips = el('ul', 'menu__tips', panel);
      for (const tip of [
        'WASD move · Mouse aim · Click fire',
        'T: third / first person · Y: RTS mode',
        'Level up for perks · B: shop between waves',
      ]) {
        el('li', '', tips, tip);
      }
      return start;
    }

    el('h2', 'menu__heading', panel, TITLES[screen]);
    const list = el('div', 'menu__list', panel);
    let first: HTMLButtonElement | null = null;
    const option = (
      label: string,
      hint: string,
      action: (() => void) | null,
      into: HTMLElement = list,
    ) => {
      const button = el('button', 'menu__option', into);
      el('span', 'menu__option-label', button, label);
      el('span', 'menu__option-hint', button, hint);
      if (action) button.addEventListener('click', action);
      else button.disabled = true;
      first ??= button;
      return button;
    };

    if (screen === 'mode') {
      option('Single Player', 'Story missions or survival waves', () => this.go('single'));
      option('Multiplayer', 'Coming soon', null);
      option(
        'Editor',
        this.editorAvailable ? 'Build your own maps' : 'Desktop only',
        this.editorAvailable ? () => this.openEditor() : null,
      );
    } else if (screen === 'single') {
      option('Story', 'Missions with objectives', () => this.go('story'));
      option('Waves', 'Survive endless waves on a map', () => this.go('maps'));
    } else {
      const wanted = screen === 'story' ? 'story' : 'waves';
      const entries = listMaps().filter((m) => m.mode === wanted);
      if (entries.length === 0) el('p', 'menu__empty', panel, 'No missions yet.');
      for (const map of entries) {
        const wrap = el('div', 'menu__maprow', list);
        const row = option(map.name, `${map.width} × ${map.depth}`, () => this.play(map), wrap);
        if (map.deletable) {
          const del = el('button', 'menu__delete', wrap, '🗑');
          del.title = 'Delete this map';
          del.addEventListener('click', () => {
            if (!confirm(`Delete "${map.name}"?`)) return;
            deleteMap(map.id);
            this.go(screen);
          });
        }
        el(
          'span',
          map.builtIn ? 'menu__badge' : 'menu__badge menu__badge--saved',
          row,
        ).textContent = map.builtIn ? 'Built-in' : 'Saved';
      }
      const imp = el('button', 'menu__back', panel, 'Import a map file…');
      imp.addEventListener('click', () => {
        void pickMapFile().then(async (file) => {
          if (!file) return;
          try {
            await importMapFile(file);
            this.go(screen);
          } catch (e) {
            alert((e as Error).message);
          }
        });
      });
    }

    const back = el('button', 'menu__back', panel, '← Back');
    back.addEventListener('click', () => this.go(BACK[screen]));
    return first ?? back;
  }

  private play(map: MapEntry): void {
    if (!this.open) return;
    this.close();
    this.onPlay(map);
  }

  private openEditor(): void {
    if (!this.open) return;
    this.close();
    this.onEditor();
  }

  private close(): void {
    this.open = false;
    this.model?.stop();
    this.model = null;
    this.root.classList.add('menu--hidden');
  }
}

const TITLES: Record<Exclude<Screen, 'title'>, string> = {
  mode: 'Choose a mode',
  single: 'Single Player',
  story: 'Story',
  maps: 'Choose a map',
};
