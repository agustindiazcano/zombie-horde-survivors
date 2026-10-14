import './unitsScreen.css';
import { MenuModel } from './menuModel';
import type { CharacterFactory } from './render/characters';
import {
  levelInfo,
  maxHealthOf,
  moveItem,
  weaponDef,
  type GameConfig,
  type GameState,
  type Slot,
  type Soldier,
} from './sim';

/** How many unit windows can be open at once. */
const MAX_OPEN = 4;

const WEAPON_ICON: Record<string, string> = {
  rifle: '🔫',
  pistol: '🔫',
  heavy_mg: '💥',
  drone_cannon: '🛸',
};

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

interface UnitWindow {
  root: HTMLElement;
  info: HTMLElement;
  slots: HTMLElement;
  model: MenuModel;
}

/**
 * The squad screen shown beside the pause panel: every unit with its health, experience
 * and kills. Click a unit to open its window (up to two at once) with a 3D model and its
 * inventory; weapons can be dragged between slots, including from one window to the other.
 */
export class UnitsScreen {
  private readonly root = el('div', 'us');
  private readonly list = el('div', 'us__list');
  private readonly windows = el('div', 'us__windows');
  private readonly open = new Map<number, UnitWindow>();
  private selected: number[] = [];
  private visible = false;
  private picked: Slot | null = null;
  private pickedCell: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    private readonly getState: () => GameState,
    private readonly modelFor: (unit: Soldier) => CharacterFactory,
    private readonly focusId: () => number | null,
  ) {
    el('h3', 'us__heading', this.root, 'Squad');
    this.root.append(this.list, this.windows);
    parent.appendChild(this.root);
  }

  /** Call every frame: opens when the game pauses and closes (freeing the 3D views) on resume. */
  update(paused: boolean): void {
    if (paused === this.visible) return;
    this.visible = paused;
    this.root.classList.toggle('us--open', paused);
    if (!paused) {
      for (const id of [...this.open.keys()]) this.closeWindow(id);
      return;
    }
    const state = this.getState();
    const focus = state.soldiers.find((s) => s.id === this.focusId() && !s.dead);
    const first = focus ?? state.soldiers.find((s) => !s.dead);
    this.selected = first ? [first.id] : [];
    this.renderAll();
  }

  private renderAll(): void {
    this.renderList();
    this.syncWindows();
    for (const id of this.open.keys()) this.renderWindow(id);
  }

  private toggle(id: number): void {
    if (this.selected.includes(id)) this.selected = this.selected.filter((x) => x !== id);
    else {
      this.selected.push(id);
      if (this.selected.length > MAX_OPEN) this.selected.shift();
    }
    this.renderAll();
  }

  private renderList(): void {
    const state = this.getState();
    const maxHp = maxHealthOf(state, this.config);
    this.list.replaceChildren();
    for (const s of state.soldiers) {
      const info = levelInfo(s.xp, this.config);
      const card = el('button', 'us__card', this.list);
      card.classList.toggle('us__card--selected', this.selected.includes(s.id));
      card.classList.toggle('us__card--dead', s.dead);
      card.disabled = s.dead;
      el('div', 'us__name', card, `${unitName(s)}${s.dead ? ' (fallen)' : ''}`);
      this.bar(
        card,
        'us__bar--hp',
        s.health / maxHp,
        `HP ${Math.ceil(s.health)} / ${Math.round(maxHp)}`,
      );
      this.bar(
        card,
        'us__bar--xp',
        info.into / info.needed,
        `Lv ${info.level} · XP ${info.into} / ${info.needed}`,
      );
      el('div', 'us__kills', card, `☠ ${s.kills} kills`);
      card.addEventListener('click', () => this.toggle(s.id));
    }
  }

  private bar(parent: HTMLElement, cls: string, fraction: number, label: string): void {
    const bar = el('div', `us__bar ${cls}`, parent);
    const fill = el('div', 'us__bar-fill', bar);
    fill.style.width = `${Math.min(Math.max(fraction, 0), 1) * 100}%`;
    el('span', 'us__bar-label', bar, label);
  }

  /** Opens windows for newly selected units and closes those no longer selected. */
  private syncWindows(): void {
    for (const id of [...this.open.keys()]) {
      if (!this.selected.includes(id)) this.closeWindow(id);
    }
    const state = this.getState();
    for (const id of this.selected) {
      const unit = state.soldiers.find((s) => s.id === id);
      if (!unit || this.open.has(id)) continue;
      const root = el('div', 'us__window', this.windows);
      const stage = el('div', 'us__stage', root);
      const side = el('div', 'us__side', root);
      const info = el('div', 'us__info', side);
      const slots = el('div', 'us__slots', side);
      const model = new MenuModel(stage, this.modelFor(unit));
      this.open.set(id, { root, info, slots, model });
    }
  }

  private closeWindow(id: number): void {
    const w = this.open.get(id);
    if (!w) return;
    w.model.stop();
    w.root.remove();
    this.open.delete(id);
  }

  private renderWindow(id: number): void {
    const w = this.open.get(id);
    const state = this.getState();
    const unit = state.soldiers.find((s) => s.id === id);
    if (!w || !unit) return;

    const info = levelInfo(unit.xp, this.config);
    const maxHp = maxHealthOf(state, this.config);
    w.info.replaceChildren();
    el('h4', 'us__title', w.info, unitName(unit));
    this.bar(
      w.info,
      'us__bar--hp',
      unit.health / maxHp,
      `HP ${Math.ceil(unit.health)} / ${Math.round(maxHp)}`,
    );
    this.bar(
      w.info,
      'us__bar--xp',
      info.into / info.needed,
      `Lv ${info.level} · XP ${info.into} / ${info.needed}`,
    );
    el('div', 'us__kills', w.info, `☠ ${unit.kills} kills`);

    w.slots.replaceChildren();
    el('div', 'us__label', w.slots, 'Equipped');
    this.slot(w.slots, unit, 'weapon', unit.weapon ?? undefined);
    el('div', 'us__label', w.slots, 'Backpack');
    const grid = el('div', 'us__grid', w.slots);
    for (let i = 0; i < this.config.inventory.backpackSlots; i++) {
      this.slot(grid, unit, i, unit.backpack[i]);
    }
  }

  /** One weapon slot: draggable when it holds a weapon, and always a drop target. */
  private slot(
    parent: HTMLElement,
    unit: Soldier,
    slot: Slot['slot'],
    item: string | undefined,
  ): void {
    const cell = el('div', 'us__slot', parent);
    cell.classList.toggle('us__slot--empty', item === undefined);
    if (item !== undefined) {
      const def = weaponDef(this.config, item);
      el('div', 'us__slot-icon', cell, WEAPON_ICON[item] ?? '🔫');
      el('div', 'us__slot-name', cell, def.name);
      el('div', 'us__slot-stats', cell, `${def.damage} dmg · ${def.fireRate}/s`);
      cell.title = `${def.name}: damage ${def.damage}, ${def.fireRate} shots/s, range ${def.range}`;
      cell.draggable = true;
      cell.addEventListener('dragstart', (e) => {
        const from: Slot = { unitId: unit.id, slot };
        e.dataTransfer?.setData('text/plain', JSON.stringify(from));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        cell.classList.add('us__slot--dragging');
      });
      cell.addEventListener('dragend', () => cell.classList.remove('us__slot--dragging'));
    }
    // Tap to pick a weapon, tap another slot to move it there: touch screens can't drag reliably.
    cell.addEventListener('click', () => {
      const here: Slot = { unitId: unit.id, slot };
      const picked = this.picked;
      this.pickedCell?.classList.remove('us__slot--picked');
      this.picked = null;
      this.pickedCell = null;
      if (!picked) {
        if (item === undefined) return;
        this.picked = here;
        this.pickedCell = cell;
        cell.classList.add('us__slot--picked');
        return;
      }
      if (picked.unitId === here.unitId && picked.slot === here.slot) return;
      if (moveItem(this.getState(), this.config, picked, here)) {
        for (const id of this.open.keys()) this.renderWindow(id);
      }
    });
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      cell.classList.add('us__slot--over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('us__slot--over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('us__slot--over');
      let from: Slot;
      try {
        from = JSON.parse(e.dataTransfer?.getData('text/plain') ?? '') as Slot;
      } catch {
        return;
      }
      if (moveItem(this.getState(), this.config, from, { unitId: unit.id, slot })) {
        for (const id of this.open.keys()) this.renderWindow(id);
      }
    });
  }
}
