import './editor.css';
import { z } from 'zod';
import catalogData from '../data/catalog.json';
import { blankMap, exportMap, importMapFile, listMaps, pickMapFile, saveMap } from './maps';
import type { MapData } from './sim';

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

/** A collapsible group of names; groups nest (Vehicles > Military > Land). */
interface Group {
  id: string;
  name: string;
  items?: string[];
  groups?: Group[];
}

const GroupSchema: z.ZodType<Group> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      name: z.string(),
      items: z.array(z.string()).optional(),
      groups: z.array(GroupSchema).optional(),
    })
    .strict(),
);

/** The unit and asset lists of the editor panel (`data/catalog.json`). */
const catalog = z
  .object({ units: z.array(GroupSchema), assets: z.array(GroupSchema) })
  .strict()
  .parse(catalogData);

type TabId = 'units' | 'assets' | 'terrain' | 'logic' | 'players';

const TABS: { id: TabId; label: string }[] = [
  { id: 'units', label: 'Units' },
  { id: 'assets', label: 'Assets' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'logic', label: 'Game logic' },
  { id: 'players', label: 'Players' },
];

const SOON = 'Not built yet';

/**
 * The map editor shell: a top bar (Play / Stop, file and undo buttons) and a right-hand panel with
 * five tabs. It starts paused. Only Play / Stop, the tabs, the collapsible groups and the menu
 * button work; every tool inside the tabs is a placeholder until the next phases.
 */
export class Editor {
  private readonly root = el('div', 'editor editor--hidden');
  private readonly bar = el('div', 'editor__bar', this.root);
  private readonly side = el('aside', 'editor__panel', this.root);
  private readonly body = el('div', 'editor__body', this.side);
  private readonly playButton: HTMLButtonElement;
  private readonly stopBar = el('div', 'editor__stopbar editor__stopbar--hidden', this.root);
  private active = false;
  private playing = false;
  private picked: HTMLElement | null = null;
  private readonly title: HTMLElement;
  private current: MapData = blankMap();

  constructor(
    parent: HTMLElement,
    private readonly actions: {
      onPlay: () => void;
      onStop: () => void;
      onMenu: () => void;
      /** The map being edited changed (new, opened, imported or saved): load it into the game. */
      onMapChange: (map: MapData) => void;
    },
  ) {
    const menu = el('button', 'editor__btn', this.bar, '← Menu');
    menu.addEventListener('click', actions.onMenu);
    this.playButton = el('button', 'editor__btn editor__btn--play', this.bar, '▶ Play');
    this.playButton.addEventListener('click', () => this.setPlaying(true));
    const file = (label: string, action: () => void) =>
      el('button', 'editor__btn', this.bar, label).addEventListener('click', action);
    file('New', () => this.setMap(blankMap()));
    file('Open', () => this.openDialog());
    file('Save', () => this.save());
    file('Export', () => exportMap(this.current));
    file('Import', () => void this.importFile());
    for (const label of ['↶ Undo', '↷ Redo']) {
      const button = el('button', 'editor__btn', this.bar, label);
      button.disabled = true;
      button.title = SOON;
    }
    this.title = el('span', 'editor__title', this.bar);

    const tabs = el('div', 'editor__tabs', this.side);
    this.side.insertBefore(tabs, this.body);
    for (const { id, label } of TABS) {
      const button = el('button', 'editor__tab', tabs, label);
      button.dataset.tab = id;
      button.addEventListener('click', () => this.setTab(id));
    }

    const stop = el('button', 'editor__btn editor__btn--play', this.stopBar, '■ Stop');
    stop.addEventListener('click', () => this.setPlaying(false));
    el('span', 'editor__title', this.stopBar, 'Testing the map');

    parent.appendChild(this.root);
    this.setTab('units');
  }

  /** True while the editor is up and paused (not while testing the map). */
  get isEditing(): boolean {
    return this.active && !this.playing;
  }

  /** Opens the editor, paused, on a new map. */
  open(): void {
    this.active = true;
    this.playing = false;
    this.setMap(blankMap());
    this.refresh();
  }

  private setMap(map: MapData): void {
    this.current = map;
    this.title.textContent = `Map editor · ${map.meta.name}`;
    this.actions.onMapChange(map);
  }

  private save(): void {
    const name = prompt('Map name', this.current.meta.name);
    if (name === null) return;
    // A built-in map is saved as a copy, so the editor now works on the copy.
    this.setMap(saveMap(this.current, name));
  }

