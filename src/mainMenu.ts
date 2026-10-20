import './mainMenu.css';
import credits from '../data/credits.json';
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

/** The slides of the title screen's carousel: what the game is, in a few lines each. */
const SLIDES: { title: string; lines: string[] }[] = [
  {
    title: 'Your squad',
    lines: [
      'Four soldiers and a drone. Take direct control of one, the rest follow and shoot on their own.',
      'The drone flies, ignores cover and cannot be hurt, but needs a drone gun.',
      'A downed soldier can be revived with a medkit; a fallen one with a defibrillator.',
    ],
  },
  {
    title: 'The horde',
    lines: [
      'Infected marines, wanderers that sleep until they see you, runners, acrobats and climbers.',
      'Every third wave a mini boss: darker, bigger, with red eyes.',
      'Shoot a head, an arm or a leg: limbs come off, and legless enemies drag themselves.',
    ],
  },
  {
    title: 'How to play',
    lines: [
      'WASD move · mouse aim · click fire · R reload · F melee · Q grenade.',
      'T: third / first person · Y: RTS mode, to command the squad from above.',
      'B: shop between waves · level up for perks.',
    ],
  },
  {
    title: 'Build and fight',
    lines: [
      'N: build walls, doors, sandbags and turrets. Soldiers do the work.',
      'H: lift crates, barrels and boulders (or a fallen ally) and throw them.',
      'Fuel and explosive barrels burn and blow up. Fire spreads along wood.',
    ],
  },
  {
    title: 'Train your soldiers',
    lines: [
      'Each level gives a skill point: strength, dexterity, constitution, weapon expertise.',
      'Pick a class: Assault, Engineer, Medic or Demolitions, and buy its perks.',
      'Open the squad screen with I or Esc.',
    ],
  },
];
/** Milliseconds each slide stays before the carousel moves on by itself. */
const SLIDE_MS = 7000;

/** The screens of the menu flow: title → mode → single player → story or the map list. */
type Screen = 'title' | 'mode' | 'single' | 'story' | 'maps' | 'credits';

/** Where "Back" goes from each screen. */
const BACK: Record<Exclude<Screen, 'title'>, Screen> = {
  mode: 'title',
  single: 'mode',
  story: 'single',
  maps: 'single',
  credits: 'title',
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
  private carousel: number | undefined;

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
    el('div', 'menu__footer', this.root, '© 2026 Agustin Diaz-Cano / Wylan Studios');
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
    window.clearInterval(this.carousel);
    this.carousel = undefined;
    this.screen = screen;
    this.panel.replaceChildren();
    const first = this.build(screen);
    first?.focus();
  }

  /** A row of slides that moves on by itself; arrows and dots pick one. */
  private buildCarousel(parent: HTMLElement): void {
    const box = el('div', 'menu__carousel', parent);
    const prev = el('button', 'menu__arrow', box, '‹');
    const body = el('div', 'menu__slide', box);
    const next = el('button', 'menu__arrow', box, '›');
    const dots = el('div', 'menu__dots', parent);
    let index = 0;
    const show = (i: number) => {
      index = (i + SLIDES.length) % SLIDES.length;
      const slide = SLIDES[index]!;
      body.replaceChildren();
      el('h3', 'menu__slide-title', body, slide.title);
      const list = el('ul', 'menu__tips', body);
      for (const line of slide.lines) el('li', '', list, line);
      [...dots.children].forEach((d, k) => d.classList.toggle('menu__dot--on', k === index));
    };
    SLIDES.forEach((_, k) => {
      const dot = el('button', 'menu__dot', dots);
      dot.addEventListener('click', () => show(k));
    });
    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    show(0);
    this.carousel = window.setInterval(() => show(index + 1), SLIDE_MS);
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
      const credits = el('button', 'menu__settings', panel, 'Credits');
      credits.addEventListener('click', () => this.go('credits'));
      this.buildCarousel(panel);
      return start;
    }

    el('h2', 'menu__heading', panel, TITLES[screen]);
    if (screen === 'credits') {
      el('p', 'menu__tagline', panel, '© 2026 Agustin Diaz-Cano / Wylan Studios');
      const roll = el('ul', 'menu__credits', panel);
      for (const a of credits) {
        const item = el('li', '', roll);
        el('strong', '', item, a.name);
        item.append(` by ${a.author} · `);
        const link = el('a', '', item, a.license);
        link.href = a.source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      const back = el('button', 'menu__back', panel, '← Back');
      back.addEventListener('click', () => this.go(BACK[screen]));
      return back;
    }
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
  credits: 'Credits',
};
