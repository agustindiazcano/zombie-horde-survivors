import './unitsScreen.css';
import { itemInfo } from './itemInfo';
import { MenuModel } from './menuModel';
import type { CharacterFactory } from './render/characters';
import {
  cellAt,
  levelInfo,
  maxHealthOf,
  equipFromBackpack,
  itemDef,
  moveItem,
  skillLevel,
  unequipSlot,
  useItem,
  weaponDef,
  type GameConfig,
  type GameState,
  type Slot,
  type SlotRef,
  type Soldier,
} from './sim';

/** How many unit windows can be open at once. */
const MAX_OPEN = 4;

/** Caption of the right hand when both hands are empty (fists do not fight yet). */
const FISTS = '✊ Fists';

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

const unitName = (s: Soldier) => s.name ?? `${s.kind === 'drone' ? 'Drone' : 'Soldier'} ${s.id}`;

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
    this.list.replaceChildren();
    for (const s of state.soldiers) {
      const info = levelInfo(s.xp, this.config);
      const maxHp = maxHealthOf(state, this.config, s);
      const card = el('button', 'us__card', this.list);
      card.classList.toggle('us__card--selected', this.selected.includes(s.id));
      card.classList.toggle('us__card--dead', s.dead);
      card.disabled = s.dead;
      const name = el('div', 'us__name', card);
      el('span', 'us__icon', name, s.kind === 'drone' ? '◈' : '🪖');
      el(
        'span',
        'us__num',
        name,
        `${unitName(s)}${s.dead ? ' (fallen)' : s.downed ? ` (down ${Math.ceil(s.bleedOut)} s)` : ''}`,
      );
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
    const maxHp = maxHealthOf(state, this.config, unit);
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

    const attrs = el('div', 'us__sheet', w.info);
    el('div', 'us__label', attrs, 'Attributes (not active yet)');
    for (const name of this.config.units.attributes) {
      el('span', 'us__stat', attrs, `${name.slice(0, 3).toUpperCase()} ${unit.attributes[name]}`);
    }
    const skills = Object.entries(unit.skills).filter(([, xp]) => xp > 0);
    if (skills.length > 0) {
      const box = el('div', 'us__sheet', w.info);
      el('div', 'us__label', box, 'Weapon skills (no effect yet)');
      for (const [cls, xp] of skills) {
        const lv = skillLevel(this.config, xp);
        el('span', 'us__stat', box, `${cls} Lv ${lv.level} · ${lv.into}/${lv.needed}`);
      }
    }

    w.slots.replaceChildren();
    const doll = el('div', 'us__box', w.slots);
    el('div', 'us__label', doll, 'Equipment');
    const worn = el('div', 'us__doll', doll);
    const { rightHand, leftHand, chest } = unit.equipment;
    const twoHanded = rightHand !== null && weaponDef(this.config, rightHand).hands === 2;
    const empty = rightHand === null && leftHand === null && unit.kind === 'soldier';
    this.slot(worn, unit, 'rightHand', rightHand, empty ? FISTS : 'Right hand');
    this.slot(worn, unit, 'leftHand', leftHand, twoHanded ? 'Two-handed' : 'Left hand');
    this.slot(worn, unit, 'chest', chest, 'Vest');
    const pack = el('div', 'us__box', w.slots);
    el(
      'div',
      'us__label',
      pack,
      `Backpack ${unit.backpack.length} / ${this.config.inventory.backpackSlots}`,
    );
    const grid = el('div', 'us__grid', pack);
    for (let i = 0; i < this.config.inventory.backpackSlots; i++) {
      this.slot(grid, unit, i, unit.backpack[i]?.item, 'Empty', unit.backpack[i]?.count);
    }
  }

  /** ` · 12/12` for a weapon with a magazine (a weapon never loaded counts as full). */
  private roundsText(unit: Soldier, slot: SlotRef, item: string): string {
    const def = itemDef(this.config, item);
    if (def.type !== 'weapon' || !def.magazine) return '';
    return ` · ${cellAt(unit, slot)?.state?.loaded ?? def.magazine}/${def.magazine}`;
  }

  /**
   * One slot: draggable when it holds an item, and always a drop target. `caption` names an
   * empty slot; a backpack stack shows its `count`.
   */
  private slot(
    parent: HTMLElement,
    unit: Soldier,
    slot: SlotRef,
    item: string | undefined | null,
    caption: string,
    count = 1,
  ): void {
    const cell = el('div', 'us__slot', parent);
    cell.classList.toggle('us__slot--empty', item === undefined || item === null);
    if (item === undefined || item === null) {
      el('div', 'us__slot-name', cell, caption);
      if (caption === FISTS) el('div', 'us__slot-stats', cell, 'not active yet');
    } else {
      const info = itemInfo(this.config, item);
      el('div', 'us__slot-icon', cell, info.icon);
      el('div', 'us__slot-name', cell, count > 1 ? `${info.name} ×${count}` : info.name);
      el('div', 'us__slot-stats', cell, `${info.stats}${this.roundsText(unit, slot, item)}`);
      cell.title = info.title;
      const action = this.actionFor(unit, slot, item);
      if (action) {
        const toggle = el('button', 'us__equip', cell, action.label);
        toggle.addEventListener('click', (e) => {
          e.stopPropagation(); // not a tap-to-move pick
          if (action.run(this.getState())) for (const id of this.open.keys()) this.renderWindow(id);
        });
      }
      cell.draggable = true;
      cell.addEventListener('dragstart', (e) => {
        const from: Slot = { unitId: unit.id, slot };
        e.dataTransfer?.setData('text/plain', JSON.stringify(from));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        cell.classList.add('us__slot--dragging');
      });
      cell.addEventListener('dragend', () => cell.classList.remove('us__slot--dragging'));
    }
    // Tap to pick an item, tap another slot to move it there: touch screens can't drag reliably.
    cell.addEventListener('click', () => {
      const here: Slot = { unitId: unit.id, slot };
      const picked = this.picked;
      this.pickedCell?.classList.remove('us__slot--picked');
      this.picked = null;
      this.pickedCell = null;
      if (!picked) {
        if (item === undefined || item === null) return;
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

  /** The small button of a filled slot: unequip a worn item, equip a weapon or vest, use a medkit. */
  private actionFor(
    unit: Soldier,
    slot: SlotRef,
    item: string,
  ): { label: string; run: (state: GameState) => boolean } | null {
    if (typeof slot === 'string') {
      return { label: 'Unequip', run: (st) => unequipSlot(st, this.config, unit.id, slot) };
    }
    const type = itemDef(this.config, item).type;
    if (type === 'weapon' || type === 'armor') {
      return { label: 'Equip', run: (st) => equipFromBackpack(st, this.config, unit.id, slot) };
    }
    if (type === 'medical') {
      return { label: 'Use', run: (st) => useItem(st, this.config, unit.id, slot) };
    }
    return null;
  }
}
