import './settingsPanel.css';
import { DEFAULT_SETTINGS, PRESETS, qualityOf, type Quality, type Settings } from './settings';
import {
  FRAME_60,
  MS_PER_BAR,
  loadMeasurement,
  measureAll,
  measuredMs,
  predictMs,
  recommend,
  saveMeasurement,
  type Measurement,
  type Probe,
} from './graphicsBench';
import {
  GROUPS,
  OPTIONS,
  costOfOption,
  totalCost,
  type Cost,
  type GraphicsOption,
} from './graphicsOptions';

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

const PRESET_NAMES: [Exclude<Quality, 'custom'>, string][] = [
  ['toaster', 'Toaster'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['ultra', 'Ultra'],
];

/** Id of the page that is not a group of graphics options. */
const GENERAL = 'general';

/**
 * The settings window, nearly full screen: a header with the quality presets and three bars that
 * show how heavy the chosen options are (GPU, CPU, video memory); the graphics options grouped by
 * topic on the left, each with a chip that says what the chosen value costs; and a General page
 * (lighting, FPS counter, aim, volume). The game stays paused behind it. Every change is applied
 * right away through `onChange`; the caller keeps the Settings object and saves it.
 */
export class SettingsPanel {
  private readonly root = el('div', 'set');
  private open = false;
  private onClose: () => void = () => undefined;
  private page: string = GROUPS[0]!.id;
  private measurement: Measurement | null = loadMeasurement();
  /** Set while "Measure my machine" runs: how many values are done of how many. */
  private measuring: { done: number; total: number } | null = null;

  constructor(
    parent: HTMLElement,
    private readonly getSettings: () => Settings,
    private readonly onChange: (next: Settings) => void,
    private readonly probe: Probe | null = null,
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

  /** Applies a change, then redraws so the controls, the preset name and the bars stay consistent. */
  private change(patch: Partial<Settings>): void {
    const next = { ...this.getSettings(), ...patch };
    if (patch.quality === undefined) next.quality = qualityOf(next);
    this.onChange(next);
    this.render();
  }

  private render(): void {
    const s = this.getSettings();
    const scroll = this.root.querySelector('.set__main')?.scrollTop ?? 0;
    this.root.replaceChildren();
    const panel = el('div', 'set__panel', this.root);

    // Header: title, presets, the total cost.
    const head = el('div', 'set__head', panel);
    el('h2', 'set__title', head, 'Settings');
    const presets = el('div', 'set__presets', head);
    for (const [id, name] of PRESET_NAMES) {
      const b = el('button', 'set__preset', presets, name);
      b.classList.toggle('set__preset--on', s.quality === id);
      b.title =
        id === 'ultra'
          ? 'For a machine with a real graphics card'
          : id === 'toaster'
            ? 'For a machine that struggles'
            : '';
      b.addEventListener('click', () => this.change({ ...PRESETS[id], quality: id }));
    }
    const custom = el('span', 'set__custom', presets, 'Custom');
    custom.classList.toggle('set__preset--on', s.quality === 'custom');
    this.measureButtons(presets, s);
    this.totals(head, s);

    // Left: the pages.
    const nav = el('div', 'set__nav', panel);
    for (const g of GROUPS) {
      const b = el('button', 'set__page', nav);
      b.classList.toggle('set__page--on', this.page === g.id);
      el('span', 'set__page-name', b, g.label);
      el('span', 'set__page-blurb', b, g.blurb);
      b.addEventListener('click', () => {
        this.page = g.id;
        this.render();
      });
    }
    const general = el('button', 'set__page', nav);
    general.classList.toggle('set__page--on', this.page === GENERAL);
    el('span', 'set__page-name', general, 'General');
    el('span', 'set__page-blurb', general, 'Lighting, FPS counter, aim, sound');
    general.addEventListener('click', () => {
      this.page = GENERAL;
      this.render();
    });

    // Main: the options of the page.
    const main = el('div', 'set__main', panel);
    if (this.page === GENERAL) this.generalPage(main, s);
    else for (const o of OPTIONS.filter((x) => x.group === this.page)) this.optionRow(main, o, s);
    main.scrollTop = scroll;

    const buttons = el('div', 'set__buttons', panel);
    el('span', 'set__note', buttons, 'Changes apply right away and are saved in this browser.');
    const reset = el('button', 'set__button', buttons, 'Reset to defaults');
    reset.addEventListener('click', () => this.change({ ...DEFAULT_SETTINGS }));
    const done = el('button', 'set__button set__button--primary', buttons, 'Close (Esc)');
    done.addEventListener('click', () => this.close());
  }

  /** "Measure my machine", and once measured "Recommend" and "Forget". */
  private measureButtons(parent: HTMLElement, s: Settings): void {
    if (!this.probe) return;
    const probe = this.probe;
    const go = el('button', 'set__preset set__measure', parent);
    go.textContent = this.measuring
      ? `Measuring ${this.measuring.done} / ${this.measuring.total}…`
      : this.measurement
        ? 'Measure again'
        : 'Measure my machine';
    go.disabled = this.measuring !== null;
    go.title =
      'Draws the frame on screen with every value of every option and times it. Takes about a minute and the picture flickers meanwhile. Effects that are not visible now (rain, ice, snow) measure as free.';
    go.addEventListener('click', () => {
      this.measuring = { done: 0, total: 1 };
      void measureAll(this.getSettings(), probe, (done, total) => {
        this.measuring = { done, total };
        this.render();
      }).then((m) => {
        this.measurement = m;
        saveMeasurement(m);
        this.measuring = null;
        this.render();
      });
      this.render();
    });
    if (this.measurement && !this.measuring) {
      const m = this.measurement;
      const rec = recommend(m, s);
      const best = el('button', 'set__preset', parent, `Recommend for 60 fps: ${rec}`);
      best.title =
        'Picks the heaviest preset the measurement predicts will hold 60 frames per second.';
      best.addEventListener('click', () => this.change({ ...PRESETS[rec], quality: rec }));
      const forget = el('button', 'set__preset set__forget', parent, 'Forget');
      forget.addEventListener('click', () => {
        this.measurement = null;
        saveMeasurement(null);
        this.render();
      });
    }
  }

  /** Three bars: how heavy the chosen options are (measured on this machine, or estimated). */
  private totals(parent: HTMLElement, s: Settings): void {
    const box = el('div', 'set__totals', parent);
    const bar = (name: string, share: number, text: string) => {
      const row = el('div', 'set__total', box);
      el('span', 'set__total-name', row, name);
      const track = el('span', 'set__track', row);
      const fill = el('span', `set__fill set__fill--${level(share)}`, track);
      fill.style.width = `${Math.round(Math.min(share, 1) * 100)}%`;
      el('span', 'set__total-text', row, text);
    };
    const t = totalCost(s);
    const m = this.measurement;
    if (m) {
      // Measured: a full bar is the whole 60 fps frame (16.7 ms).
      const p = predictMs(m, s);
      const slow = Math.max(p.cpuMs, p.gpuMs);
      bar('GPU', p.gpuMs / FRAME_60, `${p.gpuMs.toFixed(1)} ms`);
      bar('CPU', p.cpuMs / FRAME_60, `${p.cpuMs.toFixed(1)} ms`);
      bar('Video memory', t.vramShare, `about ${Math.round(t.vram)} MB`);
      const word = el('div', `set__verdict set__verdict--${level(slow / FRAME_60)}`, box);
      word.textContent = `About ${Math.round(1000 / slow)} fps — measured here on ${new Date(m.at).toLocaleDateString()}, with the scene on screen then`;
      return;
    }
    bar('GPU', t.gpuShare, `${Math.round(t.gpuShare * 100)}%`);
    bar('CPU', t.cpuShare, `${Math.round(t.cpuShare * 100)}%`);
    bar('Video memory', t.vramShare, `about ${Math.round(t.vram)} MB`);
    const word = el(
      'div',
      `set__verdict set__verdict--${level(Math.max(t.gpuShare, t.cpuShare))}`,
      box,
    );
    word.textContent = `${t.label} — estimated, by reasoning, not measured`;
  }

  private optionRow(parent: HTMLElement, o: GraphicsOption, s: Settings): void {
    const active = o.active ? o.active(s) : true;
    const row = el('div', 'set__option', parent);
    row.classList.toggle('set__option--off', !active);
    const text = el('div', 'set__option-text', row);
    el('div', 'set__option-label', text, o.label);
    el('div', 'set__option-help', text, o.help);
    if (!active) el('div', 'set__option-help', text, 'Has no effect with the current settings.');
    if (o.restart) el('div', 'set__option-help', text, 'Takes effect after reloading the page.');
    const side = el('div', 'set__option-side', row);
    if (o.slider) {
      const { min, max, step, format } = o.slider;
      const wrap = el('span', 'set__slider', side);
      const input = el('input', 'set__range', wrap);
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(s[o.key]);
      const shown = el('span', 'set__value', wrap, format(Number(input.value)));
      // Update the label while dragging; apply once released so a redraw doesn't drop the thumb.
      input.addEventListener('input', () => (shown.textContent = format(Number(input.value))));
      input.addEventListener('change', () => this.change({ [o.key]: Number(input.value) }));
    } else if (o.choices) {
      const select = el('select', 'set__control', side);
      for (const c of o.choices) {
        const option = el('option', '', select, c.label);
        option.value = String(c.value);
      }
      select.value = String(s[o.key]);
      select.disabled = !active;
      select.addEventListener('change', () => {
        const picked = o.choices!.find((c) => String(c.value) === select.value);
        if (picked) this.change({ [o.key]: picked.value });
      });
    }
    this.chips(side, costOfOption(o, s), o.note, this.measuredChip(o, s, active));
    if (o.restart) {
      const reload = el('button', 'set__button', side, 'Reload now');
      reload.addEventListener('click', () => location.reload());
    }
  }

  /** `GPU ▮▮▯▯▯  CPU ▮▯▯▯▯  64 MB` for the chosen value. */
  private measuredChip(
    o: GraphicsOption,
    s: Settings,
    active: boolean,
  ): { cpuMs: number; gpuMs: number } | null {
    if (!this.measurement || !active) return null;
    return measuredMs(this.measurement, o, s[o.key] as number | boolean);
  }

  private chips(
    parent: HTMLElement,
    c: Cost,
    note: string,
    measured: { cpuMs: number; gpuMs: number } | null,
  ): void {
    const box = el('div', 'set__chips', parent);
    box.title = measured ? `${note} (measured on this machine)` : note;
    if (measured) {
      for (const [name, ms] of [
        ['GPU', measured.gpuMs],
        ['CPU', measured.cpuMs],
      ] as const) {
        const bars = Math.min(5, Math.round(ms / MS_PER_BAR));
        const chip = el('span', `set__chip set__chip--${level(bars / 5)}`, box);
        el('span', 'set__chip-name', chip, name);
        el('span', 'set__chip-bars', chip, '▮'.repeat(bars) + '▯'.repeat(5 - bars));
        el('span', 'set__chip-ms', chip, `+${ms.toFixed(1)} ms`);
      }
      if (c.vram > 0) el('span', 'set__chip set__chip--vram', box, `${c.vram} MB`);
      return;
    }

    for (const [name, n] of [
      ['GPU', c.gpu],
      ['CPU', c.cpu],
    ] as const) {
      const chip = el('span', `set__chip set__chip--${level(n / 5)}`, box);
      el('span', 'set__chip-name', chip, name);
      el('span', 'set__chip-bars', chip, '▮'.repeat(n) + '▯'.repeat(5 - n));
    }
    if (c.vram > 0) el('span', 'set__chip set__chip--vram', box, `${c.vram} MB`);
  }

  private generalPage(parent: HTMLElement, s: Settings): void {
    const row = (label: string, help: string, build: (side: HTMLElement) => void) => {
      const r = el('div', 'set__option', parent);
      const text = el('div', 'set__option-text', r);
      el('div', 'set__option-label', text, label);
      el('div', 'set__option-help', text, help);
      build(el('div', 'set__option-side', r));
    };
    row('Lighting (L)', 'Normal light, or a dim world with a flashlight per soldier.', (side) => {
      const select = el('select', 'set__control', side);
      for (const [v, t] of [
        ['normal', 'Normal'],
        ['dark', 'Dark, with flashlights'],
      ]) {
        const o = el('option', '', select, t);
        o.value = v!;
      }
      select.value = s.darkMode ? 'dark' : 'normal';
      select.addEventListener('change', () => this.change({ darkMode: select.value === 'dark' }));
    });
    const check = (label: string, help: string, value: boolean, pick: (v: boolean) => void) =>
      row(label, help, (side) => {
        const box = el('input', 'set__check', side);
        box.type = 'checkbox';
        box.checked = value;
        box.addEventListener('change', () => pick(box.checked));
      });
    check('Show FPS (F3)', 'A small frame-rate counter in the corner.', s.showFps, (v) =>
      this.change({ showFps: v }),
    );
    check(
      'Aim: click to toggle',
      'Off: hold the right button to aim. On: one click aims, another stops.',
      s.aimToggle,
      (v) => this.change({ aimToggle: v }),
    );
    row('Volume', 'Sound effects.', (side) => {
      const wrap = el('span', 'set__slider', side);
      const input = el('input', 'set__range', wrap);
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(s.volume);
      const shown = el('span', 'set__value', wrap, `${Math.round(s.volume * 100)}%`);
      input.addEventListener(
        'input',
        () => (shown.textContent = `${Math.round(Number(input.value) * 100)}%`),
      );
      input.addEventListener('change', () => this.change({ volume: Number(input.value) }));
    });
  }
}

/** Colour band of a 0 to 1 weight. */
function level(share: number): 'low' | 'mid' | 'high' {
  return share < 0.34 ? 'low' : share < 0.67 ? 'mid' : 'high';
}
