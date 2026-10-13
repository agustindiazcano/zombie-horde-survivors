import { resolveStatic } from './collision';
import type { GameConfig } from './config';
import type { GameState, Input } from './types';

export function updatePlayer(state: GameState, config: GameConfig, input: Input, dt: number): void {
  const p = state.player;
  const { move, aim } = input;

  // Normalize only when above unit length so analog input keeps its magnitude.
  const l = Math.hypot(move.x, move.z);
  const k = l > 1 ? 1 / l : 1;
  p.pos.x += move.x * k * config.player.speed * dt;
  p.pos.z += move.z * k * config.player.speed * dt;
  resolveStatic(p.pos, config.player.radius, config.arena);

  const dx = aim.x - p.pos.x;
  const dz = aim.z - p.pos.z;
  if (dx * dx + dz * dz > 1e-9) p.facing = Math.atan2(dx, dz);

  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
}
