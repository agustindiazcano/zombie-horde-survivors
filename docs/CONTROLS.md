# Controls

The single reference for every key and mouse action in the game, the menus and the map editor. The README and CLAUDE.md link here instead of repeating it.

**Rule:** whenever a key or mouse action is added, moved or removed, change this file in the same commit. Nothing else in the repo lists controls.

## Direct control

You control one soldier; the rest of the squad follows and shoots on its own.

| Key / mouse       | Action                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| W / A / S / D     | Move (relative to where the camera looks)                                                                           |
| Mouse             | Aim (see _Views_ below)                                                                                             |
| Left click (hold) | Fire                                                                                                                |
| Ctrl (or **C**)   | The whole squad crouches: tighter spread, +10% damage, half speed                                                   |
| Shift             | The whole squad sprints (1.6x speed) while it has stamina; each unit tires on its own, then recovers                |
| Space             | Jump (only the soldier you control); walking into a box, it vaults up onto it (30 stamina)                          |
| Q                 | Throw a grenade at the aim point (the cursor in top-down, the crosshair in third / first person)                    |
| G                 | Grab a downed or dead ally next to you and drag it (half speed, one-handed guns only); press again to let go        |
| E                 | Next to a crate (a yellow **E** floats above it): open it                                                           |
| V                 | Next to a vehicle (a **V** floats above it): climb in; inside, step out (the driver leaving takes the crew out too) |
| T                 | Change view: normal → third person → first person → normal                                                          |
| Y                 | Go back to RTS mode                                                                                                 |
| Mouse wheel       | Zoom (normal and third-person views)                                                                                |
| Right-drag        | Rotate and tilt the camera (normal view only)                                                                       |

Ctrl+W closes the browser tab and the browser won't let a page block it, so **C** is provided as an alternative way to crouch.

In a vehicle the driver steers with W / A / S / D and passengers keep shooting; zombies bite the hull.

## Views (T)

| View                  | Camera                               | Aiming                                                                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Normal** (top-down) | Above and behind, follows the unit   | The soldier aims at the cursor on the ground. Wheel zooms, right-drag rotates / tilts.           |
| **Third person**      | Over the shoulder, a bit above       | The mouse turns the view 1:1 and instantly; the crosshair in the centre is the aim. Wheel zooms. |
| **First person**      | At the soldier's eyes (model hidden) | Same as third person; the camera lowers when crouching and rises when jumping.                   |

In third and first person the cursor is locked (so you can keep turning) and W / A / S / D move relative to where you look. **Esc** releases the cursor and goes back to the normal view. The view also returns to normal if you switch to RTS mode, the controlled soldier dies, or the game ends.

## RTS mode

| Key / mouse              | Action                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| W / A / S / D            | Pan the camera                                                                                                                        |
| Left click               | Select a soldier                                                                                                                      |
| Left-drag                | Box select (hold **Shift** to add to the selection)                                                                                   |
| Right click              | Send the selected units to that point, or into a vehicle with a free seat (a right _drag_ rotates the camera instead)                 |
| F                        | Selected units follow the controlled soldier again                                                                                    |
| G                        | Aim a grenade: an arc and the blast zone follow the cursor, click throws it (Shift+click keeps aiming; G / Esc / right-click cancels) |
| E                        | Select all                                                                                                                            |
| 1 – 9                    | Select a unit by number (Shift adds)                                                                                                  |
| Squad panel (bottom)     | Click a unit to select it; shows each unit's health                                                                                   |
| V                        | Selected units climb into / step out of the closest vehicle                                                                           |
| Y                        | Take direct control of the first selected unit                                                                                        |
| Mouse wheel / right-drag | Zoom / rotate and tilt the camera                                                                                                     |

When you take control with **Y**, only the units that were selected follow you. The rest hold their position (or keep their move order). Every uncontrolled unit shoots the nearest enemy it can see.

## Anywhere in a run