  private async importFile(): Promise<void> {
    const file = await pickMapFile();
    if (!file) return;
    try {
      this.setMap(await importMapFile(file));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  /** A small window listing every map (built-in and saved) to open. */
  private openDialog(): void {
    const overlay = el('div', 'editor__dialog', this.root);
    const box = el('div', 'editor__dialog-box', overlay);
    el('h3', 'editor__dialog-title', box, 'Open a map');
    for (const entry of listMaps()) {
      const button = el('button', 'editor__item', box, entry.name);
      el('span', 'editor__tag', button, entry.builtIn ? 'Built-in' : 'Saved');
      button.addEventListener('click', () => {
        overlay.remove();
        this.setMap(entry.map);
      });
    }
    const cancel = el('button', 'editor__btn', box, 'Cancel');
    cancel.addEventListener('click', () => overlay.remove());
  }

  /** Closes the editor altogether (back to the main menu). */
  close(): void {
    this.active = false;
    this.playing = false;
    this.refresh();
  }

  private setPlaying(playing: boolean): void {
    if (!this.active || this.playing === playing) return;
    this.playing = playing;
    this.refresh();
    if (playing) this.actions.onPlay();
    else this.actions.onStop();
  }

  private refresh(): void {
    this.root.classList.toggle('editor--hidden', !this.active);
    this.bar.classList.toggle('editor__bar--hidden', this.playing);
    this.side.classList.toggle('editor__panel--hidden', this.playing);
    this.stopBar.classList.toggle('editor__stopbar--hidden', !this.playing);
    // The game HUD, squad bar and radar belong to play, not to editing.
    document.body.classList.toggle('editing', this.isEditing);
  }

  private setTab(tab: TabId): void {
    this.picked = null;
    for (const button of this.side.querySelectorAll<HTMLElement>('.editor__tab')) {
      button.classList.toggle('editor__tab--on', button.dataset.tab === tab);
    }
    this.body.replaceChildren();
    if (tab === 'units')
      this.groups(catalog.units, 'Click a unit, then click the map to place it.');
    else if (tab === 'assets') this.groups(catalog.assets, 'Click an asset, then click the map.');
    else if (tab === 'terrain') this.terrain();
    else if (tab === 'logic') this.logic();
    else this.players();
  }

  private note(text: string): void {
    el('p', 'editor__note', this.body, text);
  }

  private groups(groups: Group[], hint: string): void {
    this.note(`${hint} (${SOON.toLowerCase()})`);
    const build = (list: Group[], parent: HTMLElement) => {
      for (const group of list) {
        const details = el('details', 'editor__group', parent);
        el('summary', 'editor__summary', details, group.name);
        const inner = el('div', 'editor__items', details);
        for (const name of group.items ?? []) {
          const item = el('button', 'editor__item', inner, name);
          item.addEventListener('click', () => this.pick(item));
        }
        if (group.groups) build(group.groups, inner);
        if (!group.items?.length && !group.groups) el('span', 'editor__empty', inner, 'Empty');
      }
    };
    build(groups, this.body);
  }

  /** Highlights the chosen entry; placing it on the map comes in a later phase. */
  private pick(item: HTMLElement): void {
    this.picked?.classList.remove('editor__item--on');
    this.picked = this.picked === item ? null : item;
    this.picked?.classList.add('editor__item--on');
  }

  private terrain(): void {
    this.note(`Brushes and paint do nothing yet (${SOON.toLowerCase()}).`);
    const tools = el('div', 'editor__items', this.body);
    for (const name of [
      'Raise',
      'Lower',
      'Flatten',
      'Smooth',
      'Water',
      'Paint',
      'Floors and roads',
    ]) {
      const button = el('button', 'editor__item', tools, name);
      button.addEventListener('click', () => this.pick(button));
    }
    this.slider('Brush size', 1, 20, 5);
    this.slider('Strength', 1, 10, 5);
  }

  private logic(): void {
    this.note(`Per-map rules replace the global ones later (${SOON.toLowerCase()}).`);
    this.field('Mode', ['Waves', 'Story']);
    this.field('Difficulty', ['Easy', 'Normal', 'Hard']);
    for (const name of ['Waves', 'Spawn points', 'Objectives', 'Win / lose rules']) {
      const details = el('details', 'editor__group', this.body);
      el('summary', 'editor__summary', details, name);
      el('span', 'editor__empty', el('div', 'editor__items', details), 'Empty');
    }
  }

  private players(): void {
    this.note(`Players own the placed units (${SOON.toLowerCase()}).`);
    for (const [name, kind] of [
      ['Player 1', 'human'],
      ['The horde', 'ai'],
    ]) {
      const row = el('div', 'editor__row', this.body);
      el('span', '', row, name);
      el('span', 'editor__tag', row, kind);
    }
    const add = el('button', 'editor__item', this.body, '+ Add player');
    add.disabled = true;
  }

  private slider(label: string, min: number, max: number, value: number): void {
    const row = el('label', 'editor__row', this.body, label);
    const input = el('input', 'editor__range', row);
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
  }

  private field(label: string, options: string[]): void {
    const row = el('label', 'editor__row', this.body, label);
    const select = el('select', 'editor__select', row);
    for (const option of options) el('option', '', select, option);
  }
}
