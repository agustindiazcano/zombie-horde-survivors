import type { GameConfig, Objective } from './config';
import type { GameState } from './types';

/** Progress of one objective as `[current, target]`; reaching a spot is 0 / 1. */
export function objectiveProgress(
  state: GameState,
  objective: Objective,
): readonly [number, number] {
  switch (objective.kind) {
    case 'kills':
      return [Math.min(state.kills, objective.count), objective.count];
    case 'boss':
      return [Math.min(state.bossKills, objective.count), objective.count];
    case 'survive': {
      const cleared =
        state.wave > objective.wave || (state.wave === objective.wave && waveClear(state));
      return [cleared ? objective.wave : Math.min(state.wave, objective.wave - 1), objective.wave];
    }
    case 'reach': {
      const near = state.soldiers.some(
        (s) =>
          !s.dead &&
          !s.downed &&
          s.kind !== 'drone' &&
          Math.hypot(s.pos.x - objective.x, s.pos.z - objective.z) <= objective.radius,
      );
      return [near ? 1 : 0, 1];
    }
  }
}

const waveClear = (state: GameState): boolean => state.spawner.phase === 'intermission';

/** Marks objectives as done and wins the mission once all of them are. */
export function updateObjectives(state: GameState, config: GameConfig): void {
  if (config.objectives.length === 0) return;
  config.objectives.forEach((objective, i) => {
    if (state.objectivesDone[i]) return;
    const [now, target] = objectiveProgress(state, objective);
    if (now < target) return;
    state.objectivesDone[i] = true;
    state.events.push({ type: 'objectiveDone', index: i });
  });
  if (state.objectivesDone.every(Boolean)) {
    state.status = 'victory';
    state.events.push({ type: 'victory' });
  }
}
