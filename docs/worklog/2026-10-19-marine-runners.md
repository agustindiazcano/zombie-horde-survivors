# 2026-10-19 — Two more marine zombies: runner and fast walker

Same branch as W1 to W6 (`feat/weapon-instances`, not merged). All checks pass; **nothing seen in a browser**.

- **`marine_runner`** (a normal runner, no hops): the marine's `Running` clip, speed x1.8, health x0.6, damage x0.8, a pale yellow-green tint (`#c9cf8a`), weight 3 from wave 2.
- **`marine_fast`** (the green infected marine, only quicker): `Unsteady_Walk` played 1.7x faster (`clipSpeed` in `data/characters.json`, new optional field applied to the walk and run clips by `AnimationController`), speed x1.4, health x0.9, weight 4 from wave 2.
- Both are in the wave mix by data, in the editor's Units > Enemies and as spawners (`data/catalog.json`). Both use the light marine.
- **To tune after playing:** speeds, weights and `clipSpeed` (feet may slide if the clip does not match the real speed).
