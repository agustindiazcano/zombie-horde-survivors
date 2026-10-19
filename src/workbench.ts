import {
  cellAt,
  fitAccessory,
  itemDef,
  removeAccessory,
  reportOf,
  type AccessorySlot,
  type GameConfig,
  type GameState,
  type SlotRef,
  type Soldier,
  type WeaponReport,
} from './sim';
import { itemInfo } from './itemInfo';

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

/** The rows of the stats table: how to read a report, and whether a smaller number is the better one. */
const ROWS: { label: string; read: (r: WeaponReport) => number | null; lowerIsBetter: boolean }[] =
  [
    { label: 'Damage', read: (r) => r.damage, lowerIsBetter: false },
    { label: 'Range (m)', read: (r) => r.range, lowerIsBetter: false },
    { label: 'Spread (rad)', read: (r) => r.spread, lowerIsBetter: true },
    { label: 'Spread aiming', read: (r) => r.aimSpread, lowerIsBetter: true },
    { label: 'Recoil per shot', read: (r) => r.recoil, lowerIsBetter: true },
    { label: 'Noise (m)', read: (r) => r.noise, lowerIsBetter: true },
    { label: 'Magazine', read: (r) => r.magazine, lowerIsBetter: false },
    { label: 'Reload (s)', read: (r) => r.reloadTime, lowerIsBetter: true },
    { label: 'View aiming (x)', read: (r) => r.zoom, lowerIsBetter: true },
  ];

const show = (n: number | null): string => (n === null ? '—' : String(Math.round(n * 1000) / 1000));

/**
 * The weapon's own window, opened from the squad screen (so only while paused): the places of
 * the weapon, the accessories in the unit's backpack that can be fitted, and the stats of the
 * bare weapon, as it is now and with the accessory under the pointer. `onChange` repaints
 * the squad screen after every change. Esc or a click outside closes it.
 */
export function openWorkbench(
  parent: HTMLElement,
  config: GameConfig,
  getState: () => GameState,
  unitId: number,
  weapon: SlotRef,
  onChange: () => void,
): void {
  const unit = (): Soldier | undefined => getState().soldiers.find((s) => s.id === unitId);
  const start = unit();
  const first = start ? cellAt(start, weapon) : null;
  if (!start || !first) return;
  // A backpack index moves when a stack before it is used up, so follow the stack itself.
  const stack = typeof weapon === 'number' ? start.backpack[weapon] : undefined;
  const where = (): SlotRef | null => {
    const u = unit();
    if (!u) return null;
    if (typeof weapon === 'string') return weapon;
    const i = stack ? u.backpack.indexOf(stack) : -1;
    return i >= 0 ? i : null;
  };

  const overlay = el('div', 'wb', parent);
  const box = el('div', 'wb__box', overlay);
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
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

  const paint = () => {
    const u = unit();
    const slot = where();
    const cell = u && slot !== null ? cellAt(u, slot) : null;
    const def = cell ? itemDef(config, cell.item) : null;
    if (!u || slot === null || !cell || def?.type !== 'weapon') {
      close();
      return;
    }
    const fitted = cell.state?.accessories ?? {};
    box.replaceChildren();
    const info = itemInfo(config, cell.item);
    el('h3', 'wb__title', box, `${info.icon} ${info.name} — workbench`);

    const places = el('div', 'wb__row', box);
    for (const place of def.accessorySlots) {
      const id = fitted[place];
      const item = el(
        id ? 'button' : 'div',
        `wb__slot${id ? ' wb__pick' : ' wb__slot--empty'}`,
        places,
      );
      el('span', 'wb__where', item, place);
      if (id) {
        const acc = itemInfo(config, id);
        el('span', '', item, `${acc.icon} ${acc.name}`);
        el('span', 'wb__where', item, 'click to remove');
        item.addEventListener('click', () => {
          const at = where();
          if (at !== null && removeAccessory(getState(), config, unitId, at, place)) {
            onChange();
            paint();
          }
        });
      } else {
        el('span', '', item, 'empty');
      }
    }

    const spare = u.backpack
      .map((st, index) => ({ st, index }))
      .filter(({ st }) => itemDef(config, st.item).type === 'accessory');
    el('div', 'wb__where', box, 'Accessories in the backpack');
    const bag = el('div', 'wb__row', box);
    if (spare.length === 0)
      el('span', 'wb__hint', bag, 'None. Find them in crates or buy them in the shop.');
    for (const { st, index } of spare) {
      const acc = itemDef(config, st.item);
      if (acc.type !== 'accessory') continue;
      const fits = def.accessorySlots.includes(acc.slot);
      const pick = el('button', 'wb__pick', bag);
      pick.disabled = !fits;
      const ai = itemInfo(config, st.item);
      el('span', '', pick, `${ai.icon} ${ai.name}${st.count > 1 ? ` ×${st.count}` : ''}`);
      el(
        'span',
        'wb__where',
        pick,
        fits ? `${acc.slot} · ${ai.stats}` : `${acc.slot} · no place here`,
      );
      pick.title = ai.title;
      if (fits) {
        const preview = () => paintTable({ place: acc.slot, item: st.item });
        pick.addEventListener('mouseenter', preview);
        pick.addEventListener('focus', preview);
        pick.addEventListener('mouseleave', () => paintTable());
        pick.addEventListener('blur', () => paintTable());
        pick.addEventListener('click', () => {
          const at = where();
          if (at !== null && fitAccessory(getState(), config, unitId, at, index)) {
            onChange();
            paint();
          }
        });
      }
    }

    const tableHost = el('div', '', box);
    const paintTable = (hover?: { place: AccessorySlot; item: string }) => {
      tableHost.replaceChildren();
      const base = reportOf(config, def, {});
      const now = reportOf(config, def, fitted);
      const withIt = hover ? reportOf(config, def, { ...fitted, [hover.place]: hover.item }) : null;
      const table = el('table', 'wb__stats', tableHost);
      const head = el('tr', '', el('thead', '', table));
      for (const h of ['', 'Bare', 'Now', ...(withIt ? ['With'] : [])]) el('th', '', head, h);
      const body = el('tbody', '', table);
      for (const row of ROWS) {
        const tr = el('tr', '', body);
        el('td', '', tr, row.label);
        const was = row.read(base);
        for (const report of withIt ? [base, now, withIt] : [base, now]) {
          const value = row.read(report);
          const td = el('td', '', tr, show(value));
          if (value !== null && was !== null && Math.abs(value - was) > 1e-9) {
            const better = row.lowerIsBetter ? value < was : value > was;
            td.className = better ? 'wb__better' : 'wb__worse';
          }
        }
      }
    };
    paintTable();
    el(
      'p',
      'wb__hint',
      box,
      'Hover an accessory to see the weapon with it. Noise is shown but enemies do not hear shots yet.',
    );
  };
  paint();
}
