# 2026-10-20 — Machine-gun nest, watchtower and turret ammo

Branch `feat/posts-and-ammo` (from `feat/doors-v2`).

## Posts (nest and tower)

- Structure types `nest` (150 gold, 11 damage at 9 shots/s, range 26) and `tower` (220 gold, 4.2 m tall, 28 damage at 1.6 shots/s, range 38, shoots over cover) have a `post` block in `data/game.json`: one seat each.
- A soldier climbs in with **E** or **V** (or an RTS click on **Man**; the AI walks there and does it), stands on top of the structure and fires the mounted gun: the soldier under direct control aims with the mouse (the enemy nearest the cursor, within 8 m of it) and fires with the button; an AI soldier shoots what it sees. The kills and the XP go to the crew member. **E** / **V** again climbs out where it climbed in.
- The crew is out of play like a vehicle passenger (`inShelter`, `src/sim/shelter.ts`): enemies do not target it, fire and blasts do not hurt it. Enemies only reach it by destroying the structure, which drops the crew. An AI soldier in a post leaves as soon as it gets any order but `hold` (entering sets `hold`).
- Code: `src/sim/posts.ts` (`enterPost`, `leavePost`, `togglePost`, `updatePosted`), `pickTarget` / `fireStructure` in `structures.ts` (the turrets use them too).

## Ammo

- `ammo: { capacity, item }` on a structure type (turret 300 x `ammo_556`, smart turret 600 x `ammo_belt`, nest 500 x `ammo_belt`, tower 160 x `ammo_556`). Every shot spends a round; at zero it stops firing (a decoy) and a notice says so.
- Refill with gold from the build panel (**Refill**, `structures.ammoCost` 0.2 gold per round) or by hand: **E** next to it (label **Resupply**) moves rounds from the unit's backpack stacks of that ammo into it.
- Map 2 now starts with a nest and a tower.

## Checked

A throwaway sim (deleted): the nest and the tower take one crew member each; the tower crew stands at 4.2 m; a zombie out of the other turret's range dies to the posts, the kills are credited to the crew and rounds are spent; zombies leave the crew alone; a move order makes the AI climb out; resupply moves 100 rounds; destroying the tower drops its crew. The 48 tests, lint, format, typecheck, build and the asset check pass. Not seen in a browser (the crew standing on top of the box, the barrel, tower look).

## Limits

- The AI never mans a post, loads one or buys ammo on its own; an unmanned nest does nothing.
- No arc limit or turning delay for the nest (the plan allowed one); the tower has no extra sight on the radar.
- Zombies ignore a crew member, so they only attack a post that blocks their way.
