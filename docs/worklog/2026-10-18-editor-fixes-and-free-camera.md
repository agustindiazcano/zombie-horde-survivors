# 2026-10-18 — Editor fixes, multi-select and a freer camera

On `feat/story-mode` (on top of phase 10). 48 tests and all checks pass; nothing seen in a browser.

- **Bug: "Testing the map" bar covered the buttons and Stop did nothing.** The `--hidden` rules in `editor.css` came before the `display: flex` rules of the same elements and lost the cascade, so the Stop bar (and the Play-mode panel) were always visible. The hidden rules now come last. (The bug dates from phase 3; fixed here instead of rebasing the stack.)
- **WASD in the editor:** loading a map starts a run with a soldier under control, so the RTS pan did not run. The frame loop now pans whenever the editor is editing.
- **New map dialog:** size (20–200 m per side) and ground texture; `blankMap(size, texture)`.
- **Multi-select:** drag a box on empty ground to select every unit and prop inside (Shift adds, Shift-click toggles). Ctrl+C / Ctrl+V copy and paste the whole selection (+2 m each paste), Delete/Backspace remove it, R turns it.
- **Right button on a selected item:** drag moves the selection; Shift + drag rotates the group around its centre (quarter steps when it contains props). Right-drag anywhere else still orbits the camera (`CameraControls` takes a `blocked` callback).
- **Camera:** tilt from -0.6 rad (looking up at the sky) to 1.5; zoom range 0.04x–6x; camera far plane 600; the camera keeps 0.8 m of height when tilted up.
- Not done: the sky is still a flat colour; box selection tests the item centre only; the camera pan limit stays the map edge.
