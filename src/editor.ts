import './editor.css';
import { z } from 'zod';
import catalogData from '../data/catalog.json';
import { blankMap, exportMap, importMapFile, listMaps, pickMapFile, saveMap } from './maps';
import type { MapData, Vec2 } from './sim';
import { flatHeights, paintCells, plainPaint, sculpt, type SculptMode } from './terrainBrush';
import { terrainData } from './terrainData';

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

interface Item {
  id: string;
  name: string;
  /** Listed but without a rule in the sim yet: shown disabled. */
  mocked?: boolean;
}

/** A collapsible group of items; groups nest (Vehicles > Military > Land). */
interface Group {
  id: string;
  name: string;
  items?: Item[];
  groups?: Group[];
}

const ItemSchema = z
  .object({ id: z.string(), name: z.string(), mocked: z.boolean().optional() })
  .strict();

const GroupSchema: z.ZodType<Group> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      name: z.string(),
      items: z.array(ItemSchema).optional(),
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

/** What the next click on the map places; `owner` is the kind of player that owns a unit. */
interface Tool {
  kind: 'unit' | 'prop';
  id: string;
  name: string;
  owner: 'human' | 'ai';
}
/** An item already on the map: an index into `units` or `props`. */
interface Selection {
  list: 'units' | 'props';
  index: number;
}

/** A click this close (metres) to a unit picks it. */
const PICK_RADIUS = 1;
const PROP_SNAP = 0.5;
const UNIT_TURN = Math.PI / 4;
const PROP_TURN = Math.PI / 2;
/** The plain block's collider (half sides), as in the development arena. */
const BLOCK_HALF = 1.5;
const HISTORY_LIMIT = 100;
/** Minimum time (ms) between two applications of a brush while the mouse moves. */
const BRUSH_INTERVAL = 40;
/** Metres a height brush moves the ground per application at strength 1. */
const SCULPT_STEP = 0.05;
/** Blend per application at strength 1 for the flatten and smooth brushes. */
const BLEND_STEP = 0.05;

type TerrainTool = SculptMode | 'paint' | 'road';
const TERRAIN_TOOLS: { id: TerrainTool; label: string }[] = [
  { id: 'raise', label: 'Raise' },
  { id: 'lower', label: 'Lower' },
  { id: 'flatten', label: 'Flatten' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'paint', label: 'Paint' },
  { id: 'road', label: 'Floors and roads' },
];
/** A drag shorter than this (metres) is a click, not a move. */
const DRAG_EPSILON = 0.05;

/**
 * The map editor: a top bar (Play / Stop, file and undo buttons) and a right-hand panel with five
 * tabs. It starts paused. The Units and Assets tabs place, move, rotate and delete things on the
 * map, and the Terrain tab sculpts, paints, floods and lays roads (all with undo / redo); Game
 * logic and Players are placeholders until the next phases. Every edit makes a
 * new immutable map and hands it to the game, which redraws it.
 */
export class Editor {
  private readonly root = el('div', 'editor editor--hidden');
  private readonly bar = el('div', 'editor__bar', this.root);
  private readonly side = el('aside', 'editor__panel', this.root);
  private readonly body = el('div', 'editor__body', this.side);
  private readonly info = el('div', 'editor__info', this.side);
  private readonly playButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly stopBar = el('div', 'editor__stopbar editor__stopbar--hidden', this.root);
  private active = false;
  private playing = false;
  private picked: HTMLElement | null = null;
  private tool: Tool | null = null;
  private selection: Selection | null = null;
  /** The mouse is down on the selection; `dragMoved` once it has actually moved. */
  private dragging = false;
  private dragMoved = false;
  private tab: TabId = 'units';
  private terrainTool: TerrainTool | null = null;
  private brushSize = 5;
  private brushStrength = 5;
  private texture = terrainData.defaultTexture;
  private roadTexture = terrainData.roads[0]!.id;
  private roadWidth = 3;
  /** A brush stroke is going on (mouse held); `strokeHeight` is what flatten pulls towards. */
  private stroking = false;
  private strokeRecorded = false;
  private strokeHeight = 0;
  private lastBrush = 0;
  /** Index of the road being drawn (each click adds a point), or null. */
  private roadIndex: number | null = null;
  private waterDragging = false;
  private past: MapData[] = [];
  private future: MapData[] = [];
  private readonly title: HTMLElement;
  private current: MapData = blankMap();

