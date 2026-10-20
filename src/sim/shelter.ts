import type { Soldier } from './types';

/**
 * A soldier out of play for the horde and the blasts: inside a vehicle, or manning a post (a
 * machine-gun nest or a watchtower). It cannot be walked into, bitten or burnt.
 */
export const inShelter = (s: Soldier): boolean => s.vehicleId !== null || s.post !== null;
