import './editor.css';
import { z } from 'zod';
import catalogData from '../data/catalog.json';
import gameData from '../data/game.json';
import itemsData from '../data/items.json';
import { blankMap, exportMap, importMapFile, listMaps, pickMapFile, saveMap } from './maps';
import { objectiveLabel } from './hud';
import { isDialogOpen, openInventory, openStats } from './unitDialogs';
import {
  defaultEnvironment,
  spawnerEnemy,
  type Environment,
  type MapData,
  type MapLogic,
  type Objective,
  type Vec2,
} from './sim';
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
  /** What its items place; groups without it inherit the tab's kind. */
  kind?: Tool['kind'];
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

/** Lists of the map's rules that hold things with a place (structures, objects, loose items). */
const LOGIC_LISTS = ['structures', 'objects', 'items'] as const;
type LogicList = (typeof LOGIC_LISTS)[number];
/** One entry of those lists; only the fields each list uses are set. */
interface LogicEntry {
  x: number;
  z: number;
  type?: string;
  item?: string;
  turns?: number;
  level?: number;
  open?: boolean;
  lock?: string;
  link?: number;
  count?: number;
}
type StructureSheet = {
  name: string;
  halfW: number;
  halfD: number;
  door?: boolean;
  switch?: boolean;
};
const structureSheet = (type: string | undefined): StructureSheet | undefined =>
  (gameData.structures.types as Record<string, StructureSheet>)[type ?? ''];

/** The placeable things that live in the map's rules, listed after the catalog's assets. */
const logicGroups: Group[] = [
  {
    id: 'structures',
    name: 'Structures (built from the start)',
    kind: 'structure',
    items: Object.entries(gameData.structures.types).map(([id, d]) => ({ id, name: d.name })),
  },
  {
    id: 'objects',
    name: 'Objects',
    kind: 'object',
    items: Object.entries(gameData.objects.types).map(([id, d]) => ({ id, name: d.name })),
  },
  {
    id: 'looseItems',
    name: 'Loose items',
    kind: 'item',
    items: Object.entries(itemsData.items)
      .filter(([, d]) => !('innate' in d && d.innate))
      .map(([id, d]) => ({ id, name: d.name })),
  },
];

type TabId = 'units' | 'assets' | 'terrain' | 'logic' | 'sky' | 'players';

const TABS: { id: TabId; label: string }[] = [
  { id: 'units', label: 'Units' },
  { id: 'assets', label: 'Assets' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'logic', label: 'Game logic' },
  { id: 'sky', label: 'Environment' },
  { id: 'players', label: 'Players' },
];

const SOON = 'Not built yet';

