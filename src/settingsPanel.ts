import './settingsPanel.css';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  SHADOW_SIZES,
  qualityOf,
  type Quality,
  type Settings,
} from './settings';

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

const SHADOW_LABEL: Record<number, string> = { 1024: 'Low', 2048: 'Medium', 4096: 'High' };

/**
 * The settings window: graphics (a quality preset plus the individual options), the lighting
 * mode, the FPS counter and the sound volume. Every change is applied right away through
 * `onChange`; the caller keeps the Settings object and saves it.
 */
export class SettingsPanel {
  private readonly root = el('div', 'set');
  private open = false;
  private onClose: () => void = () => undefined;

  constructor(
    parent: HTMLElement,
    private readonly getSettings: () => Settings,
    private readonly onChange: (next: Settings) => void,
  ) {
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Shows the panel; `onClose` runs when it is closed again. */
  show(onClose: () => void = () => undefined): void {
    this.open = true;
    this.onClose = onClose;
    this.root.classList.add('set--open');
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('set--open');
    this.onClose();
  }

  /** Applies a change, then redraws so the controls and the preset name stay consistent. */
  private change(patch: Partial<Settings>): void {
    const next = { ...this.getSettings(), ...patch };
    if (patch.quality === undefined) next.quality = qualityOf(next);
    this.onChange(next);
    this.render();
  }

  private render(): void {
    const s = this.getSettings();
    this.root.replaceChildren();
    const panel = el('div', 'set__panel', this.root);
    el('h2', 'set__title', panel, 'Settings');

    el('h3', 'set__heading', panel, 'Graphics');
    this.select(
      panel,
      'Quality',
      s.quality,
      [
        ['toaster', 'Toaster'],
        ['low', 'Low'],
        ['medium', 'Medium'],
        ['high', 'High'],
        ['custom', 'Custom'],
      ],
      (v) => {
        const quality = v as Quality;
        if (quality === 'custom') return this.render();
        this.change({ ...PRESETS[quality], quality });
      },
    );
    this.toggle(panel, 'Shadows', s.shadows, (v) => this.change({ shadows: v }));
    this.select(
      panel,
      'Shadow quality',
      String(s.shadowMapSize),
      SHADOW_SIZES.map((n) => [String(n), SHADOW_LABEL[n] ?? String(n)] as [string, string]),
      (v) => this.change({ shadowMapSize: Number(v) }),
      !s.shadows,
    );
    this.slider(
      panel,
      'Resolution',
      s.resolutionScale,
      0.25,
      1,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.change({ resolutionScale: v }),
    );
    this.select(
      panel,
      'Surface depth',
      String(s.parallax),
      [
        ['0', 'Off'],
        ['1', 'Light'],
        ['2', 'Full, with shadows'],
      ],
      (v) => this.change({ parallax: Number(v) }),
    );
    this.select(
      panel,
      'Textures',
      String(s.textures),
      [
        ['0', 'Melted (toaster)'],
        ['1', 'Low'],
        ['2', 'Normal'],
        ['3', 'Ultra (bigger download)'],
      ],
      (v) => this.change({ textures: Number(v) }),
    );
    this.toggle(panel, 'Blood and gibs', s.gore, (v) => this.change({ gore: v }));
    this.select(
      panel,
      'Lighting (L)',
      s.darkMode ? 'dark' : 'normal',
      [
        ['normal', 'Normal'],
        ['dark', 'Dark, with flashlights'],
      ],
      (v) => this.change({ darkMode: v === 'dark' }),
    );
    this.toggle(panel, 'Show FPS (F3)', s.showFps, (v) => this.change({ showFps: v }));

    el('h3', 'set__heading', panel, 'Controls');
    this.toggle(panel, 'Aim: click to toggle (default: hold right button)', s.aimToggle, (v) =>
      this.change({ aimToggle: v }),
    );

    el('h3', 'set__heading', panel, 'Audio');
    this.slider(
      panel,
      'Volume',
      s.volume,
      0,
      1,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.change({ volume: v }),
    );

    const buttons = el('div', 'set__buttons', panel);
    const reset = el('button', 'set__button', buttons, 'Reset to defaults');
    reset.addEventListener('click', () => this.change({ ...DEFAULT_SETTINGS }));
    const done = el('button', 'set__button set__button--primary', buttons, 'Close (Esc)');
    done.addEventListener('click', () => this.close());
  }

  private row(parent: HTMLElement, label: string, disabled = false): HTMLElement {
    const row = el('label', 'set__row', parent);
    row.classList.toggle('set__row--disabled', disabled);
    el('span', 'set__label', row, label);
    return row;
  }

  private select(
    parent: HTMLElement,
    label: string,
    value: string,
    options: [string, string][],
    onPick: (value: string) => void,
    disabled = false,
  ): void {
    const select = el('select', 'set__control', this.row(parent, label, disabled));
    select.disabled = disabled;
    for (const [v, text] of options) {
      const option = el('option', '', select, text);
      option.value = v;
    }
    select.value = value;
    select.addEventListener('change', () => onPick(select.value));
  }

  private toggle(
    parent: HTMLElement,
    label: string,
    value: boolean,
    onPick: (value: boolean) => void,
  ): void {
    const box = el('input', 'set__check', this.row(parent, label));
    box.type = 'checkbox';
    box.checked = value;
    box.addEventListener('change', () => onPick(box.checked));
  }

  private slider(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    onPick: (value: number) => void,
  ): void {
    const row = this.row(parent, label);
    const wrap = el('span', 'set__slider', row);
    const input = el('input', 'set__range', wrap);
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const shown = el('span', 'set__value', wrap, format(value));
    // Update the label while dragging; apply once released so a redraw doesn't drop the thumb.
    input.addEventListener('input', () => (shown.textContent = format(Number(input.value))));
    input.addEventListener('change', () => onPick(Number(input.value)));
  }
}
