# 2026-10-19: interaction lab, soldier training, menu carousel

Branch `feat/build-mode`. Nothing was seen in a browser by Claude.

## Interaction lab (Map 5)

| Piece               | Where                                               | Notes                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objects             | `objects` in `data/game.json`, `src/sim/objects.ts` | wooden crate (18 kg, flammable), steel barrel (30), fuel barrel (bursts into fires when shot or burnt), explosive barrel (blast radius 6, damage 160), boulder (70)                                                                                                           |
| Lift and throw      | key **H**, left click                               | needs `strength x 4` kilos (`objects.liftPerStrength`); walking slows with the load; a throw flies shorter the heavier it is, hurts and staggers what it lands on; the object takes impact damage and breaks                                                                  |
| Carry a body        | **H** next to a downed or dead ally                 | needs strength 18; the body rides on the shoulders; **G** (drag) still exists and needs no strength                                                                                                                                                                           |
| Fire                | `hazards.fire` in `game.json`, `src/sim/hazards.ts` | fires are now state (`state.fires`): bare-ground fires die after 8 s, a fire on a thing burns until it is gone; every 1.5 s a fire may light flammable objects and wooden structures within 3.2 m; map fires burn for ever but still spread                                   |
| Shooting containers | `weapon.ts`                                         | bullets hit fuel and explosive barrels; blasts set off the barrels near them (chain)                                                                                                                                                                                          |
| Map 5               | `data/maps/map-5.json`                              | no waves, 1,000 gold; Strong (STR 22) and Average marines, two patients on the floor that never bleed out; a yard of objects from light to heavy; a row of crates leading from a fire pit to a fuel barrel and an explosive barrel; sleeping marines behind explosive barrels |
| Map rules           | `mapLogic.objects`, `mapUnit.downed`                |                                                                                                                                                                                                                                                                               |

## Soldier training

Each soldier level (kills) gives skill points (`training.pointsPerLevel`). The squad screen window shows a **Training** box: attributes (+1 each, up to 30), weapon expertise per class (+1 skill level each, up to 8), and one class (Assault, Engineer, Medic, Demolitions) with three perks of three ranks. Everything is data in `training` of `game.json`; effects are fractions per attribute point above 10 or per perk rank, added by `bonus()` in `src/sim/training.ts`.

Active stats: health and stamina (constitution), melee (strength), accuracy and reload (dexterity), range (perception), build speed and medical heal (intelligence); classes add damage, fire rate, recoil, build speed, cheaper repairs (squad-wide), reload, faster revives, stronger kits, a healing aura, grenade damage, blast radius and throw range. Charisma has no effect yet. Points are not spent by the AI.

## Menu

The title screen shows a carousel of five slides (squad, horde, how to play, build and fight, training) that moves on by itself every 7 s.

## Checked

Lint, format, typecheck, build and the 48 tests pass. Throwaway headless tests (deleted by decision) checked: lifting needs strength, a boulder flies and lands, a body rides with its carrier, fire spreads along the crates and the explosive barrel goes off, points are spent and a perk raises damage.

## Not built

Objects do not block movement; AI soldiers never lift or throw; no models or sounds for objects; objects in the editor; the training panel on mobile; respec; charisma.
