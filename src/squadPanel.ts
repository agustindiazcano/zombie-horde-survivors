import { levelInfo, type GameConfig, type GameState } from './sim';

interface Bars {
  hp: HTMLElement;
  xp: HTMLElement;
  stamina: HTMLElement;
  chip: HTMLElement;
}

/**
 * List of squad icons: health, own XP and stamina bars, selection state, click to pick.
 * The chips are rebuilt only when the squad's structure changes; the bars update in place so
 * a click is never lost to a redraw.
 */
export class SquadPanel {
  private readonly root = document.createElement('div');
  private signature = '';
  private bars = new Map<number, Bars>();

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    private readonly onPick: (id: number, additive: boolean) => void,
  ) {
    this.root.className = 'squad';
    parent.appendChild(this.root);
  }

  update(state: GameState, selected: ReadonlySet<number>, maxHealth: number): void {
    const sig = state.soldiers
      .map(
        (s) =>
          `${s.id}:${s.dead ? 1 : 0}:${selected.has(s.id) ? 1 : 0}:${
            s.id === state.controlledId ? 1 : 0
          }:${s.order.type}:${s.winded ? 1 : 0}`,
      )
      .join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      this.rebuild(state, selected);
    }

    for (const s of state.soldiers) {
      const b = this.bars.get(s.id);
      if (!b) continue;
      const drone = s.kind === 'drone';
      const info = levelInfo(s.xp, this.config);
      b.hp.style.width = `${(s.health / maxHealth) * 100}%`;
      b.xp.style.width = `${(info.into / info.needed) * 100}%`;
      b.stamina.style.width = drone
        ? '100%'
        : `${(s.stamina / this.config.stance.staminaMax) * 100}%`;
    }
  }

  private rebuild(state: GameState, selected: ReadonlySet<number>): void {
    this.root.replaceChildren();
    this.bars.clear();
    for (const s of state.soldiers) {
      const chip = document.createElement('button');
      chip.className = 'squad__chip';
      if (s.dead) chip.classList.add('squad__chip--dead');
      if (selected.has(s.id)) chip.classList.add('squad__chip--selected');
      if (s.id === state.controlledId) chip.classList.add('squad__chip--controlled');
      if (s.winded) chip.classList.add('squad__chip--winded');
      chip.title = `${s.kind === 'drone' ? 'Drone' : 'Soldier'} ${s.id} (${s.order.type})`;
      // Keep focus off the chip so Space (jump) never "presses" it.
      chip.addEventListener('mousedown', (e) => e.preventDefault());
      chip.addEventListener('click', (e) => this.onPick(s.id, e.shiftKey));

      const label = document.createElement('span');
      label.textContent = s.kind === 'drone' ? `${s.id} ◈` : String(s.id);
      chip.appendChild(label);
      const hp = this.bar(chip, 'squad__fill');
      const xp = this.bar(chip, 'squad__fill squad__fill--xp');
      const stamina = this.bar(chip, 'squad__fill squad__fill--stamina');
      this.bars.set(s.id, { hp, xp, stamina, chip });
      this.root.appendChild(chip);
    }
  }

  private bar(chip: HTMLElement, fillClass: string): HTMLElement {
    const bar = document.createElement('span');
    bar.className = 'squad__bar';
    const fill = document.createElement('span');
    fill.className = fillClass;
    bar.appendChild(fill);
    chip.appendChild(bar);
    return fill;
  }
}