| Key         | Action                                                                        |
| ----------- | ----------------------------------------------------------------------------- |
| P / Esc / I | Pause / resume and show the squad screen (bonuses, stats, units, inventories) |
| B           | Open / close the shop (only between waves)                                    |
| O           | Settings (graphics, lighting, FPS counter, volume)                            |
| L           | Dark mode: dim lights and a flashlight per soldier                            |
| F3          | Show / hide the FPS counter                                                   |
| M           | Mute / unmute                                                                 |
| 1 / 2 / 3   | Pick a perk while the level-up menu is open (the game is frozen until you do) |
| R           | Restart (on the game over screen)                                             |
| Esc         | Closes the open window first (shop, squad screen, settings), then pauses      |

## Windows and menus

| Where                    | Action                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Main menu                | Click the buttons (Enter / Space on the focused one); **Esc** steps back one screen; **O** settings   |
| Squad screen (pause)     | Click a unit for its 3D view and inventory (up to four windows); drag weapons and items between slots |
| Crate window (E)         | Take items from the crate or stash your own in it                                                     |
| Unit dialogs, any window | **Esc** or a click outside closes it                                                                  |

## Map editor

Opened from the main menu. It starts paused; **▶ Play** tests the map and **■ Stop** returns to the editor.

| Key / mouse                      | Action                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| W / A / S / D                    | Pan the camera                                                                              |
| Mouse wheel                      | Zoom                                                                                        |
| Right-drag on empty ground       | Rotate and tilt the camera                                                                  |
| Left click (tool armed)          | Place the armed unit or asset (arm it by clicking its entry in the Units / Assets tab)      |
| Right click / **Esc**            | Drop the armed tool                                                                         |
| Left click on an item            | Select it; **Shift**-click adds or removes it from the selection                            |
| Left-drag on an item             | Move the selection (props snap to 0.5 m)                                                    |
| Left-drag on empty ground        | Box select (Shift adds)                                                                     |
| Right-drag from an item          | Move that item                                                                              |
| **R** (tap)                      | Rotate the selection a step                                                                 |
| **R** held + right-drag          | Turn the selection to face the pointer                                                      |
| Delete / Backspace               | Delete the selection                                                                        |
| Ctrl+C / Ctrl+V                  | Copy / paste the selection (+2 m each paste)                                                |
| Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y  | Undo / redo                                                                                 |
| I / O                            | With one unit selected: its inventory / its stats window                                    |
| Y                                | Take control of a soldier in the editor's sandbox, and back                                 |
| Terrain tab: left-drag           | Raise / lower / flatten / smooth or paint with the brush (size and strength sliders)        |
| Terrain tab: roads and floors    | Each click adds a point; right click or **Esc** ends the road                               |
| Game logic tab: spawn point tool | Click adds a point (spawn point, fire, mission goal); right click or **Esc** drops the tool |
| Top bar                          | ← Menu, ▶ Play / ■ Stop, New, Open, Save, Export, Import, Undo, Redo                        |

## Mobile (landscape)

On a phone or tablet the game switches to a touch layout (add `?mobile=1` to the URL to try it on a desktop). Hold the phone sideways. Grenades are not on the touch layout yet.

| Control           | Action                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Joystick (left)   | Drag a thumb anywhere in the lower-left area to move the whole squad; the others follow           |
| Auto-fire         | The leader aims at the nearest enemy and fires on its own; so does the rest of the squad          |
| Soldier icons     | Top-left row with each unit's health; tap one and direct control passes to it                     |
| ⚙ / ☰ / 🛒 / 🎒  | Top-right: settings, main menu, shop (between waves), squad screen and inventories                |
| Inventory         | Tap a weapon, then tap the slot to move it to (drag and drop also works where the browser allows) |
| 📦 (bottom-right) | Appears when the leader stands next to a crate: tap to open it                                    |
| 🧎 / 💨 / ⤒       | Crouch and sprint (tap to toggle) and jump (hold)                                                 |
| Pinch / ⛶ / buzz  | Two-finger zoom; full screen button; the phone vibrates when a soldier is hurt                    |