/** "14:30 · Day" for the time-of-day slider. */
function hourLabel(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const phase =
    hour < 4.5 || hour >= 21
      ? 'Night'
      : hour < 7.5
        ? 'Dawn'
        : hour < 16.5
          ? 'Day'
          : hour < 19.5
            ? 'Dusk'
            : 'Evening';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${phase}`;
}

/** Off / Light / Medium / Heavy / Extreme for a 0 to 1 weather strength. */
const strengthLabel = (v: number): string =>
  v <= 0 ? 'Off' : v < 0.3 ? 'Light' : v < 0.6 ? 'Medium' : v < 0.85 ? 'Heavy' : 'Extreme';

/** What the next click on the map places; `owner` is the kind of player that owns a unit. */
interface Tool {
  kind: 'unit' | 'prop' | 'structure' | 'object' | 'item';
  id: string;
  name: string;
  owner: 'human' | 'ai';
}
/** An item already on the map: an index into `units` or `props`. */
/** Map sizes the New dialog accepts, in metres per side. */
const MIN_MAP_SIZE = 20;
const MAX_MAP_SIZE = 200;
/** How far a pasted copy lands from the one it copies. */
const PASTE_OFFSET = 2;

interface Selection {
  list: 'units' | 'props' | LogicList;
  index: number;
}

/** A click this close (metres) to a unit picks it. */
const PICK_RADIUS = 1;
/** A click this close (metres) to a loose item or an object picks it. */
const LOOSE_PICK = 0.8;
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
/** An item ignores the pointer while it is closer than this (m): its direction would flicker. */
const FACE_MIN_DISTANCE = 0.3;
/** A box drag shorter than this (px) is a click. */
const BOX_MIN_PX = 5;

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
  /** Properties of the one structure selected (lock, link, starts open). */
  private readonly propsBox = el('div', 'editor__props', this.side);
  private readonly playButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly stopBar = el('div', 'editor__stopbar editor__stopbar--hidden', this.root);
  private active = false;
  private playing = false;
  private picked: HTMLElement | null = null;
  private tool: Tool | null = null;
  private selection: Selection[] = [];
  /** What Ctrl+C remembered. */
  private clipboard: {
    units: MapData['units'];
    props: MapData['props'];
    logic: Partial<Record<LogicList, LogicEntry[]>>;
  } | null = null;
  private drag: {
    mode: 'move' | 'face' | 'box';
    button: number;
    /** The map when the drag began: every step is computed from it, not from the last step. */
    base: MapData;
    from: Vec2;
    client: { x: number; y: number };
    additive: boolean;
  } | null = null;
  /** R is held: a right-drag turns the selection, and letting go without dragging turns one step. */
  private rHeld = false;
  private rUsed = false;
  /** A slider or colour drag is in progress: its steps after the first are not undo steps. */
  private sliding = false;
  private boxEnd: { x: number; y: number } | null = null;
  private readonly boxEl: HTMLElement;
  /** The mouse is down on the selection; `dragMoved` once it has actually moved. */
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
  /** The Game logic tab is armed: the next map clicks add spawn points. */
  /** Which click-to-place tool of the Game logic tab is armed. */
  private pageTitle = document.title;
  private spawnTool: 'spawn' | 'goal' | 'fire' | null = null;
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
      onMarks: (marks: { at: Vec2; radius: number }[]) => void;
      /** Shows the map's enemy spawn points while editing (null hides them). */
      onSpawnMarks: (points: Vec2[] | null) => void;
    },
  ) {
    const menu = el('button', 'editor__btn', this.bar, '← Menu');
    menu.addEventListener('click', actions.onMenu);
    this.playButton = el('button', 'editor__btn editor__btn--play', this.bar, '▶ Play');
    this.playButton.addEventListener('click', () => this.setPlaying(true));
    const file = (label: string, action: () => void) =>
      el('button', 'editor__btn', this.bar, label).addEventListener('click', action);
    file('New', () => this.newDialog());
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

    this.boxEl = el('div', 'editor__box', this.root);
    parent.appendChild(this.root);
    this.setTab('units');

    actions.canvas.addEventListener('mousedown', this.onMouseDown);
    actions.canvas.addEventListener('contextmenu', (e) => {
      if (this.isEditing) e.preventDefault();
    });
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', () => {
      this.endDrag();
      this.stroking = false;
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() !== 'r' || !this.rHeld) return;
      this.rHeld = false;
      if (!this.rUsed && this.isEditing) this.rotateSelected();
    });
    window.addEventListener('blur', () => (this.rHeld = false));
  }

  /** True while the editor is up and paused (not while testing the map). */
  get isEditing(): boolean {
    return this.active && !this.playing;
  }

  /** Opens the editor, paused, on a new map. */
  open(): void {
    this.active = true;
    this.pageTitle = document.title;
    document.title = 'Wylan Engine – Map editor';
    this.playing = false;
    this.setMap(blankMap());
    this.refresh();
  }

  /** Loads a whole other map: the edit history and the selection start over. */
  private setMap(map: MapData): void {
    this.current = map;
    this.past = [];
    this.future = [];
    this.selection = [];
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
    const unitsKept =
      map.units === this.current.units &&
      map.players === this.current.players &&
      LOGIC_LISTS.every((list) => map.logic[list] === this.current.logic[list]);
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

  /** The position and size of one selected item, if it still exists. */
  private resolve(sel: Selection): { at: Vec2; radius: number; label: string } | null {
    if (sel.list === 'units') {
      const u = this.current.units[sel.index];
      return u ? { at: u, radius: PICK_RADIUS, label: this.nameOf(u.type) } : null;
    }
    if (sel.list !== 'props') {
      const entry = this.logicList(this.current, sel.list)[sel.index];
      if (!entry) return null;
      const sheet = structureSheet(entry.type);
      const radius =
        sel.list === 'structures' && sheet ? Math.max(sheet.halfW, sheet.halfD) * 1.5 : 1;
      return { at: entry, radius, label: this.logicName(sel.list, entry) };
    }
    const p = this.current.props[sel.index];
    if (!p) return null;
    const half = p.collider ? Math.max(p.collider.halfW, p.collider.halfD) : BLOCK_HALF;
    return { at: p, radius: half * 1.5, label: this.nameOf(p.asset) };
  }

  /** The entries of one of the map's placeable lists (none when the map has not got the list yet). */
  private logicList(m: MapData, list: LogicList): LogicEntry[] {
    return (m.logic[list] ?? []) as LogicEntry[];
  }

  /** `m` with one of those lists replaced. */
  private withLogicList(m: MapData, list: LogicList, entries: LogicEntry[]): MapData {
    return { ...m, logic: { ...m.logic, [list]: entries } as MapLogic };
  }

  private logicName(list: LogicList, e: LogicEntry): string {
    if (list === 'structures') return structureSheet(e.type)?.name ?? e.type ?? 'Structure';
    if (list === 'objects') {
      const types = gameData.objects.types as Record<string, { name: string }>;
      return types[e.type ?? '']?.name ?? e.type ?? 'Object';
    }
    const items = itemsData.items as Record<string, { name: string }>;
    return items[e.item ?? '']?.name ?? e.item ?? 'Item';
  }

  /** The selected items that still exist (an undo can remove some). */
  private selectedItems(): { sel: Selection; at: Vec2; radius: number; label: string }[] {
    return this.selection.flatMap((sel) => {
      const r = this.resolve(sel);
      return r ? [{ sel, ...r }] : [];
    });
  }

  private isSelected(hit: Selection): boolean {
    return this.selection.some((s) => s.list === hit.list && s.index === hit.index);
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

  /** Refreshes the selection rings, the info line and the undo / redo buttons. */
  private syncSelection(): void {
    const items = this.selectedItems();
    this.selection = items.map((i) => i.sel);
    this.actions.onMarks(this.isEditing ? items.map((i) => ({ at: i.at, radius: i.radius })) : []);
    this.actions.onSpawnMarks(
      this.isEditing
        ? [
            ...(this.current.logic.spawnPoints ?? []),
            ...this.current.units.filter((u) => spawnerEnemy(u.type) !== null),
          ]
        : null,
    );
    const one = items.length === 1 ? items[0]! : null;
    this.info.textContent = this.spawnTool
      ? `Placing ${this.spawnTool === 'goal' ? 'a goal spot' : this.spawnTool === 'fire' ? 'fires' : 'spawn points'}. Click the map to add one; right-click or Esc to stop.`
      : this.tool
        ? `Placing: ${this.tool.name}. Click the map to place; right-click or Esc to stop.`
        : one
          ? `Selected: ${one.label} (${one.at.x.toFixed(1)}, ${one.at.z.toFixed(1)}). Drag or right-drag moves, hold R and right-drag to aim it, Ctrl+C / V copies, Delete removes.`
          : items.length > 1
            ? `${items.length} items selected. Drag or right-drag moves them, hold R and right-drag to aim them, Ctrl+C / V copies, Delete removes.`
            : 'Click an item to select it, or drag a box around several (Shift adds).';
    this.undoButton.disabled = this.past.length === 0;
    this.redoButton.disabled = this.future.length === 0;
    this.renderProps();
  }

  /** Lock, link and starting state of the one structure selected (doors and switches). */
  private renderProps(): void {
    this.propsBox.replaceChildren();
    const only = this.selection.length === 1 ? this.selection[0]! : null;
    if (!this.isEditing || !only || only.list !== 'structures') return;
    const index = only.index;
    const entry = this.logicList(this.current, 'structures')[index];
    const sheet = structureSheet(entry?.type);
    if (!entry || !sheet || !(sheet.door || sheet.switch)) return;
    const change = (patch: Partial<LogicEntry>) =>
      this.edit(
        this.withLogicList(
          this.current,
          'structures',
          this.logicList(this.current, 'structures').map((e, i) =>
            i === index ? { ...e, ...patch } : e,
          ),
        ),
      );
    el('div', 'editor__label', this.propsBox, sheet.name);
    const link = el('label', 'editor__row', this.propsBox, 'Link (switch group)');
    const linkInput = el('input', 'editor__number', link);
    linkInput.type = 'number';
    linkInput.min = '0';
    linkInput.value = String(entry.link ?? 0);
    linkInput.addEventListener('change', () => {
      const v = Math.round(Number(linkInput.value));
      change({ link: Number.isFinite(v) && v >= 0 ? v : 0 });
    });
    const open = el(
      'label',
      'editor__row',
      this.propsBox,
      sheet.switch ? 'Starts on' : 'Starts open',
    );
    const openBox = el('input', '', open);
    openBox.type = 'checkbox';
    openBox.checked = entry.open === true;
    openBox.addEventListener('change', () => change({ open: openBox.checked }));
    if (!sheet.door) return;
    const lock = el('label', 'editor__row', this.propsBox, 'Locked with');
    const select = el('select', 'editor__select', lock);
    el('option', '', select, 'Nothing').value = '';
    for (const [id, def] of Object.entries(itemsData.items)) {
      if (def.type === 'key') el('option', '', select, def.name).value = id;
    }
    select.value = entry.lock ?? '';
    select.addEventListener('change', () => {
      const next = this.logicList(this.current, 'structures').map((e, i) => {
        if (i !== index) return e;
        const copy = { ...e };
        if (select.value) copy.lock = select.value;
        else delete copy.lock;
        return copy;
      });
      this.edit(this.withLogicList(this.current, 'structures', next));
    });
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
    // Loose items and objects are small: the nearest within a short reach.
    let nearest: Selection | null = null;
    let nearestDist = LOOSE_PICK;
    for (const list of ['items', 'objects'] as const) {
      this.logicList(this.current, list).forEach((e, index) => {
        const d = Math.hypot(e.x - at.x, e.z - at.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = { list, index };
        }
      });
    }
    if (nearest) return nearest;
    const built = this.logicList(this.current, 'structures').findIndex((st) => {
      const sheet = structureSheet(st.type);
      if (!sheet) return false;
      const turned = (st.turns ?? 0) % 2 !== 0;
      return (
        Math.abs(at.x - st.x) <= (turned ? sheet.halfD : sheet.halfW) &&
        Math.abs(at.z - st.z) <= (turned ? sheet.halfW : sheet.halfD)
      );
    });
    if (built >= 0) return { list: 'structures', index: built };
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
    if (this.tab === 'logic') {
      this.logicMouseDown(e);
      return;
    }
    if (this.tab !== 'units' && this.tab !== 'assets') return;
    if (e.button === 2) {
      // A right click drops the tool. Dragging from an item moves it (it gets selected first);
      // with R held, the selection turns to face the pointer. Anywhere else the camera orbits.
      if (this.tool) {
        this.setTool(null);
        return;
      }
      const at = this.ground(e);
      const hit = at ? this.pickAt(at) : null;
      if (!at) return;
      if (this.rHeld && (hit || this.selection.length > 0)) {
        if (hit && !this.isSelected(hit)) this.selection = [hit];
        this.rUsed = true;
        this.startDrag('face', 2, at, e);
        this.syncSelection();
      } else if (hit) {
        if (!this.isSelected(hit)) this.selection = [hit];
        this.startDrag('move', 2, at, e);
        this.syncSelection();
      }
      return;
    }
    if (e.button !== 0) return;
    const at = this.ground(e);
    if (!at) return;
    if (this.tool) {
      this.place(this.tool, at);
      return;
    }
    const hit = this.pickAt(at);
    if (hit && e.shiftKey) {
      // Shift-click adds an item to the selection or takes it out.
      this.selection = this.isSelected(hit)
        ? this.selection.filter((s) => !(s.list === hit.list && s.index === hit.index))
        : [...this.selection, hit];
    } else if (hit) {
      if (!this.isSelected(hit)) this.selection = [hit];
      this.startDrag('move', 0, at, e);
    } else {
      if (!e.shiftKey) this.selection = [];
      this.startDrag('box', 0, at, e);
    }
    this.syncSelection();
  };

  private startDrag(mode: 'move' | 'face' | 'box', button: number, at: Vec2, e: MouseEvent): void {
    this.drag = {
      mode,
      button,
      base: this.current,
      from: at,
      client: { x: e.clientX, y: e.clientY },
      additive: e.shiftKey,
    };
    this.boxEnd = null;
    this.dragMoved = false;
  }

  /** I / O: the inventory or stats window of the one selected unit; changes are kept in the map. */
  private openUnitDialog(which: 'inventory' | 'stats'): void {
    const sel = this.selection.length === 1 ? this.selection[0]! : null;
    if (!sel || sel.list !== 'units' || !this.current.units[sel.index]) {
      this.info.textContent = 'Select one unit first (I: inventory, O: stats).';
      return;
    }
    const index = sel.index;
    const unit = () => this.current.units[index]!;
    const label = this.nameOf(unit().type);
    const change = (next: MapData['units'][number]) =>
      this.edit({
        ...this.current,
        units: this.current.units.map((u, i) => (i === index ? next : u)),
      });
    const open = which === 'inventory' ? openInventory : openStats;
    open(this.root, unit, unit().name ?? label, change, () => this.syncSelection());
  }

  /** Where the first selected unit stands (the editor's Y drives the soldier next to it). */
  selectedUnitAt(): Vec2 | null {
    const sel = this.selection.find((s) => s.list === 'units');
    const u = sel ? this.current.units[sel.index] : undefined;
    return u ? { x: u.x, z: u.z } : null;
  }

  /** True while a right-drag is moving or rotating the selection, so the camera must not orbit. */
  get ownsRightDrag(): boolean {
    return this.drag?.button === 2;
  }

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
    const drag = this.drag;
    if (!drag || !this.isEditing) return;
    if (drag.mode === 'box') {
      this.drawBox(drag.client.x, drag.client.y, e.clientX, e.clientY);
      return;
    }
    const at = this.ground(e);
    if (!at) return;
    const base = drag.base;
    let next: MapData;
    if (drag.mode === 'move') {
      const dx = at.x - drag.from.x;
      const dz = at.z - drag.from.z;
      if (!this.dragMoved && Math.abs(dx) < DRAG_EPSILON && Math.abs(dz) < DRAG_EPSILON) return;
      next = this.transformed(base, (p, snap) => ({ x: snap(p.x + dx), z: snap(p.z + dz) }));
    } else {
      // The selected items look at the pointer (props only in quarter turns).
      next = this.facing(base, at);
    }
    // Only the first step of a drag goes into the history, so one undo takes the whole move back.
    this.edit(next, !this.dragMoved);
    this.dragMoved = true;
  };

  /** `base` with the selected items moved by `place` (props snap to the grid). */
  private transformed(
    base: MapData,
    place: (p: Vec2, snap: (v: number) => number) => Vec2,
  ): MapData {
    const propSnap = (v: number) => Math.round(v / PROP_SNAP) * PROP_SNAP;
    const units = this.chosen('units');
    const props = this.chosen('props');
    let next: MapData = {
      ...base,
      units: base.units.map((u, i) => (units.has(i) ? { ...u, ...place(u, (v) => v) } : u)),
      props: base.props.map((p, i) => (props.has(i) ? { ...p, ...place(p, propSnap) } : p)),
    };
    for (const list of LOGIC_LISTS) {
      const chosen = this.chosen(list);
      if (chosen.size === 0) continue;
      const moved = this.logicList(base, list).map((e, i) =>
        chosen.has(i) ? { ...e, ...place(e, propSnap) } : e,
      );
      next = this.withLogicList(next, list, moved);
    }
    return next;
  }

  private chosen(list: Selection['list']): Set<number> {
    return new Set(this.selection.filter((s) => s.list === list).map((s) => s.index));
  }

  /** `base` with every selected item turned to look at `at` (0 faces +Z, like the sim). */
  private facing(base: MapData, at: Vec2): MapData {
    const units = this.chosen('units');
    const props = this.chosen('props');
    const toward = (p: Vec2) => Math.atan2(at.x - p.x, at.z - p.z);
    const built = this.chosen('structures');
    const structures = this.logicList(base, 'structures').map((st, i) =>
      built.has(i) && Math.hypot(at.x - st.x, at.z - st.z) > FACE_MIN_DISTANCE
        ? { ...st, turns: (((Math.round(toward(st) / PROP_TURN) % 4) + 4) % 4) as number }
        : st,
    );
    const turned = built.size > 0 ? this.withLogicList(base, 'structures', structures) : base;
    return {
      ...turned,
      units: base.units.map((u, i) =>
        units.has(i) && Math.hypot(at.x - u.x, at.z - u.z) > FACE_MIN_DISTANCE
          ? { ...u, rotation: toward(u) }
          : u,
      ),
      props: base.props.map((p, i) =>
        props.has(i) && Math.hypot(at.x - p.x, at.z - p.z) > FACE_MIN_DISTANCE
          ? { ...p, rotation: Math.round(toward(p) / PROP_TURN) * PROP_TURN }
          : p,
      ),
    };
  }

  /** Ends a drag; a finished box selects every unit and prop whose centre is inside it. */
  private endDrag(): void {
    const drag = this.drag;
    this.drag = null;
    this.boxEl.style.display = 'none';
    const end = this.boxEnd;
    this.boxEnd = null;
    if (!drag || drag.mode !== 'box' || !this.isEditing || !end) return;
    if (Math.hypot(end.x - drag.client.x, end.y - drag.client.y) < BOX_MIN_PX) return;
    const rect = this.actions.canvas.getBoundingClientRect();
    const ground = (cx: number, cy: number) =>
      this.actions.groundAt(
        ((cx - rect.left) / rect.width) * 2 - 1,
        -((cy - rect.top) / rect.height) * 2 + 1,
      );
    const corners = [
      ground(drag.client.x, drag.client.y),
      ground(end.x, drag.client.y),
      ground(end.x, end.y),
      ground(drag.client.x, end.y),
    ];
    if (corners.some((c) => c === null)) return;
    const quad = corners as Vec2[];
    // The screen box is a convex quadrilateral on the ground: a point is inside when it is on the
    // same side of all four edges.
    const inside = (p: Vec2) => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i]!;
        const b = quad[(i + 1) % 4]!;
        const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        if (cross === 0) continue;
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
      }
      return true;
    };
    const found: Selection[] = [];
    this.current.units.forEach((u, index) => inside(u) && found.push({ list: 'units', index }));
    this.current.props.forEach((p, index) => inside(p) && found.push({ list: 'props', index }));
    for (const list of LOGIC_LISTS) {
      this.logicList(this.current, list).forEach(
        (e, index) => inside(e) && found.push({ list, index }),
      );
    }
    const keep = drag.additive ? this.selection : [];
    this.selection = [
      ...keep,
      ...found.filter((f) => !keep.some((k) => k.list === f.list && k.index === f.index)),
    ];
    this.syncSelection();
  }

  private drawBox(x0: number, y0: number, x1: number, y1: number): void {
    this.boxEnd = { x: x1, y: y1 };
    const st = this.boxEl.style;
    st.display = 'block';
    st.left = `${Math.min(x0, x1)}px`;
    st.top = `${Math.min(y0, y1)}px`;
    st.width = `${Math.abs(x1 - x0)}px`;
    st.height = `${Math.abs(y1 - y0)}px`;
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
      this.selection = [{ list: 'props', index: m.props.length }];
      this.edit({ ...m, props: [...m.props, prop] });
      return;
    }
    if (tool.kind === 'structure' || tool.kind === 'object' || tool.kind === 'item') {
      const list: LogicList =
        tool.kind === 'structure' ? 'structures' : tool.kind === 'object' ? 'objects' : 'items';
      const x = Math.round(at.x / PROP_SNAP) * PROP_SNAP;
      const z = Math.round(at.z / PROP_SNAP) * PROP_SNAP;
      const entry: LogicEntry =
        list === 'structures'
          ? { type: tool.id, x, z, turns: 0, level: 1 }
          : list === 'objects'
            ? { type: tool.id, x, z }
            : { item: tool.id, x, z, count: 1 };
      const entries = this.logicList(m, list);
      this.selection = [{ list, index: entries.length }];
      this.edit(this.withLogicList(m, list, [...entries, entry]));
      return;
    }
    const owner = this.ownerId(tool.owner);
    if (!owner) {
      alert(`This map has no ${tool.owner} player to own the unit.`);
      return;
    }
    this.selection = [{ list: 'units', index: m.units.length }];
    this.edit({
      ...m,
      units: [...m.units, { type: tool.id, x: at.x, z: at.z, owner, rotation: 0 }],
    });
  }

  /** R: turns every selected item one step. */
  private rotateSelected(): void {
    if (this.selection.length === 0) return;
    const m = this.current;
    const units = new Set(this.selection.filter((s) => s.list === 'units').map((s) => s.index));
    const props = new Set(this.selection.filter((s) => s.list === 'props').map((s) => s.index));
    const built = this.chosen('structures');
    const turned: MapData = {
      ...m,
      units: m.units.map((u, i) =>
        units.has(i) ? { ...u, rotation: (u.rotation ?? 0) + UNIT_TURN } : u,
      ),
      props: m.props.map((p, i) => (props.has(i) ? { ...p, rotation: p.rotation + PROP_TURN } : p)),
    };
    this.edit(
      built.size === 0
        ? turned
        : this.withLogicList(
            turned,
            'structures',
            this.logicList(m, 'structures').map((st, i) =>
              built.has(i) ? { ...st, turns: ((st.turns ?? 0) + 1) % 4 } : st,
            ),
          ),
    );
  }

  /** Ctrl+C: remembers the selected units and props. */
  private copySelected(): void {
    const m = this.current;
    const units = this.selection.flatMap((s) => {
      const u = s.list === 'units' ? m.units[s.index] : undefined;
      return u ? [u] : [];
    });
    const props = this.selection.flatMap((s) => {
      const p = s.list === 'props' ? m.props[s.index] : undefined;
      return p ? [p] : [];
    });
    const logic: Partial<Record<LogicList, LogicEntry[]>> = {};
    for (const list of LOGIC_LISTS) {
      const chosen = this.chosen(list);
      const copies = this.logicList(m, list).filter((_, i) => chosen.has(i));
      if (copies.length > 0) logic[list] = copies;
    }
    const logicCount = Object.values(logic).reduce((n, l) => n + l.length, 0);
    if (units.length + props.length + logicCount > 0) this.clipboard = { units, props, logic };
  }

  /** Ctrl+V: adds copies next to the remembered ones and selects them; pasting again keeps stepping away. */
  private pasteCopied(): void {
    const clip = this.clipboard;
    if (!clip) return;
    const m = this.current;
    const half = m.meta.size.width / 2;
    const near = (v: number) => Math.max(-half, Math.min(half, v + PASTE_OFFSET));
    const units = clip.units.map((u) => ({ ...u, x: near(u.x), z: near(u.z) }));
    const props = clip.props.map((p) => ({ ...p, x: near(p.x), z: near(p.z) }));
    const logic: Partial<Record<LogicList, LogicEntry[]>> = {};
    let next: MapData = { ...m, units: [...m.units, ...units], props: [...m.props, ...props] };
    const selection: Selection[] = [
      ...units.map((_, i) => ({ list: 'units' as const, index: m.units.length + i })),
      ...props.map((_, i) => ({ list: 'props' as const, index: m.props.length + i })),
    ];
    for (const list of LOGIC_LISTS) {
      const copies = (clip.logic[list] ?? []).map((e) => ({ ...e, x: near(e.x), z: near(e.z) }));
      if (copies.length === 0) continue;
      logic[list] = copies;
      const have = this.logicList(m, list);
      next = this.withLogicList(next, list, [...have, ...copies]);
      selection.push(...copies.map((_, i) => ({ list, index: have.length + i })));
    }
    this.clipboard = { units, props, logic };
    this.selection = selection;
    this.edit(next);
  }

  private deleteSelected(): void {
    if (this.selection.length === 0) return;
    const m = this.current;
    const units = new Set(this.selection.filter((s) => s.list === 'units').map((s) => s.index));
    const props = new Set(this.selection.filter((s) => s.list === 'props').map((s) => s.index));
    let next: MapData = {
      ...m,
      units: m.units.filter((_, i) => !units.has(i)),
      props: m.props.filter((_, i) => !props.has(i)),
    };
    for (const list of LOGIC_LISTS) {
      const gone = this.chosen(list);
      if (gone.size > 0) {
        next = this.withLogicList(
          next,
          list,
          this.logicList(m, list).filter((_, i) => !gone.has(i)),
        );
      }
    }
    this.selection = [];
    this.edit(next);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isEditing || isDialogOpen(this.root)) return;
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
    } else if ((e.ctrlKey || e.metaKey) && key === 'c') {
      e.preventDefault();
      this.copySelected();
    } else if ((e.ctrlKey || e.metaKey) && key === 'v') {
      e.preventDefault();
      this.pasteCopied();
    } else if (key === 'i' && !e.ctrlKey && !e.metaKey) {
      this.openUnitDialog('inventory');
    } else if (key === 'o' && !e.ctrlKey && !e.metaKey) {
      this.openUnitDialog('stats');
    } else if (key === 'delete' || key === 'backspace') this.deleteSelected();
    else if (key === 'r') {
      if (!e.repeat && !this.rHeld) {
        this.rHeld = true;
        this.rUsed = false;
      }
    } else if (key === 'escape') {
      this.setTool(null);
      this.roadIndex = null;
      if (this.spawnTool) {
        this.spawnTool = null;
        this.syncSelection();
        if (this.tab === 'logic') this.redrawLogic();
      }
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

  /** Asks for the size and the ground texture of a new map. */
  private newDialog(): void {
    const overlay = el('div', 'editor__dialog', this.root);
    const box = el('div', 'editor__dialog-box', overlay);
    el('h3', 'editor__dialog-title', box, 'New map');
    const sizeRow = el('label', 'editor__row', box, 'Size (metres per side)');
    const size = el('input', 'editor__number', sizeRow);
    size.type = 'number';
    size.min = String(MIN_MAP_SIZE);
    size.max = String(MAX_MAP_SIZE);
    size.step = '10';
    size.value = '80';
    const texRow = el('label', 'editor__row', box, 'Ground');
    const tex = el('select', 'editor__select', texRow);
    for (const t of terrainData.textures) el('option', '', tex, t.name).value = t.id;
    tex.value = terrainData.defaultTexture;
    const create = el('button', 'editor__btn', box, 'Create');
    create.addEventListener('click', () => {
      const n = Math.round(Number(size.value));
      if (!Number.isFinite(n) || n < MIN_MAP_SIZE || n > MAX_MAP_SIZE) {
        alert(`The size must be between ${MIN_MAP_SIZE} and ${MAX_MAP_SIZE} metres.`);
        return;
      }
      overlay.remove();
      this.setMap(blankMap(n, tex.value === terrainData.defaultTexture ? null : tex.value));
    });
    const cancel = el('button', 'editor__btn', box, 'Cancel');
    cancel.addEventListener('click', () => overlay.remove());
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
    document.title = this.pageTitle;
    this.playing = false;
    this.refresh();
  }

  private setPlaying(playing: boolean): void {
    if (!this.active || this.playing === playing) return;
    this.playing = playing;
    this.refresh();
    if (playing) {
      this.actions.onMarks([]);
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
    if (!this.active) this.actions.onMarks([]);
  }

  private setTab(tab: TabId): void {
    this.tab = tab;
    this.roadIndex = null;
    this.spawnTool = null;
    this.setTool(null);
    for (const button of this.side.querySelectorAll<HTMLElement>('.editor__tab')) {
      button.classList.toggle('editor__tab--on', button.dataset.tab === tab);
    }
    this.body.replaceChildren();
    if (tab === 'units')
      this.groups(catalog.units, 'Click a unit, then click the map to place it.', 'unit');
    else if (tab === 'assets')
      this.groups(
        [...catalog.assets, ...logicGroups],
        "Click an asset, then click the map. Structures, objects and loose items are part of the map's rules.",
        'prop',
      );
    else if (tab === 'terrain') this.terrain();
    else if (tab === 'logic') this.logic();
    else if (tab === 'sky') this.environmentTab();
    else this.players();
  }

  private note(text: string): void {
    el('p', 'editor__note', this.body, text);
  }

  /** The catalog lists; picking an entry arms it as the tool for the next map clicks. */
  private groups(groups: Group[], hint: string, kind: Tool['kind']): void {
    this.note(hint);
    const build = (list: Group[], parent: HTMLElement, humans: boolean, inherited = kind) => {
      for (const group of list) {
        const groupKind = group.kind ?? inherited;
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
            const same = this.tool?.id === item.id && this.tool.kind === groupKind;
            this.setTool(
              same
                ? null
                : {
                    kind: groupKind,
                    id: item.id,
                    name: item.name,
                    owner: isHuman ? 'human' : 'ai',
                  },
              button,
            );
          });
        }
        if (group.groups) build(group.groups, inner, isHuman, groupKind);
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

  /** Adds a spawn point with the armed tool; a right click drops it. */
  private logicMouseDown(e: MouseEvent): void {
    if (!this.spawnTool) return;
    if (e.button === 2) {
      this.spawnTool = null;
      this.syncSelection();
      this.redrawLogic();
      return;
    }
    if (e.button !== 0) return;
    const at = this.ground(e);
    if (!at) return;
    const point = { x: Math.round(at.x * 2) / 2, z: Math.round(at.z * 2) / 2 };
    if (this.spawnTool === 'fire') {
      this.setLogic({ fires: [...(this.current.logic.fires ?? []), point] });
      return;
    }
    if (this.spawnTool === 'goal') {
      this.spawnTool = null;
      this.syncSelection();
      this.setLogic({
        objectives: [
          ...(this.current.logic.objectives ?? []),
          { kind: 'reach', ...point, radius: 4 },
        ],
      });
      return;
    }
    this.setLogic({ spawnPoints: [...(this.current.logic.spawnPoints ?? []), point] });
  }

  private redrawLogic(): void {
    this.body.replaceChildren();
    this.logic();
  }

  /** One edit of the map's rules; the tab is redrawn to show the result. */
  private setLogic(patch: Partial<MapLogic>): void {
    const m = this.current;
    this.edit({ ...m, logic: { ...m.logic, ...patch } });
    this.redrawLogic();
  }

  /** A number box showing `value` (the map's override or the global one); it commits on change. */
  private numberRow(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    onCommit: (value: number) => void,
    step = 1,
  ): void {
    const row = el('label', 'editor__row', parent, label);
    const input = el('input', 'editor__number', row);
    input.type = 'number';
    input.min = String(min);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v >= min) onCommit(v);
      else input.value = String(value);
    });
  }

  /** The sky, time of day, light colour and weather of the map; every change shows at once. */
  private environmentTab(): void {
    const env = this.current.environment ?? defaultEnvironment();
    this.note('How the map looks. Nothing here changes the rules; Play uses it too.');
    const set = (patch: Partial<Environment>, record = true) =>
      this.edit(
        {
          ...this.current,
          environment: { ...(this.current.environment ?? defaultEnvironment()), ...patch },
        },
        record,
      );

    const sky = el('details', 'editor__group', this.body);
    sky.open = true;
    el('summary', 'editor__summary', sky, 'Sky and light');
    const skyBody = el('div', 'editor__items', sky);
    this.checkRow(skyBody, 'Sky', env.sky, (on) => set({ sky: on }));
    this.checkRow(skyBody, 'Sun', env.sun, (on) => set({ sun: on }));
    this.checkRow(skyBody, 'Moon', env.moon, (on) => set({ moon: on }));
    const phase = el('span', 'editor__empty', skyBody, hourLabel(env.timeOfDay));
    this.rangeRow(skyBody, 'Time of day', env.timeOfDay, 0, 24, 0.25, (v) => {
      phase.textContent = hourLabel(v);
      set({ timeOfDay: v }, !this.sliding);
    });
    const quick = el('div', 'editor__row', skyBody);
    for (const [name, hour] of [
      ['Dawn', 6],
      ['Noon', 12],
      ['Dusk', 18],
      ['Night', 0],
    ] as const) {
      el('button', 'editor__btn', quick, name).addEventListener('click', () => {
        set({ timeOfDay: hour });
        this.setTab('sky');
      });
    }
    this.rangeRow(skyBody, 'Sun heading (deg)', env.sunAzimuth, 0, 360, 5, (v) =>
      set({ sunAzimuth: v }, !this.sliding),
    );
    this.rangeRow(skyBody, 'Sun and moon halo', env.sunGlow, 0, 2, 0.05, (v) =>
      set({ sunGlow: v }, !this.sliding),
    );
    this.rangeRow(skyBody, 'Auto day (hours per minute, 0 = off)', env.dayCycle, 0, 12, 0.25, (v) =>
      set({ dayCycle: v }, !this.sliding),
    );
    const colorRow = el('label', 'editor__row', skyBody, 'Light colour');
    const color = el('input', 'editor__color', colorRow);
    color.type = 'color';
    color.value = env.lightColor ?? '#ffffff';
    color.addEventListener('input', () => {
      set({ lightColor: color.value }, !this.sliding);
      this.sliding = true;
    });
    color.addEventListener('change', () => (this.sliding = false));
    el('button', 'editor__btn', colorRow, 'Auto').addEventListener('click', () => {
      set({ lightColor: null });
      this.setTab('sky');
    });
    this.rangeRow(
      skyBody,
      'Clouds',
      env.clouds,
      0,
      1,
      0.05,
      (v) => set({ clouds: v }, !this.sliding),
      true,
    );

    this.rangeRow(
      skyBody,
      'Night light (0 = pitch dark)',
      env.nightLight,
      0,
      1,
      0.05,
      (v) => set({ nightLight: v }, !this.sliding),
      true,
    );
    this.rangeRow(
      skyBody,
      'Cloud thickness (volumetric clouds)',
      env.cloudDensity,
      0.2,
      2.5,
      0.05,
      (v) => set({ cloudDensity: v }, !this.sliding),
    );

    const weather = el('details', 'editor__group', this.body);
    weather.open = true;
    el('summary', 'editor__summary', weather, 'Weather');
    const weatherBody = el('div', 'editor__items', weather);
    for (const [key, name] of [
      ['rain', 'Rain'],
      ['snow', 'Snow'],
      ['sand', 'Sandstorm'],
      ['fog', 'Fog'],
      ['lightning', 'Lightning'],
    ] as const) {
      this.rangeRow(
        weatherBody,
        name,
        env[key],
        0,
        1,
        0.05,
        (v) => set({ [key]: v }, !this.sliding),
        true,
      );
    }
    const presets = el('div', 'editor__row', weatherBody);
    for (const [name, patch] of [
      ['Clear', { rain: 0, snow: 0, sand: 0, fog: 0, lightning: 0, clouds: 0 }],
      ['Storm', { rain: 0.85, snow: 0, sand: 0, fog: 0.2, lightning: 0.8, clouds: 0.85 }],
      ['Blizzard', { rain: 0, snow: 1, sand: 0, fog: 0.5, lightning: 0, clouds: 0.8 }],
      ['Sandstorm', { rain: 0, snow: 0, sand: 1, fog: 0.3, lightning: 0, clouds: 0.3 }],
      ['Fog', { rain: 0, snow: 0, sand: 0, fog: 0.9, lightning: 0, clouds: 0.4 }],
    ] as const) {
      el('button', 'editor__btn', presets, name).addEventListener('click', () => {
        set(patch);
        this.setTab('sky');
      });
    }
    this.seasonGroup(env, set);
    this.waterGroup(env, set);

    const reset = el('button', 'editor__item', this.body, 'Back to noon, clear weather');
    reset.addEventListener('click', () => {
      this.edit({ ...this.current, environment: undefined });
      this.setTab('sky');
    });
  }

  /** The season of the map: tints the ground (winter is snow). */
  private seasonGroup(
    env: Environment,
    set: (patch: Partial<Environment>, record?: boolean) => void,
  ): void {
    const group = el('details', 'editor__group', this.body);
    group.open = true;
    el('summary', 'editor__summary', group, 'Season');
    const body = el('div', 'editor__items', group);
    const row = el('div', 'editor__row', body);
    for (const [id, name] of [
      ['spring', 'Spring'],
      ['summer', 'Summer'],
      ['autumn', 'Autumn'],
      ['winter', 'Winter'],
    ] as const) {
      const b = el('button', 'editor__btn', row, env.season === id ? `[${name}]` : name);
      b.addEventListener('click', () => {
        set({ season: id });
        this.setTab('sky');
      });
    }
  }

  /**
   * The wave ocean: the switch (the `ocean` rule), the numbers of the waves and current (they replace
   * game.json's for this map) and the look of the water (`environment.water`: optics, ripples, neon).
   */
  private waterGroup(
    env: Environment,
    set: (patch: Partial<Environment>, record?: boolean) => void,
  ): void {
    const group = el('details', 'editor__group', this.body);
    group.open = this.current.logic.ocean !== undefined;
    el('summary', 'editor__summary', group, 'Ocean water');
    const body = el('div', 'editor__items', group);
    const on = this.current.logic.ocean !== undefined;
    this.checkRow(body, 'Wave ocean (needs a water level in Terrain)', on, (checked) => {
      this.edit({
        ...this.current,
        logic: { ...this.current.logic, ocean: checked ? {} : undefined },
      });
      this.setTab('sky');
    });
    if (!on) return;
    const ocean = { ...gameData.ocean, ...this.current.logic.ocean };
    const physics = (
      key: keyof typeof gameData.ocean,
      label: string,
      min: number,
      max: number,
      step: number,
    ) =>
      this.rangeRow(body, label, ocean[key], min, max, step, (v) =>
        this.edit(
          {
            ...this.current,
            logic: { ...this.current.logic, ocean: { ...this.current.logic.ocean, [key]: v } },
          },
          !this.sliding,
        ),
      );
    el('div', 'editor__empty', body, 'Waves and current (they change how things float too)');
    physics('waveHeight', 'Wave height (m)', 0.05, 2.5, 0.05);
    physics('frequency', 'Wave frequency', 0.02, 0.2, 0.005);
    physics('speed', 'Wave speed', 0.2, 5, 0.1);
    physics('hooke', 'Sharp crests', 0, 1, 0.05);
    physics('pressure', 'Crest pressure', 0.5, 3, 0.05);
    physics('currentSpeed', 'Current (m/s)', 0, 15, 0.5);
    physics('currentAngle', 'Current direction (rad)', 0, 6.28, 0.05);
    physics('lift', 'Buoyancy (x gravity)', 0.5, 5, 0.05);
    physics('drag', 'Water drag', 0, 10, 0.1);

    const w = env.water;
    const look = (patch: Partial<Environment['water']>, record = true) =>
      set({ water: { ...w, ...patch } }, record);
    const lookRange = (
      key: Exclude<keyof Environment['water'], 'fresnel' | 'tint'>,
      label: string,
      min: number,
      max: number,
      step: number,
    ) =>
      this.rangeRow(body, label, w[key], min, max, step, (v) => look({ [key]: v }, !this.sliding));
    el('div', 'editor__empty', body, 'Look of the water');
    const fres = el('div', 'editor__row', body);
    for (const [id, name] of [
      ['area', 'Fresnel: area'],
      ['sapito', 'Fresnel: sapito'],
    ] as const) {
      el('button', 'editor__btn', fres, w.fresnel === id ? `[${name}]` : name).addEventListener(
        'click',
        () => {
          look({ fresnel: id });
          this.setTab('sky');
        },
      );
    }
    lookRange('saturationBrake', 'Light brake with depth', 0.1, 2.5, 0.05);
    lookRange('chromaticFriction', 'Red absorbed more than blue', 0, 2, 0.05);
    lookRange('impedance', 'Surface reflectivity (R0)', 0.08, 0.245, 0.005);
    lookRange('reflection', 'Reflection', 0, 1.5, 0.05);
    lookRange('normalDistortion', 'Ripple shear', 0, 1.2, 0.02);
    lookRange('caustics', 'Caustics', 0, 1.5, 0.05);
    lookRange('pomSteps', 'Parallax steps', 0, 20, 1);
    lookRange('pomDepth', 'Parallax depth', 0, 1.2, 0.05);
    lookRange('neonOrbs', 'Neon orbs', 0, 8, 1);
    const tintRow = el('label', 'editor__row', body, 'Water tint');
    const tint = el('input', 'editor__color', tintRow);
    tint.type = 'color';
    tint.value = w.tint ?? '#2a9fd6';
    tint.addEventListener('input', () => {
      look({ tint: tint.value }, !this.sliding);
      this.sliding = true;
    });
    tint.addEventListener('change', () => (this.sliding = false));
    el('button', 'editor__btn', tintRow, 'Natural').addEventListener('click', () => {
      look({ tint: null });
      this.setTab('sky');
    });
  }

  /**
   * A range input that previews as it moves. The first move of a drag is one undo step; the rest of
   * the drag is not recorded (`sliding` is true until the mouse is let go).
   */
  private rangeRow(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onInput: (value: number) => void,
    strength = false,
  ): void {
    const row = el('label', 'editor__row', parent, label);
    const input = el('input', 'editor__range', row);
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const shown = el('span', 'editor__value', row, strength ? strengthLabel(value) : String(value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      shown.textContent = strength ? strengthLabel(v) : String(v);
      onInput(v);
      this.sliding = true;
    });
    input.addEventListener('change', () => (this.sliding = false));
  }

  private checkRow(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ): void {
    const row = el('label', 'editor__row', parent, label);
    const box = el('input', '', row);
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
  }

  private logic(): void {
    const logic = this.current.logic;
    const global = gameData;
    const enemyInfo = global.enemies as Record<
      string,
      { name: string; weight: number; minWave: number }
    >;
    const enemyIds = Object.keys(enemyInfo);
    const section = (name: string, open = false) => {
      const details = el('details', 'editor__group', this.body);
      details.open = open;
      el('summary', 'editor__summary', details, name);
      return el('div', 'editor__items', details);
    };

    this.note('Rules here replace the ones of game.json for this map only.');
    const mode = el('label', 'editor__row', this.body, 'Mode');
    const modeSelect = el('select', 'editor__select', mode);
    el('option', '', modeSelect, 'Waves').value = 'waves';
    el('option', '', modeSelect, 'Story').value = 'story';
    modeSelect.value = logic.mode;
    modeSelect.addEventListener('change', () =>
      this.setLogic({ mode: modeSelect.value as MapLogic['mode'] }),
    );
    const difficulty = el('label', 'editor__row', this.body, 'Difficulty');
    const levelSelect = el('select', 'editor__select', difficulty);
    for (const [id, name] of [
      ['easy', 'Easy'],
      ['normal', 'Normal'],
      ['hard', 'Hard'],
    ] as const) {
      el('option', '', levelSelect, name).value = id;
    }
    levelSelect.value = logic.difficulty ?? 'normal';
    levelSelect.addEventListener('change', () =>
      this.setLogic({ difficulty: levelSelect.value as MapLogic['difficulty'] }),
    );

    // Waves: size, pace and the cap on living enemies.
    const waves = section('Waves', true);
    const w = { ...global.waves, ...logic.waves };
    const wave = (
      key: 'baseCount' | 'countPerWave' | 'spawnInterval' | 'intermission' | 'maxAlive',
      label: string,
      min: number,
      step = 1,
    ) =>
      this.numberRow(
        waves,
        label,
        w[key],
        min,
        (v) => this.setLogic({ waves: { ...logic.waves, [key]: v } }),
        step,
      );
    wave('baseCount', 'First wave size', 1);
    wave('countPerWave', 'Extra per wave', 0);
    wave('spawnInterval', 'Seconds between spawns', 0, 0.1);
    wave('intermission', 'Break between waves (s)', 0);
    wave('maxAlive', 'Max alive at once', 1);

    // Enemy mix: which types appear, how likely and from which wave.
    const mix = section('Enemy mix');
    const active: NonNullable<MapLogic['enemies']> =
      logic.enemies ?? Object.fromEntries(enemyIds.map((id) => [id, {}]));
    this.numberRow(
      mix,
      'Zombie weight',
      logic.zombieWeight ?? global.waves.baseWeight,
      0,
      (v) => this.setLogic({ zombieWeight: v }),
      0.5,
    );
    for (const id of enemyIds) {
      const base = enemyInfo[id]!;
      const over = active[id];
      this.checkRow(mix, base.name, over !== undefined, (on) => {
        const next = { ...active };
        if (on) next[id] = {};
        else delete next[id];
        this.setLogic({ enemies: next });
      });
      if (!over) continue;
      this.numberRow(
        mix,
        '   weight',
        over.weight ?? base.weight,
        0.5,
        (v) => this.setLogic({ enemies: { ...active, [id]: { ...over, weight: v } } }),
        0.5,
      );
      this.numberRow(mix, '   first wave', over.minWave ?? base.minWave, 1, (v) =>
        this.setLogic({ enemies: { ...active, [id]: { ...over, minWave: v } } }),
      );
    }

    // Bosses: on or off, how often, and which types they cycle through.
    const bosses = section('Bosses');
    const boss = logic.boss;
    this.checkRow(bosses, 'Mini bosses', boss?.enabled !== false, (on) =>
      this.setLogic({ boss: { ...boss, enabled: on } }),
    );
    this.numberRow(bosses, 'Every N waves', boss?.everyWaves ?? global.boss.everyWaves, 1, (v) =>
      this.setLogic({ boss: { ...boss, everyWaves: v } }),
    );
    const types = boss?.types ?? global.boss.types;
    for (const id of ['zombie', ...enemyIds]) {
      const name = id === 'zombie' ? 'Zombie' : enemyInfo[id]!.name;
      this.checkRow(bosses, name, types.includes(id), (on) => {
        const next = on ? [...types, id] : types.filter((t) => t !== id);
        // At least one type must stay.
        if (next.length > 0) this.setLogic({ boss: { ...boss, types: next } });
        else this.redrawLogic();
      });
    }

    // Spawn points: where enemies appear instead of anywhere along the edge.
    const spawns = section('Spawn points', true);
    const points = logic.spawnPoints ?? [];
    el(
      'span',
      'editor__empty',
      spawns,
      points.length === 0
        ? 'None: enemies appear along the map edge.'
        : `${points.length} point(s); enemies pick one at random.`,
    );
    const add = el(
      'button',
      'editor__item',
      spawns,
      this.spawnTool === 'spawn' ? 'Stop adding' : '+ Add spawn points',
    );
    if (this.spawnTool === 'spawn') add.classList.add('editor__item--on');
    add.addEventListener('click', () => {
      this.spawnTool = this.spawnTool === 'spawn' ? null : 'spawn';
      this.syncSelection();
      this.redrawLogic();
    });
    points.forEach((p, i) => {
      const row = el('div', 'editor__row', spawns);
      el('span', '', row, `#${i + 1} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      const del = el('button', 'editor__btn', row, 'Remove');
      del.addEventListener('click', () => {
        const left = points.filter((_, j) => j !== i);
        this.setLogic({ spawnPoints: left.length > 0 ? left : undefined });
      });
    });

    // Fire: burns soldiers on foot and enemies inside its radius.
    const hazards = section('Fire', true);
    const fires = logic.fires ?? [];
    el(
      'span',
      'editor__empty',
      hazards,
      fires.length === 0
        ? 'None. A fire hurts soldiers on foot and enemies inside it.'
        : `${fires.length} fire(s), ${global.hazards.fire.dps} damage per second each.`,
    );
    const addFire = el(
      'button',
      'editor__item',
      hazards,
      this.spawnTool === 'fire' ? 'Stop adding' : '+ Add fires',
    );
    if (this.spawnTool === 'fire') addFire.classList.add('editor__item--on');
    addFire.addEventListener('click', () => {
      this.spawnTool = this.spawnTool === 'fire' ? null : 'fire';
      this.syncSelection();
      this.redrawLogic();
    });
    fires.forEach((p, i) => {
      const row = el('div', 'editor__row', hazards);
      el('span', '', row, `#${i + 1} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      const del = el('button', 'editor__btn', row, 'Remove');
      del.addEventListener('click', () => {
        const left = fires.filter((_, j) => j !== i);
        this.setLogic({ fires: left.length > 0 ? left : undefined });
      });
    });

    // Story goals: the mission is won when all are done; losing is the squad going down.
    const goals = section('Objectives', logic.mode === 'story');
    const objectives = logic.objectives ?? [];
    if (logic.mode !== 'story') {
      el('span', 'editor__empty', goals, 'Only used when the mode is Story.');
    }
    el(
      'span',
      'editor__empty',
      goals,
      objectives.length === 0
        ? 'None: the mission never ends by itself.'
        : 'All of these must be done to win.',
    );
    if (logic.mode === 'story') {
      const brief = el('textarea', 'editor__number', goals);
      brief.placeholder = 'Mission briefing (shown at the start)';
      brief.maxLength = 600;
      brief.rows = 3;
      brief.value = logic.briefing ?? '';
      brief.addEventListener('change', () =>
        this.setLogic({ briefing: brief.value.trim() === '' ? undefined : brief.value }),
      );
    }
    const setObjectives = (next: Objective[]) =>
      this.setLogic({ objectives: next.length > 0 ? next : undefined });
    objectives.forEach((o, i) => {
      const row = el('div', 'editor__row', goals);
      el('span', '', row, objectiveLabel(o));
      const del = el('button', 'editor__btn', row, 'Remove');
      del.addEventListener('click', () => setObjectives(objectives.filter((_, j) => j !== i)));
      const change = (patch: Partial<Objective>) =>
        setObjectives(objectives.map((x, j) => (j === i ? ({ ...x, ...patch } as Objective) : x)));
      if (o.kind === 'kills' || o.kind === 'boss') {
        const what = o.kind === 'kills' ? '   enemies to kill' : '   mini bosses to kill';
        this.numberRow(goals, what, o.count, 1, (v) => change({ count: Math.round(v) }));
      } else if (o.kind === 'survive') {
        this.numberRow(goals, '   clear wave', o.wave, 1, (v) => change({ wave: Math.round(v) }));
      } else {
        this.numberRow(goals, '   ring radius (m)', o.radius, 1, (v) => change({ radius: v }), 0.5);
      }
    });
    const addGoal = (label: string, make: () => Objective) => {
      const b = el('button', 'editor__item', goals, label);
      b.addEventListener('click', () => setObjectives([...objectives, make()]));
    };
    const spot = el(
      'button',
      'editor__item',
      goals,
      this.spawnTool === 'goal' ? 'Click the map…' : '+ Reach a spot',
    );
    if (this.spawnTool === 'goal') spot.classList.add('editor__item--on');
    spot.addEventListener('click', () => {
      this.spawnTool = this.spawnTool === 'goal' ? null : 'goal';
      this.syncSelection();
      this.redrawLogic();
    });
    addGoal('+ Kill 25 enemies', () => ({ kind: 'kills', count: 25 }));
    addGoal('+ Clear wave 3', () => ({ kind: 'survive', wave: 3 }));
    addGoal('+ Kill a mini boss', () => ({ kind: 'boss', count: 1 }));
    const reset = el('button', 'editor__item', this.body, 'Reset to the global rules');
    reset.addEventListener('click', () => {
      this.spawnTool = null;
      this.edit({
        ...this.current,
        logic: {
          mode: logic.mode,
          objectives: logic.objectives,
          briefing: logic.briefing,
          fires: logic.fires,
        },
      });
      this.setTab('logic');
    });
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
}
