# 2026-10-19 — Weapons in the hand of the models

Same branch as W1 to W5 (`feat/weapon-instances`, not merged). All checks pass; nothing seen in a browser.

- **What:** a soldier now shows the weapon it holds (right hand, else left): pistol, rifle, heavy machine gun and knife. Nothing is drawn for fists, the drone gun (the drone has no hand) or a downed or dead soldier.
- **Meshes:** `src/render/weaponModels.ts` builds each one from boxes in metres (grip at the origin, muzzle towards +Z); no third-party assets, so no credits needed.
- **Attachment:** `createHolder` in `src/render/assetLoader.ts` parents a group to the rig's `RightHand` bone (found by name with or without the colon), cancels the bone's world scale and turns the barrel along the bone. `CharacterView.hold?(item)` is the interface; `gameRenderer.ts` calls it every frame.
- **To tune once seen:** `GRIP_OFFSET` and `GRIP_ROLL` in `assetLoader.ts` (position along the hand and twist of the weapon), and the dimensions in `weaponModels.ts`. The bone's axes and scale were guessed, not seen.
- **Not done:** the left hand never holds a second gun in view, no two-hand pose for rifles (the arm animation is the plain idle / run), no muzzle flash at the barrel (shots still start at the unit), the squad-screen 3D previews and the menu viewer show no weapon.
