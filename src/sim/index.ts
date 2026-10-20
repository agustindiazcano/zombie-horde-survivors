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
  isSquadUnit,
  livingSoldiers,
  orderBoard,
  orderFollow,
  orderHold,
  orderMove,
} from './soldiers';
export { bossStats, spawnZombie } from './zombies';
export {
  ARMOR_PLATE,
  addToBackpack,
  backpackFull,
  cellAt,
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
export { aimErrorOf, aimZoomOf } from './accuracy';
export { fitAccessory, removeAccessory, reportOf, type WeaponReport } from './accessories';
export { modsOf } from './accessoryMods';
export { ammoLabel, gunState, magazineOf, reserveOf, startReload } from './ammo';
export { handState, newWeaponState } from './weaponState';
export { baseMods, buyItem, choosePerk, maxHealthOf, shopAvailable, shopCost } from './upgrades';
export type { Slot, SlotRef } from './inventory';
export { levelInfo, type LevelInfo } from './loot';
export { waveSize } from './waves';
export { toggleDrag } from './drag';
export { grenadeAim, grenadeCount, throwGrenade } from './grenades';
export { meleeStrike } from './melee';
export { updateHazards } from './hazards';
export { getVehicle, toggleVehicle, vehicleInReach } from './vehicles';
export { objectiveProgress } from './objectives';
export { getObject, liftOrDrop, maxLift, objectDef, throwCarried } from './objects';
export {
  doorInReach,
  edgeDistance,
  footprint,
  getStructure,
  levelScale,
  orderBuild,
  placeStructure,
  placementError,
  removeStructure,
  repairCost,
  repairStructure,
  structureDef,
  toggleDoor,
  upgradeCost,
  upgradeStructure,
} from './structures';
