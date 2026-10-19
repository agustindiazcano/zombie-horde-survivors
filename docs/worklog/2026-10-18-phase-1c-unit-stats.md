# 2026-10-18 — Phase 1c: unit stat sheets

Branch `feat/unit-stats`, cut from `feat/map-format` (phases 1 and 1b are not merged yet, so this PR must go after them). The game plays as before; the 48 tests and every static check pass.

- `data/units.json` + `UnitsSchema` (strict zod): the attribute names (`strength`, `dexterity`, `constitution`, `perception`, `intelligence`, `charisma`, a proposal the user can rename), the weapon-skill curve (`xpPerLevel` 100, `growth` 1.5) and one sheet per unit type (`soldier`, `drone`: name, family, attributes). Every sheet must define exactly the listed attributes. Enemies are not in the file yet.
- Weapon classes (`melee`, `pistol`, `shotgun`, `rifle`, `sniper`, `machinegun`, `launcher`): every weapon in `game.json` has a `class` (pistol, rifle, heavy_mg = machinegun; the drone gun reads `drone.weaponClass`).
- Each unit has `unitType`, `attributes` (a copy of its sheet) and `skills` (XP per class). A killing shot adds the enemy's XP reward to the class of the weapon used (kills only, not hits). `skillLevel` in `src/sim/stats.ts` turns XP into a level.
- `parseConfig(raw, map, units)`; `GameConfig.units` holds the sheets.
- The unit window of the squad screen shows the attributes ("not active yet") and the weapon skills that have XP ("no effect yet").
- Vitals (health, speed, stamina) still come from `game.json`; the sheet does not duplicate them yet. Attributes and skill levels change nothing in the game.
