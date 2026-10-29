# 2026-10-28 — New gear models, helmets and the playable alien (branch `feat/gear-models`)

The user dropped seven models in the repo root and asked to add them to the game.

| Model (file in `public/models/`) | Item / unit                                                                     | License                          |
| -------------------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| `weapon-beretta-apx.glb`         | `pistol` (now "Beretta APX"), replaces the box pistol in third and first person | Sketchfab Standard (not allowed) |
| `weapon-beretta-pmx.glb`         | `smg` (new weapon, "Beretta PMX", two-handed, class rifle, infinite spare ammo) | Sketchfab Standard (not allowed) |
| `helmet-generic.glb`             | `helmet_generic` ("Combat helmet")                                              | CC-BY-4.0                        |
| `helmet-esmad.glb`               | `helmet_esmad`                                                                  | CC-BY-4.0                        |
| `helmet-security-guard.glb`      | `helmet_security`                                                               | CC-BY-4.0                        |
| `helmet-tactical.glb`            | `helmet_tactical`                                                               | CC-BY-NC-ND-4.0 (not allowed)    |
| `soldier-alien-monster.glb`      | unit `alien_monster` (playable, soldier slot 1)                                 | CC-BY-4.0                        |

What was built:

- **Head slot:** `Equipment.head` and the new item type `helmet` (`data/items.json`, schema in `config.ts`). It works in the squad screen (drag and drop, Equip / Unequip), the crate window, the editor's unit dialog (Armor tab) and map loadouts. A helmet has no protection yet: it only changes the look.
- **Gear models:** `data/characters.json` has a new `gear` section (model, `size` in metres, `rotation`, `anchor` as box fractions, `offset`). `src/render/gearModels.ts` fits each model, `createWeaponModel` uses it first (so the first-person view shows it too), and `createHeadWear` in `assetLoader.ts` parents a helmet to the head bone (`CharacterView.wear`). The squad screen's 3D viewer now shows the held weapon and the helmet (`MenuModel.dress`).
- **Alien monster:** second entry of `soldiers` in `characters.json` (one clip, `ArmatureAction`, used for idle, walk, run and attack; it falls over when it dies because it has no death clip). The marines now have `model: 0` in `units.json` and the fallback for a unit without a model is slot 0 (it used to be `id - 1`, which would have turned soldier 2 into the alien). The alien has no hand bone, so it fights bare (`rightHand: null` in the map).
- **Map 16 - Gear test** (`data/maps/map-16.json`, made by `scripts/gen-map16.py`): four marines, each with a different helmet in the backpack (Marine 4 carries the SMG), and the alien. Waves are off. Open it from Development, or in the editor.
- **License guard:** `assets.toml` has a `[[testing_asset]]` section for models whose license is not allowed; `npm run check:assets` lists them as a warning instead of failing.

Seen in a headless Chrome only (the squad screen, the helmet and the pistol in the squad viewer, the top-down game, the alien); first person was not seen. Helmet and gun placement was tuned by eye from screenshots: if something sits wrong, change `gear` in `data/characters.json` (no code).
