import gameData from '../data/game.json';
import itemsJson from '../data/items.json';
import unitsJson from '../data/units.json';
import { ItemsSchema, UnitsSchema, spawnerEnemy, type MapData } from './sim';

type MapUnit = MapData['units'][number];

const items = ItemsSchema.parse(itemsJson).items;
const units = UnitsSchema.parse(unitsJson);

const BACKPACK_SLOTS = gameData.inventory.backpackSlots;
const DEFAULT_HEALTH = gameData.player.maxHealth;
const START_WEAPON = gameData.squad.startWeapon;

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

/** The sheet type of a placed unit: a spawner stands for the enemy it makes. */
const sheetType = (u: MapUnit): string => spawnerEnemy(u.type) ?? u.type;

/** Whether the unit is a soldier or drone of the squad (it has hands and a vest; enemies only carry). */
const isSquad = (u: MapUnit): boolean =>
  u.type === 'drone' || units.units[u.type]?.family === 'human';

const CATEGORIES: { id: string; label: string; types: string[] }[] = [
  { id: 'weapons', label: 'Weapons', types: ['weapon'] },
  { id: 'armor', label: 'Armor', types: ['armor', 'plate'] },
  { id: 'medical', label: 'Medical', types: ['medical', 'defibrillator'] },
  { id: 'grenades', label: 'Grenades', types: ['grenade'] },
  { id: 'accessories', label: 'Accessories', types: ['accessory'] },
];

const itemName = (id: string): string => items[id]?.name ?? id;

/** Closes on a click outside the box or Escape; returns the box to fill. */
function dialog(
  parent: HTMLElement,
  title: string,
  onClose: () => void,
): { box: HTMLElement; close: () => void } {
  const overlay = el('div', 'editor__dialog', parent);
  const box = el('div', 'editor__dialog-box editor__dialog-box--wide', overlay);
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  window.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  const head = el('div', 'editor__row', box);
  el('h3', 'editor__dialog-title', head, title);
  el('button', 'editor__btn', head, 'Close').addEventListener('click', close);
  return { box, close };
}

export function isDialogOpen(root: HTMLElement): boolean {
  return root.querySelector('.editor__dialog .editor__dialog-box--wide') !== null;
}

/**
 * The inventory window of a placed unit (key I): what it wears and carries, with a list of every
 * item to add. A soldier has hands and a vest; an enemy only carries, and drops it when it dies.
 * `change` gets the unit with the new loadout; the editor makes it one undo step.
 */
export function openInventory(
  parent: HTMLElement,
  unit: () => MapUnit,
  label: string,
  change: (next: MapUnit) => void,
  onClose: () => void,
): void {
  const { box } = dialog(parent, `Inventory · ${label}`, onClose);
  const body = el('div', 'editor__cols', box);
  const mine = el('div', 'editor__col', body);
  const list = el('div', 'editor__col', body);
  let category = 'weapons';

  const squad = isSquad(unit());
  const drone = unit().type === 'drone';

  /** The unit with `patch` on top; empty overrides are dropped so the file stays small. */
  const update = (patch: Partial<MapUnit>) => {
    const next = { ...unit(), ...patch };
    if (next.backpack && next.backpack.length === 0 && !patch.backpack) delete next.backpack;
    change(next);
    draw();
  };

  const effective = (slot: 'rightHand' | 'leftHand' | 'chest'): string | null => {
    const set = unit().equipment?.[slot];
    if (set !== undefined) return set;
    return slot === 'rightHand' && squad && !drone ? START_WEAPON : null;
  };
  const setSlot = (slot: 'rightHand' | 'leftHand' | 'chest', id: string | null) =>
    update({ equipment: { ...unit().equipment, [slot]: id } });

  const addToPack = (id: string) => {
    const stacks = (unit().backpack ?? []).map((s) => ({ ...s }));
    const size = items[id]?.stack ?? 1;
    const open = stacks.find((s) => s.item === id && s.count < size);
    if (open) open.count++;
    else if (stacks.length < BACKPACK_SLOTS) stacks.push({ item: id, count: 1 });
    else {
      alert(`The backpack holds ${BACKPACK_SLOTS} slots.`);
      return;
    }
    update({ backpack: stacks });
  };

  const equip = (id: string) => {
    const def = items[id];
    if (!def) return;
    if (def.type === 'armor') setSlot('chest', id);
    else if (def.type === 'weapon') {
      // A two-handed weapon takes both hands; a one-handed one only the right.
      const equipment = { ...unit().equipment, rightHand: id } as NonNullable<MapUnit['equipment']>;
      if (def.hands === 2) equipment.leftHand = null;
      update({ equipment });
    }
  };

  function draw(): void {
    mine.replaceChildren();
    const u = unit();
    if (squad) {
      el('h4', 'editor__sub', mine, 'Worn');
      for (const [slot, name] of [
        ['rightHand', 'Right hand'],
        ['leftHand', 'Left hand'],
        ['chest', 'Vest'],
      ] as const) {
        const row = el('div', 'editor__row', mine);
        const id = effective(slot);
        el('span', '', row, `${name}: ${id ? itemName(id) : '—'}`);
        if (id) {
          const x = el('button', 'editor__btn', row, '✕');
          x.title = 'Take it off';
          x.addEventListener('click', () => setSlot(slot, null));
        }
      }
    }
    const stacks = u.backpack ?? [];
    el(
      'h4',
      'editor__sub',
      mine,
      squad
        ? `Backpack ${stacks.length}/${BACKPACK_SLOTS}`
        : `Carries ${stacks.length}/${BACKPACK_SLOTS} (dropped when it dies)`,
    );
    if (stacks.length === 0) el('span', 'editor__empty', mine, 'Empty');
    stacks.forEach((st, i) => {
      const row = el('div', 'editor__row', mine);
      el('span', '', row, `${itemName(st.item)} ×${st.count}`);
      const minus = el('button', 'editor__btn', row, '−');
      minus.title = 'Remove one';
      minus.addEventListener('click', () => {
        const next = stacks.map((s) => ({ ...s }));
        if (--next[i]!.count === 0) next.splice(i, 1);
        update({ backpack: next });
      });
      const all = el('button', 'editor__btn', row, '✕');
      all.title = 'Remove the whole stack';
      all.addEventListener('click', () => update({ backpack: stacks.filter((_, j) => j !== i) }));
    });
    if (stacks.length > 0) {
      el('button', 'editor__btn', mine, 'Empty the backpack').addEventListener('click', () =>
        update({ backpack: [] }),
      );
    }

    list.replaceChildren();
    el('h4', 'editor__sub', list, 'Add an item');
    const tabs = el('div', 'editor__tabs', list);
    for (const c of CATEGORIES) {
      const b = el('button', 'editor__tab', tabs, c.label);
      b.classList.toggle('editor__tab--on', c.id === category);
      b.addEventListener('click', () => {
        category = c.id;
        draw();
      });
    }
    const types = CATEGORIES.find((c) => c.id === category)?.types ?? [];
    const rows = el('div', 'editor__items', list);
    for (const [id, def] of Object.entries(items)) {
      if (!types.includes(def.type) || ('innate' in def && def.innate)) continue;
      if ('droneOnly' in def && def.droneOnly !== drone) continue;
      const row = el('div', 'editor__row', rows);
      el('span', '', row, `${def.icon} ${def.name}`);
      if (squad && (def.type === 'weapon' || def.type === 'armor')) {
        el('button', 'editor__btn', row, 'Equip').addEventListener('click', () => equip(id));
      }
      el('button', 'editor__btn', row, '+ Pack').addEventListener('click', () => addToPack(id));
    }
  }
  draw();
}

