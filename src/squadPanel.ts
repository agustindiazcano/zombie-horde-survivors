import type { GameState } from './sim';

/** Bottom-centre list of soldiers: health, selection state, click to select. */
export class SquadPanel {
  private readonly root = document.createElement('div');
  private signature = '';

  constructor(
    parent: HTMLElement,
    private readonly onPick: (id: number, additive: boolean) => void,
  ) {
    this.root.className = 'squad';
    parent.appendChild(this.root);
  }

  update(state: GameState, selected: ReadonlySet<number>, maxHealth: number): void {
    const sig = state.soldiers
      .map(
        (s) =>
          `${s.id}:${Math.ceil(s.health)}:${s.dead ? 1 : 0}:${selected.has(s.id) ? 1 : 0}:${
            s.id === state.controlledId ? 1 : 0
          }:${s.order.type}`,
      )
      .join('|');
    if (sig === this.signature) return;
    this.signature = sig;

    this.root.replaceChildren();
    for (const s of state.soldiers) {
      const chip = document.createElement('button');
      chip.className = 'squad__chip';
      if (s.dead) chip.classList.add('squad__chip--dead');
      if (selected.has(s.id)) chip.classList.add('squad__chip--selected');
      if (s.id === state.controlledId) chip.classList.add('squad__chip--controlled');
      chip.title = `${s.kind === 'drone' ? 'Drone' : 'Soldier'} ${s.id} (${s.order.type})`;
      chip.addEventListener('click', (e) => this.onPick(s.id, e.shiftKey));

      const label = document.createElement('span');
      label.textContent = s.kind === 'drone' ? `${s.id} ◈` : String(s.id);
      const bar = document.createElement('span');
      bar.className = 'squad__bar';
      const fill = document.createElement('span');
      fill.className = 'squad__fill';
      fill.style.width = `${(s.health / maxHealth) * 100}%`;
      bar.appendChild(fill);
      chip.append(label, bar);
      this.root.appendChild(chip);
    }
  }
}
