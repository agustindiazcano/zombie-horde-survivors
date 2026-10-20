# 2026-10-20 — Structures, objects and loose items in the map editor

Branch `feat/editor-structures` (from `feat/posts-and-ammo`).

- The **Assets** tab of the map editor now ends with three groups made from the game data: **Structures (built from the start)** (every `structures.types` entry: walls, doors of all kinds, switch, turrets, nest, tower), **Objects** (`objects.types`) and **Loose items** (every non-innate item of `data/items.json`, keycards included).
- They are stored in the map's rules (`logic.structures`, `logic.objects`, `logic.items`), the lists the sim already starts a run from. Click the map to place (0.5 m grid), select, box-select, drag, **R** or R + right-drag to turn a structure by quarter turns, Ctrl+C / V, Delete, undo / redo: the same as for units and props.
- With exactly one door or switch selected a small box under the info line sets its **link** (switches and powered doors with the same number belong together), **starts open / on** and, for a door, the **key** it is locked with.
- An edit of these lists reloads the preview (like moving a unit), so the structures, objects and items show built in the editor; **Play** runs the map with them.
- Code: `LOGIC_LISTS`, `logicList`, `withLogicList` and `renderProps` in `src/editor.ts`.

Checked: typecheck, lint, format, the 48 tests, build and asset check. The editor has no tests and Claude has no browser, so none of it was run: the user has to try placing a door, locking it, and Play. Possible rough edges: the click radius for loose items (`LOOSE_PICK`), the selection ring size of big gates, the properties box layout.

Limits: no validation of overlaps or of a lock whose key is nowhere on the map; `count` of a loose item is always 1; objects and items cannot be turned.