  constructor(
    parent: HTMLElement,
    private readonly actions: {
      onPlay: () => void;
      onStop: () => void;
      onMenu: () => void;
      /** The map being edited changed (new, opened, imported, saved or edited): load it into the game. */
      onMapChange: (map: MapData, unitsKept: boolean) => void;
      /** The 3D view the map is drawn on, and the ground point under a normalised screen position. */
      canvas: HTMLElement;
      groundAt: (ndcX: number, ndcY: number) => Vec2 | null;
      /** Shows a ring at the selected item (null hides it). */
      onMark: (at: Vec2 | null, radius: number) => void;
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
    this.undoButton = el('button', 'editor__btn', this.bar, '↶ Undo');
    this.undoButton.addEventListener('click', () => this.undo());
    this.redoButton = el('button', 'editor__btn', this.bar, '↷ Redo');
    this.redoButton.addEventListener('click', () => this.redo());
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

    actions.canvas.addEventListener('mousedown', this.onMouseDown);
    actions.canvas.addEventListener('contextmenu', (e) => {
      if (this.isEditing) e.preventDefault();
    });
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.stroking = false;
    });
    window.addEventListener('keydown', this.onKeyDown);
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

  /** Loads a whole other map: the edit history and the selection start over. */
  private setMap(map: MapData): void {
    this.current = map;
    this.past = [];
    this.future = [];
    this.selection = null;
    this.roadIndex = null;
    this.title.textContent = `Map editor · ${map.meta.name}`;
    this.actions.onMapChange(map, false);
    this.syncSelection();
  }

  /** One edit of the current map; `record` is false for the rest of a drag (its start is in the history). */
  private edit(next: MapData, record = true): void {
    if (record) {
      this.past.push(this.current);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
    }
    this.apply(next);
  }

  private apply(map: MapData): void {
    const unitsKept = map.units === this.current.units && map.players === this.current.players;
    this.current = map;
    this.actions.onMapChange(map, unitsKept);
    this.syncSelection();
  }

