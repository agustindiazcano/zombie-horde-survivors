import './inventory.css';
import { itemInfo } from './itemInfo';
import {
  backpackFull,
  equipFromBackpack,
  getCrate,
  itemDef,
  stashInCrate,
  takeFromCrate,
  useItem,
  type GameConfig,
  type GameState,
  type Soldier,
} from './sim';

type Mode =
  | { type: 'closed' }
  | { type: 'inventory'; unitId: number }
  | { type: 'crate'; unitId: number; crateId: number };

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

const unitName = (s: Soldier) => `${s.kind === 'drone' ? 'Drone' : 'Soldier'} ${s.id}`;

/**
 * Modal inventory screens. "inventory" (I) shows one unit at a time with tabs for the squad;
 * "crate" (E) shows a nearby crate on the left and the opening unit's inventory on the right.
 * The simulation is paused by the caller while `isOpen`.
 */
export class InventoryUi {
  private readonly root = el('div', 'inv');
  private mode: Mode = { type: 'closed' };

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    private readonly getState: () => GameState,
  ) {
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.mode.type !== 'closed';
  }

  openInventory(unitId: number): void {
    this.mode = { type: 'inventory', unitId };
    this.render();
  }

  openCrate(unitId: number, crateId: number): void {
    this.mode = { type: 'crate', unitId, crateId };
    this.render();
  }

  close(): void {
    this.mode = { type: 'closed' };
    this.render();
  }

  private itemLabel(id: string | null, parent: HTMLElement, count = 1): void {
    if (id === null) {
      el('div', 'inv__item-name', parent, 'Empty');
      return;
    }
    const info = itemInfo(this.config, id);
    el('div', 'inv__item-name', parent, count > 1 ? `${info.name} ×${count}` : info.name);
    el('div', 'inv__item-stats', parent, info.stats);
    parent.title = info.title;
  }

  private button(parent: HTMLElement, text: string, onClick: () => void): void {
    const b = el('button', 'inv__btn', parent, text);
    b.addEventListener('click', () => {
      onClick();
      this.render();
    });
  }

  private render(): void {
    this.root.replaceChildren();
    const mode = this.mode;
    this.root.classList.toggle('inv--open', mode.type !== 'closed');
    if (mode.type === 'closed') return;

    const state = this.getState();
    const unit = state.soldiers.find((s) => s.id === mode.unitId);
    if (!unit) return this.close();

    const crate = mode.type === 'crate' ? getCrate(state, mode.crateId) : undefined;
    if (mode.type === 'crate' && !crate) return this.close();

    const window_ = el('div', 'inv__window', this.root);
    const header = el('div', 'inv__header', window_);
    el('h2', '', header, mode.type === 'crate' ? 'Crate' : 'Inventory');
    this.button(header, 'Close', () => this.close());
    if (mode.type === 'inventory') this.renderTabs(window_, state, unit);

    const columns = el('div', 'inv__columns', window_);
    if (crate && mode.type === 'crate') {
      const left = el('div', 'inv__panel', columns);
      el('h3', '', left, 'Crate');
      crate.items.forEach((item, index) => {
        const row = el('div', 'inv__item', left);
        this.itemLabel(item, row);
        this.button(row, 'Take', () => takeFromCrate(state, this.config, unit.id, crate.id, index));
      });
      if (crate.items.length > 1) {
        this.button(left, 'Take all', () => {
          while (getCrate(state, crate.id)?.items.length) {
            if (!takeFromCrate(state, this.config, unit.id, crate.id, 0)) break;
          }
        });
      }
    }
    this.renderUnit(columns, state, unit, crate?.id ?? null);
  }

  private renderTabs(parent: HTMLElement, state: GameState, active: Soldier): void {
    const tabs = el('div', 'inv__tabs', parent);
    for (const s of state.soldiers) {
      const tab = el('button', 'inv__tab', tabs, unitName(s));
      tab.classList.toggle('inv__tab--active', s.id === active.id);
      tab.classList.toggle('inv__tab--dead', s.dead);
      tab.addEventListener('click', () => this.openInventory(s.id));
    }
  }

  private renderUnit(
    parent: HTMLElement,
    state: GameState,
    unit: Soldier,
    crateId: number | null,
  ): void {
    const panel = el('div', 'inv__panel', parent);
    el('h3', '', panel, unitName(unit));

    el('div', 'inv__label', panel, 'Equipped');
    for (const [slot, caption] of [
      ['rightHand', 'Right hand'],
      ['leftHand', 'Left hand'],
      ['chest', 'Vest'],
    ] as const) {
      const equipped = el('div', 'inv__item inv__item--equipped', panel);
      el('div', 'inv__item-stats', equipped, caption);
      this.itemLabel(unit.equipment[slot], equipped);
    }

    el(
      'div',
      'inv__label',
      panel,
      `Backpack ${unit.backpack.length} / ${this.config.inventory.backpackSlots}`,
    );
    for (let i = 0; i < this.config.inventory.backpackSlots; i++) {
      const stack = unit.backpack[i];
      const row = el(
        'div',
        stack === undefined ? 'inv__item inv__item--empty' : 'inv__item',
        panel,
      );
      if (stack === undefined) {
        el('div', 'inv__item-name', row, '—');
        continue;
      }
      this.itemLabel(stack.item, row, stack.count);
      const actions = el('div', 'inv__actions', row);
      const type = itemDef(this.config, stack.item).type;
      if (type === 'weapon' || type === 'armor') {
        this.button(actions, 'Equip', () => equipFromBackpack(state, this.config, unit.id, i));
      } else if (type === 'medical') {
        this.button(actions, 'Use', () => useItem(state, this.config, unit.id, i));
      }
      if (crateId !== null) {
        this.button(actions, '→ Crate', () =>
          stashInCrate(state, this.config, unit.id, crateId, i),
        );
      }
    }
    if (crateId !== null && backpackFull(this.config, unit)) {
      el('div', 'inv__note', panel, 'Backpack full');
    }
  }
}

/** The floating "E" shown above a crate the controlled unit can open. */
export class CratePrompt {
  private readonly node: HTMLElement;

  /** `key` is the letter shown in the little bubble over the thing you can use. */
  constructor(key = 'E') {
    this.node = el('div', 'crate-prompt', document.body, key);
  }

  show(x: number, y: number): void {
    this.node.style.display = 'block';
    this.node.style.left = `${x}px`;
    this.node.style.top = `${y}px`;
  }

  hide(): void {
    this.node.style.display = 'none';
  }
}
