/** Public API of the pure simulation (no Three.js, no DOM). */
export * from './constants';
export * from './vec';
export * from './rng';
export * from './config';
export * from './collision';
export * from './types';
export { createGame, step } from './game';
export {
  controlSoldier,
  getSoldier,
  livingSoldiers,
  orderFollow,
  orderHold,
  orderMove,
} from './soldiers';
export { spawnZombie } from './zombies';
export {
  backpackFull,
  equipFromBackpack,
  getCrate,
  nearestCrate,
  stashInCrate,
  takeFromCrate,
} from './inventory';
export { weaponDef, type WeaponDef } from './stats';
export { baseMods, buyItem, choosePerk, maxHealthOf, shopAvailable, shopCost } from './upgrades';
export { levelInfo, type LevelInfo } from './loot';
export { waveSize } from './waves';
