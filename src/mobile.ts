import './mobile.css';

/** Joystick travel (px) from its centre to full speed. */
const STICK_RADIUS = 52;
/** Below this fraction of the radius the stick reads as "no input". */
const DEAD_ZONE = 0.12;

/** Phones and tablets (coarse pointer), or `?mobile=1` to try the layout on a desktop browser. */
export function isMobile(): boolean {
  try {
    if (new URLSearchParams(location.search).has('mobile')) return true;
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

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

export interface MobileActions {
  onMove: (x: number, z: number) => void;
  onSettings: () => void;
  onMenu: () => void;
  onShop: () => void;
  onInventory: () => void;
}

/**
 * Touch layout for a phone held sideways: a translucent joystick on the left that moves the whole
 * squad (the leader walks, the rest follow, everyone shoots on their own) and four buttons on the
 * right. The drag hint pulses until the first time the stick is used.
 */
export class MobileControls {
  private readonly root = el('div', 'mob');
  private readonly knob: HTMLElement;
  private readonly base: HTMLElement;
  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;

  constructor(
    parent: HTMLElement,
    private readonly actions: MobileActions,
  ) {
    document.body.classList.add('mobile');

    const zone = el('div', 'mob__zone', this.root);
    this.base = el('div', 'mob__stick mob__stick--hint', zone);
    for (const dir of ['up', 'right', 'down', 'left']) {
      el('span', `mob__arrow mob__arrow--${dir}`, this.base);
    }
    this.knob = el('div', 'mob__knob', this.base);
    el('div', 'mob__tip', zone, 'Drag to move the squad');

    zone.addEventListener('pointerdown', (e) => this.down(e, zone));
    zone.addEventListener('pointermove', (e) => this.move(e));
    zone.addEventListener('pointerup', (e) => this.up(e));
    zone.addEventListener('pointercancel', (e) => this.up(e));

    const bar = el('div', 'mob__buttons', this.root);
    this.button(bar, '⚙', 'Settings', actions.onSettings);
    this.button(bar, '☰', 'Main menu', actions.onMenu);
    this.button(bar, '🛒', 'Shop', actions.onShop);
    this.button(bar, '🎒', 'Squad & inventory', actions.onInventory);

    const rotate = el('div', 'mob__rotate', this.root);
    el('div', '', rotate, '⟳');
    el('div', '', rotate, 'Rotate your phone to landscape to play');

    // No page scroll, zoom or long-press menu while playing.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(this.root);
  }

  private button(parent: HTMLElement, icon: string, label: string, onTap: () => void): void {
    const b = el('button', 'mob__btn', parent, icon);
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onTap);
  }

  private down(e: PointerEvent, zone: HTMLElement): void {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = this.base.getBoundingClientRect();
    this.baseX = r.left + r.width / 2;
    this.baseY = r.top + r.height / 2;
    this.base.classList.remove('mob__stick--hint');
    this.base.classList.add('mob__stick--active');
    this.move(e);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    let dx = e.clientX - this.baseX;
    let dy = e.clientY - this.baseY;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(len, STICK_RADIUS) / STICK_RADIUS;
    if (mag < DEAD_ZONE) this.actions.onMove(0, 0);
    // Screen-up is -z, like W.
    else this.actions.onMove(dx / STICK_RADIUS, dy / STICK_RADIUS);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.knob.style.transform = '';
    this.base.classList.remove('mob__stick--active');
    this.actions.onMove(0, 0);
  }
}
