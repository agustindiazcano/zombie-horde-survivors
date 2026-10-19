import type { GameState, Player } from './types';

/** The human player at this keyboard (the one whose control state the UI shows). */
export const localPlayer = (state: GameState): Player =>
  state.players.find((p) => p.id === state.localPlayerId) as Player;

/** The first player of a kind; the map validation guarantees a human and an AI in waves mode. */
export const firstPlayerOf = (players: readonly { id: string; kind: string }[], kind: string) =>
  players.find((p) => p.kind === kind)?.id ?? '';

/** Two players are hostile when they are on different teams. */
export function isHostile(state: GameState, a: string, b: string): boolean {
  const pa = state.players.find((p) => p.id === a);
  const pb = state.players.find((p) => p.id === b);
  return !!pa && !!pb && pa.team !== pb.team;
}
