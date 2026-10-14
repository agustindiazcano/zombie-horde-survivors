import './upgrades.css';
import {
  buyItem,
  choosePerk,
  shopAvailable,
  shopCost,
  type GameConfig,
  type GameState,
} from './sim';

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

/**
 * The level-up screen: pick one of the offered perks (click, or keys 1-3 so it also works
 * while the cursor is locked in first/third person). Shown whenever the sim has an offer.
 */
export class PerkPicker {
  private readonly root = el('div', 'up up--perks');
  private shown = '';

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    private readonly getState: () => GameState,
  ) {
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.getState().perkOffer !== null;
  }

  /** Redraws when the offer changes. Call every frame. */
  update(): void {
    const state = this.getState();
    const offer = state.perkOffer;
    const key = offer ? `${offer.join(',')}|${state.pendingPerks}` : '';
    if (key === this.shown) return;
    this.shown = key;
    this.root.replaceChildren();
    this.root.classList.toggle('up--open', offer !== null);
    if (!offer) return;

    const panel = el('div', 'up__panel', this.root);
    el('h2', 'up__title', panel, 'Level up!');
    const more = state.pendingPerks > 1 ? ` (${state.pendingPerks - 1} more waiting)` : '';
    el('p', 'up__sub', panel, `Choose a perk for the whole squad${more}`);
    const row = el('div', 'up__cards', panel);
    offer.forEach((id, i) => {
      const perk = this.config.perks.list.find((p) => p.id === id);
      if (!perk) return;
      const stacks = state.upgrades[id] ?? 0;
      const card = el('button', 'up__card', row);
      el('span', 'up__key', card, String(i + 1));
      el('span', 'up__name', card, perk.name);
      el('span', 'up__desc', card, perk.description);
      el('span', 'up__stacks', card, `Owned ${stacks} / ${perk.maxStacks}`);
      card.addEventListener('click', () => this.pick(id));
    });
  }

  /** Handles keys 1-3. Returns true if the key was used. */
  onKey(code: string): boolean {
    const offer = this.getState().perkOffer;
    if (!offer) return false;
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    const id = match ? offer[Number(match[1]) - 1] : undefined;
    if (id === undefined) return true; // swallow other keys' game actions while choosing
    this.pick(id);
    return true;
  }

  private pick(id: string): void {
    choosePerk(this.getState(), this.config, id);
    this.shown = '';
    this.update();
  }
}

/**
 * The between-wave shop (B). Pauses the game while open; spends gold on healing, reinforcements,
 * weapons for one unit, and permanent upgrades.
 */
export class Shop {
  private readonly root = el('div', 'up up--shop');
  private open = false;
  private message = '';
  private unitId: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    private readonly getState: () => GameState,
  ) {
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Opens the shop; weapons are delivered to `unitId`. */
  show(unitId: number | null): void {
    if (!shopAvailable(this.getState())) return;
    this.open = true;
    this.unitId = unitId;
    this.message = '';
    this.render();
  }

  close(): void {
    this.open = false;
    this.render();
  }

  private render(): void {
    this.root.replaceChildren();
    this.root.classList.toggle('up--open', this.open);
    if (!this.open) return;

    const state = this.getState();
    const panel = el('div', 'up__panel up__panel--wide', this.root);
    el('h2', 'up__title', panel, 'Shop');
    el('p', 'up__sub', panel, `Gold: ${state.gold}`);
    const list = el('div', 'up__items', panel);
    for (const item of this.config.shop.items) {
      const cost = shopCost(state, item);
      const row = el('button', 'up__item', list);
      row.disabled = state.gold < cost;
      const text = el('span', 'up__item-text', row);
      el('span', 'up__name', text, item.name);
      el('span', 'up__desc', text, this.describe(item));
      el('span', 'up__cost', row, `${cost} gold`);
      row.addEventListener('click', () => {
        this.message = buyItem(this.getState(), this.config, item.id, this.unitId) ?? 'Purchased';
        this.render();
      });
    }
    el('p', 'up__msg', panel, this.message);
    const done = el('button', 'up__close', panel, 'Close (B / Esc)');
    done.addEventListener('click', () => this.close());
  }

  private describe(item: GameConfig['shop']['items'][number]): string {
    if (item.kind !== 'perk' || !item.target) return item.description;
    const perk = this.config.perks.list.find((p) => p.id === item.target);
    const stacks = this.getState().upgrades[item.target] ?? 0;
    return perk ? `${item.description} (${stacks} / ${perk.maxStacks})` : item.description;
  }
}