/**
 * The stats window of a placed unit (key O): name, health and the attribute sheet. The values are
 * kept in the map for that unit only. A blank field goes back to the type's default.
 */
export function openStats(
  parent: HTMLElement,
  unit: () => MapUnit,
  label: string,
  change: (next: MapUnit) => void,
  onClose: () => void,
): void {
  const { box, close } = dialog(parent, `Stats · ${label}`, onClose);
  const u = unit();
  const sheet = units.units[sheetType(u)];
  const squad = isSquad(u);

  const text = (name: string, value: string, placeholder: string, commit: (v: string) => void) => {
    const row = el('label', 'editor__row', box, name);
    const input = el('input', 'editor__number editor__text', row);
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('change', () => commit(input.value.trim()));
  };
  const numeric = (
    name: string,
    value: number | undefined,
    placeholder: string,
    commit: (v: number | undefined) => void,
  ) => {
    const row = el('label', 'editor__row', box, name);
    const input = el('input', 'editor__number', row);
    input.type = 'number';
    input.min = '0';
    input.value = value === undefined ? '' : String(value);
    input.placeholder = placeholder;
    input.addEventListener('change', () => {
      const v = Number(input.value);
      commit(input.value === '' || !Number.isFinite(v) || v <= 0 ? undefined : v);
    });
  };
  const set = (patch: Partial<MapUnit>) => {
    const next = { ...unit(), ...patch };
    for (const key of Object.keys(next) as (keyof MapUnit)[]) {
      if (next[key] === undefined) delete next[key];
    }
    change(next);
  };

  text('Name', u.name ?? '', sheet?.name ?? label, (v) => set({ name: v || undefined }));
  numeric('Max health', u.maxHealth, squad ? String(DEFAULT_HEALTH) : 'by wave', (v) =>
    set({ maxHealth: v }),
  );
  if (!sheet) {
    el('p', 'editor__note', box, 'This unit type has no attribute sheet yet.');
    return;
  }
  el('h4', 'editor__sub', box, 'Attributes');
  for (const name of units.attributes) {
    const row = el('label', 'editor__row', box, name);
    const input = el('input', 'editor__number', row);
    input.type = 'number';
    input.min = '0';
    input.value = String(u.attributes?.[name] ?? sheet.attributes[name]);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < 0) {
        input.value = String(unit().attributes?.[name] ?? sheet.attributes[name]);
        return;
      }
      set({ attributes: { ...unit().attributes, [name]: v } });
    });
  }
  el('p', 'editor__note', box, 'Attributes are not read by any rule yet.');
  el('button', 'editor__btn', box, 'Reset to the defaults').addEventListener('click', () => {
    set({ name: undefined, maxHealth: undefined, attributes: undefined });
    close();
  });
}
