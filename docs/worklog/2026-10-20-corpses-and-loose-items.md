# 2026-10-20 — Corpses, loose items and AI that drags the wounded

Branch `feat/corpses-and-loose-items` (from `feat/objects-block-movement`). The rest of 8b.

- **Corpses.** A dead enemy stays on the ground (`zombie.corpseLife` 45 s, at most `zombie.maxCorpses` 24, the oldest go first); a burst one is gone at once. They are not solid and bullets pass through. The renderer stops animating a body once it has settled. Dragging one (**E**, or a click in RTS; label **Drag**) keeps it fresh and uses the same rope and slowness as dragging an ally (`Soldier.dragCorpse`, `toggleDragCorpse` in `src/sim/drag.ts`). A corpse loses to any other thing in reach (0.8 m penalty in `interact.ts`).
- **Loose items.** `state.groundItems`: **Drop** on a slot of the squad screen lays the whole stack in front of the unit (`dropToGround`), **E** or a click in RTS takes it (`pickUpItem`, label **Take**; a stack that does not fit leaves the rest). At most `drops.maxLoose` (40), drawn as small coloured slabs by item type (`src/render/groundItems.ts`). Not saved in maps and not in the editor yet.
- **AI drags the wounded.** A follow-order soldier whose downed ally has an enemy within `drag.dangerRadius` (9 m), when nobody on their feet carries a medkit, walks to the closest such ally (only the closest soldier goes), grabs it and backs away from the nearest enemy until none is within 1.5x that radius, then lets go (`src/sim/rescueDrag.ts`). It drags (half speed, one-handed gun) instead of carrying on the shoulders, because a carrier cannot shoot.
- Test change: the "removed after the death duration" test now sets `maxCorpses: 0`; the other 47 are untouched.

Checked with a throwaway sim (deleted): the corpse survives the death animation, trails a dragger and expires; drop then **E** returns a stack and a rifle; the AI pulls a downed ally away from a zombie. Not seen in a browser.

Limits: corpses are not carried on the shoulders and do not block anything; the AI never drops or picks up items; loose items do not exist in the map format; the AI drags straight away from the enemy without pathing.
