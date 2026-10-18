/** Public API of the pure simulation (no Three.js, no DOM). */
export * from './constants';
export * from './vec';
export * from './rng';
export * from './config';
export * from './collision';
export * from './terrain';
export * from './types';
export { firstPlayerOf, isHostile, localPlayer } from './players';
export { createGame, step } from './game';
export {
  controlSoldier,
  getSoldier,
  livingSoldiers,
  orderFollow,
  orderHold,
  orderMove,
} from './soldiers';
export { bossStats, spawnZombie } from './zombies';
export {
  ARMOR_PLATE,
  addToBackpack,
  backpackFull,
  equipFromBackpack,
  getCrate,
  itemDef,
  moveItem,
  nearestCrate,
  stashInCrate,
  takeFromCrate,
  unequipSlot,
  useItem,
} from './inventory';
export { gunOf, skillLevel, weaponDef, type WeaponDef } from './stats';
export { baseMods, buyItem, choosePerk, maxHealthOf, shopAvailable, shopCost } from './upgrades';
export type { Slot, SlotRef } from './inventory';
export { levelInfo, type LevelInfo } from './loot';
export { waveSize } from './waves';
export { getVehicle, toggleVehicle, vehicleInReach } from './vehicles';
export { objectiveProgress } from './objectives';
