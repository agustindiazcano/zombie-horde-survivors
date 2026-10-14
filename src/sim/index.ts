/** Public API of the pure simulation (no Three.js, no DOM). */
export * from './constants';
export * from './vec';
export * from './rng';
export * from './config';
export * from './collision';
export * from './types';
export { createGame, step } from './game';
export { controlSoldier, getSoldier, livingSoldiers, orderFollow, orderMove } from './soldiers';
export { spawnZombie } from './zombies';
export { waveSize } from './waves';