  private undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.current);
    this.apply(previous);
  }

  private redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.current);
    this.apply(next);
  }

  /** The position and size of the selected item, if it still exists. */
  private selected(): { at: Vec2; radius: number; label: string } | null {
    const sel = this.selection;
    if (!sel) return null;
    if (sel.list === 'units') {
      const u = this.current.units[sel.index];
      return u ? { at: u, radius: PICK_RADIUS, label: this.nameOf(u.type) } : null;
    }
    const p = this.current.props[sel.index];
    if (!p) return null;
    const half = p.collider ? Math.max(p.collider.halfW, p.collider.halfD) : BLOCK_HALF;
    return { at: p, radius: half * 1.5, label: this.nameOf(p.asset) };
  }

  private nameOf(id: string): string {
    const find = (groups: Group[]): string | undefined => {
      for (const g of groups) {
        const hit = g.items?.find((i) => i.id === id)?.name ?? find(g.groups ?? []);
        if (hit) return hit;
      }
      return undefined;
    };
    return find(catalog.units) ?? find(catalog.assets) ?? id;
  }

  /** Refreshes the selection ring, the info line and the undo / redo buttons. */
  private syncSelection(): void {
    const sel = this.selected();
    if (!sel) this.selection = null;
    this.actions.onMark(sel ? sel.at : null, sel?.radius ?? 1);
    this.info.textContent = this.tool
      ? `Placing: ${this.tool.name}. Click the map to place; right-click or Esc to stop.`
      : sel
        ? `Selected: ${sel.label} (${sel.at.x.toFixed(1)}, ${sel.at.z.toFixed(1)}). Drag moves, R rotates, Delete removes.`
        : 'Click an item on the map to select it.';
    this.undoButton.disabled = this.past.length === 0;
    this.redoButton.disabled = this.future.length === 0;
  }

  private ownerId(kind: 'human' | 'ai'): string | undefined {
    return this.current.players.find((p) => p.kind === kind)?.id;
  }

  /** The ground point under the mouse, kept inside the map. */
  private ground(e: MouseEvent): Vec2 | null {
    const rect = this.actions.canvas.getBoundingClientRect();
    const at = this.actions.groundAt(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    if (!at) return null;
    const lim = this.current.meta.size.width / 2;
    return { x: Math.min(Math.max(at.x, -lim), lim), z: Math.min(Math.max(at.z, -lim), lim) };
  }

  /** The unit or prop under a ground point (units first: they are small and can stand on props). */
  private pickAt(at: Vec2): Selection | null {
    let best: Selection | null = null;
    let bestDist = PICK_RADIUS;
    this.current.units.forEach((u, index) => {
      const d = Math.hypot(u.x - at.x, u.z - at.z);
      if (d < bestDist) {
        bestDist = d;
        best = { list: 'units', index };
      }
    });
    if (best) return best;
    const hit = this.current.props.findIndex((p) => {
      const half = p.collider ?? { halfW: BLOCK_HALF, halfD: BLOCK_HALF };
      const turned = Math.round(p.rotation / PROP_TURN) % 2 !== 0;
      return (
        Math.abs(at.x - p.x) <= (turned ? half.halfD : half.halfW) &&
        Math.abs(at.z - p.z) <= (turned ? half.halfW : half.halfD)
      );
    });
    return hit >= 0 ? { list: 'props', index: hit } : null;
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.isEditing) return;
    if (this.tab === 'terrain') {
      this.terrainMouseDown(e);
      return;
    }
    if (this.tab !== 'units' && this.tab !== 'assets') return;
    if (e.button === 2) {
      // A right click drops the tool; dragging with it still rotates the camera.
      this.setTool(null);
      return;
    }
    if (e.button !== 0) return;
    const at = this.ground(e);
    if (!at) return;
    if (this.tool) {
      this.place(this.tool, at);
      return;
    }
    this.selection = this.pickAt(at);
    this.dragging = this.selection !== null;
    this.dragMoved = false;
    this.syncSelection();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.stroking && this.isEditing) {
      const now = performance.now();
      const at = this.ground(e);
      if (at && now - this.lastBrush >= BRUSH_INTERVAL) {
        this.lastBrush = now;
        this.brush(at);
      }
      return;
    }
    const sel = this.selection;
    const now = this.selected();
    if (!this.dragging || !sel || !now || !this.isEditing) return;
    const at = this.ground(e);
    if (!at) return;
    if (Math.abs(now.at.x - at.x) < DRAG_EPSILON && Math.abs(now.at.z - at.z) < DRAG_EPSILON) {
      return;
    }
    // Only the first step of a drag goes into the history, so one undo takes the whole move back.
    this.edit(this.movedTo(sel, at), !this.dragMoved);
    this.dragMoved = true;
  };

  private movedTo(sel: Selection, at: Vec2): MapData {
    const m = this.current;
    if (sel.list === 'units') {
      return { ...m, units: m.units.map((u, i) => (i === sel.index ? { ...u, ...at } : u)) };
    }
    const snap = (v: number) => Math.round(v / PROP_SNAP) * PROP_SNAP;
    return {
      ...m,
      props: m.props.map((p, i) => (i === sel.index ? { ...p, x: snap(at.x), z: snap(at.z) } : p)),
    };
  }

  private place(tool: Tool, at: Vec2): void {
    const m = this.current;
    if (tool.kind === 'prop') {
      const prop = {
        asset: tool.id,
        x: Math.round(at.x / PROP_SNAP) * PROP_SNAP,
        z: Math.round(at.z / PROP_SNAP) * PROP_SNAP,
        rotation: 0,
        scale: 1,
        layer: 'outdoor' as const,
        collider: { halfW: BLOCK_HALF, halfD: BLOCK_HALF },
      };
      this.selection = { list: 'props', index: m.props.length };
      this.edit({ ...m, props: [...m.props, prop] });
      return;
    }
    const owner = this.ownerId(tool.owner);
    if (!owner) {
      alert(`This map has no ${tool.owner} player to own the unit.`);
      return;
    }
    this.selection = { list: 'units', index: m.units.length };
    this.edit({
      ...m,
      units: [...m.units, { type: tool.id, x: at.x, z: at.z, owner, rotation: 0 }],
    });
  }

  private rotateSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    const m = this.current;
    if (sel.list === 'units') {
      const units = m.units.map((u, i) =>
        i === sel.index ? { ...u, rotation: (u.rotation ?? 0) + UNIT_TURN } : u,
      );
      this.edit({ ...m, units });
    } else {
      const props = m.props.map((p, i) =>
        i === sel.index ? { ...p, rotation: p.rotation + PROP_TURN } : p,
      );
      this.edit({ ...m, props });
    }
  }

  private deleteSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    const m = this.current;
    this.selection = null;
    if (sel.list === 'units') this.edit({ ...m, units: m.units.filter((_, i) => i !== sel.index) });
    else this.edit({ ...m, props: m.props.filter((_, i) => i !== sel.index) });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isEditing) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      this.redo();
    } else if (key === 'delete' || key === 'backspace') this.deleteSelected();
    else if (key === 'r') this.rotateSelected();
    else if (key === 'escape') {
      this.setTool(null);
      this.roadIndex = null;
    }
  };

  private terrainMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      // A right click ends the road being drawn; dragging with it still rotates the camera.
      this.roadIndex = null;
      return;
    }
    if (e.button !== 0 || !this.terrainTool) return;
    const at = this.ground(e);
    if (!at) return;
    if (this.terrainTool === 'road') {
      this.addRoadPoint(at);
      return;
    }
    this.stroking = true;
    this.strokeRecorded = false;
    this.strokeHeight = this.heightsOf().at(at);
    this.lastBrush = performance.now();
    this.brush(at);
  }

  /** The height grid (flat if the map has none yet) and a reader for the vertex nearest a point. */
  private heightsOf() {
    const size = this.current.meta.size.width;
    const heights = this.current.terrain.heights ?? flatHeights(size);
    return {
      heights,
      at: (p: Vec2) => {
        const gx = Math.min(Math.max(Math.round(p.x + size / 2), 0), size);
        const gz = Math.min(Math.max(Math.round(p.z + size / 2), 0), size);
        return heights[gz]![gx]!;
      },
    };
  }

  /** One application of the active brush at a ground point; a stroke is one history step. */
  private brush(at: Vec2): void {
    const tool = this.terrainTool;
    if (!tool || tool === 'road') return;
    const m = this.current;
    const size = m.meta.size.width;
    let terrain = m.terrain;
    if (tool === 'paint') {
      const paint = m.terrain.paint ?? plainPaint(size, terrainData.defaultTexture);
      terrain = {
        ...terrain,
        paint: paintCells(paint, size / 2, at, this.brushSize, this.texture),
      };
    } else {
      const amount =
        tool === 'raise' || tool === 'lower'
          ? SCULPT_STEP * this.brushStrength
          : BLEND_STEP * this.brushStrength;
      const heights = sculpt(
        this.heightsOf().heights,
        size / 2,
        tool,
        at,
        this.brushSize,
        amount,
        this.strokeHeight,
        [terrainData.minHeight, terrainData.maxHeight],
      );
      terrain = { ...terrain, heights };
    }
    this.edit({ ...m, terrain }, !this.strokeRecorded);
    this.strokeRecorded = true;
  }

  /** Each click of the road tool adds a point; the first click starts a new road. */
  private addRoadPoint(at: Vec2): void {
    const m = this.current;
    const point = { x: Math.round(at.x), z: Math.round(at.z) };
    const index = this.roadIndex;
    const road = index === null ? undefined : m.surfaces[index];
    if (index === null || !road) {
      this.roadIndex = m.surfaces.length;
      const surface = { asset: this.roadTexture, path: [point, point], width: this.roadWidth };
      this.edit({ ...m, surfaces: [...m.surfaces, surface] });
      return;
    }
    const first = road.path[0]!;
    const last = road.path[1]!;
    // The first click made a two-point road at one spot; the second click moves its end.
    const fresh = road.path.length === 2 && last.x === first.x && last.z === first.z;
    const path = fresh ? [first, point] : [...road.path, point];
    this.edit({ ...m, surfaces: m.surfaces.map((r, i) => (i === index ? { ...r, path } : r)) });
  }

  private setWater(level: number | null, record: boolean): void {
    const m = this.current;
    const heights = m.terrain.heights ?? flatHeights(m.meta.size.width);
    this.edit({ ...m, terrain: { ...m.terrain, heights, water: level } }, record);
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
    if (playing) {
      this.actions.onMark(null, 1);
      this.actions.onPlay();
    } else {
      this.actions.onStop();
      this.syncSelection();
    }
  }

  private refresh(): void {
    this.root.classList.toggle('editor--hidden', !this.active);
    this.bar.classList.toggle('editor__bar--hidden', this.playing);
    this.side.classList.toggle('editor__panel--hidden', this.playing);
    this.stopBar.classList.toggle('editor__stopbar--hidden', !this.playing);
    // The game HUD, squad bar and radar belong to play, not to editing.
    document.body.classList.toggle('editing', this.isEditing);
    if (!this.active) this.actions.onMark(null, 1);
  }

  private setTab(tab: TabId): void {
    this.tab = tab;
    this.roadIndex = null;
    this.setTool(null);
    for (const button of this.side.querySelectorAll<HTMLElement>('.editor__tab')) {
      button.classList.toggle('editor__tab--on', button.dataset.tab === tab);
    }
    this.body.replaceChildren();
    if (tab === 'units')
      this.groups(catalog.units, 'Click a unit, then click the map to place it.', 'unit');
    else if (tab === 'assets')
      this.groups(catalog.assets, 'Click an asset, then click the map.', 'prop');
    else if (tab === 'terrain') this.terrain();
    else if (tab === 'logic') this.logic();
    else this.players();
  }

  private note(text: string): void {
    el('p', 'editor__note', this.body, text);
  }

  /** The catalog lists; picking an entry arms it as the tool for the next map clicks. */
  private groups(groups: Group[], hint: string, kind: Tool['kind']): void {
    this.note(hint);
    const build = (list: Group[], parent: HTMLElement, humans: boolean) => {
      for (const group of list) {
        const details = el('details', 'editor__group', parent);
        el('summary', 'editor__summary', details, group.name);
        const inner = el('div', 'editor__items', details);
        const isHuman = humans || group.id === 'humans';
        for (const item of group.items ?? []) {
          const button = el('button', 'editor__item', inner, item.name);
          if (item.mocked) {
            button.disabled = true;
            button.title = SOON;
          }
          button.addEventListener('click', () => {
            const same = this.tool?.id === item.id;
            this.setTool(
              same ? null : { kind, id: item.id, name: item.name, owner: isHuman ? 'human' : 'ai' },
              button,
            );
          });
        }
        if (group.groups) build(group.groups, inner, isHuman);
        if (!group.items?.length && !group.groups) el('span', 'editor__empty', inner, 'Empty');
      }
    };
    build(groups, this.body, false);
  }

  /** Arms (or drops) the placing tool and highlights its button. */
  private setTool(tool: Tool | null, button?: HTMLElement): void {
    this.tool = tool;
    this.picked?.classList.remove('editor__item--on');
    this.picked = tool ? (button ?? null) : null;
    this.picked?.classList.add('editor__item--on');
    this.syncSelection();
  }

  private terrain(): void {
    this.note('Pick a tool, then click or drag on the map. Water fills ground below its level.');
    const tools = el('div', 'editor__items', this.body);
    for (const { id, label } of TERRAIN_TOOLS) {
      const button = el('button', 'editor__item', tools, label);
      if (id === this.terrainTool) button.classList.add('editor__item--on');
      button.addEventListener('click', () => {
        this.roadIndex = null;
        this.terrainTool = this.terrainTool === id ? null : id;
        this.setTab('terrain');
      });
    }
    const tool = this.terrainTool;
    if (tool === 'paint') {
      this.choice('Texture', terrainData.textures, this.texture, (id) => (this.texture = id));
      this.slider('Brush size', 1, 20, this.brushSize, (v) => (this.brushSize = v));
    } else if (tool === 'road') {
      this.choice('Surface', terrainData.roads, this.roadTexture, (id) => (this.roadTexture = id));
      this.slider('Width', 1, 8, this.roadWidth, (v) => (this.roadWidth = v));
      this.note('Click to add points; right-click or Esc finishes the road.');
      const clear = el('button', 'editor__item', this.body, 'Remove all roads');
      clear.addEventListener('click', () => {
        this.roadIndex = null;
        this.edit({ ...this.current, surfaces: [] });
      });
    } else if (tool) {
      this.slider('Brush size', 1, 20, this.brushSize, (v) => (this.brushSize = v));
      this.slider('Strength', 1, 10, this.brushStrength, (v) => (this.brushStrength = v));
    }
    this.waterControls();
  }

  /** A checkbox and a level slider: ground below the level is wet and blocks walkers. */
  private waterControls(): void {
    const water = this.current.terrain.water;
    const row = el('label', 'editor__row', this.body, 'Water');
    const toggle = el('input', '', row);
    toggle.type = 'checkbox';
    toggle.checked = water !== null;
    toggle.addEventListener('change', () => {
      this.setWater(toggle.checked ? 0 : null, true);
      this.setTab('terrain');
    });
    if (water === null) return;
    const label = (v: number) => `Level ${v.toFixed(1)} m`;
    const level = el('label', 'editor__row', this.body, label(water));
    const input = el('input', 'editor__range', level);
    input.type = 'range';
    input.min = String(terrainData.minHeight);
    input.max = String(terrainData.maxHeight);
    input.step = '0.1';
    input.value = String(water);
    input.addEventListener('input', () => {
      // The first move of a drag is the history step.
      this.setWater(Number(input.value), !this.waterDragging);
      this.waterDragging = true;
      level.firstChild!.textContent = label(Number(input.value));
    });
    input.addEventListener('change', () => (this.waterDragging = false));
  }

  private choice(
    label: string,
    options: { id: string; name: string }[],
    value: string,
    onPick: (id: string) => void,
  ): void {
    const row = el('label', 'editor__row', this.body, label);
    const select = el('select', 'editor__select', row);
    for (const o of options) {
      const option = el('option', '', select, o.name);
      option.value = o.id;
    }
    select.value = value;
    select.addEventListener('change', () => onPick(select.value));
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

  private slider(
    label: string,
    min: number,
    max: number,
    value: number,
    onInput: (value: number) => void,
  ): void {
    const row = el('label', 'editor__row', this.body, label);
    const input = el('input', 'editor__range', row);
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('input', () => onInput(Number(input.value)));
  }

  private field(label: string, options: string[]): void {
    const row = el('label', 'editor__row', this.body, label);
    const select = el('select', 'editor__select', row);
    for (const option of options) el('option', '', select, option);
  }
}
