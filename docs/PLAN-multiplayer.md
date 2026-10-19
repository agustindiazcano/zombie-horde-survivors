# Plan: online multiplayer

Status: **plan only, nothing built.** Written 2026-10-19 from the user's question about how hard online multiplayer is. Nothing here has been prototyped; sizes are qualitative.

## 1. Goal

Two to four people play the same run online, in the same squad game (co-op against the horde). The Multiplayer button on the main menu is already there, disabled.

## 2. Decisions

| Decision                                                                   | Status                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The project may have a backend (a small server), for this feature          | **Decided by the user (2026-10-19).** Reverses "no backend" in CLAUDE.md for multiplayer only |
| **Gold, XP and perks are per player**, not shared by the squad             | **Decided by the user (2026-10-19)**                                                          |
| **Any player can pause and unpause**                                       | **Decided by the user (2026-10-19)**                                                          |
| First version: a WebSocket relay plus a **host** browser that runs the sim | Proposed, not confirmed                                                                       |
| Co-op only (no versus) and 2 to 4 players                                  | Proposed, not confirmed                                                                       |
| Later, if it grows: move the sim to a Node server (same TypeScript)        | Proposed as the exit path; not planned                                                        |

### What the per-player decisions change in the code

| Today                                                                                                                                                    | After                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state.gold`, `state.xp`, `state.upgrades`, `state.mods`, `state.purchases`, `state.pendingPerks`, `state.perkOffer` are single values for the whole run | They move onto each player (`state.players[i]`). A single-player run is just one player, so nothing changes for it                                                |
| Perks apply to every soldier (`state.mods`)                                                                                                              | A player's perks apply to **the units that player owns**; the level-up menu and its three offers are per player                                                   |
| Loot (gold and XP orbs) is collected by any unit and goes to the shared pot                                                                              | It goes to the owner of the unit that picked it up                                                                                                                |
| The shop spends the shared gold on one selected unit                                                                                                     | The shop spends that player's gold, on that player's units; revive and reinforcement buy for that player's squad                                                  |
| Pickup of a crate by any unit                                                                                                                            | Unchanged; contents go to the unit that opened it                                                                                                                 |
| Pause is local (`P`, `Esc`, a window losing focus)                                                                                                       | Pause is a **shared flag** in the run: any player sets or clears it with a command; the host stops stepping; every client shows who paused and a button to resume |
| The squad screen, the shop and the level-up menu freeze the game                                                                                         | In multiplayer they must not freeze everyone (open question in section 6); only the explicit pause does                                                           |
| Game over when no soldier is on their feet                                                                                                               | Unchanged for the whole run; a player whose units are all down waits to be revived                                                                                |

## 3. Architecture

```
 client (guest) ──input/commands──▶            ┌─────────────┐          ┌─ client (host) runs the sim
 client (guest) ◀──snapshots───────  relay  ◀──┤ WebSocket   ├──────────┤  step() at 60 Hz
 client (guest) ... (2 to 4)         (rooms)   └─────────────┘          └─ sends snapshots at 15-20 Hz
```

- The relay only keeps rooms (a short code) and forwards messages. It runs no game logic, so it is cheap and small.
- The **host** browser owns the truth: it receives every player's inputs and commands, steps the sim, and sends snapshots. Guests render and send inputs; they do not simulate.
- Why not the alternatives: WebRTC needs signalling plus a TURN server for some networks; lockstep needs bit-identical math in every browser (`Math.sin` / `Math.cos` are not guaranteed identical); a Node authoritative server costs always-on hosting and more bandwidth. The sim is pure TypeScript, so moving it to Node later (option 2) reuses it as is.

## 4. Phases

Each phase is a branch and ends green (lint, format, typecheck, the 48 tests, build, asset check). No new tests, per the user's standing decision. Visual checks are the user's.

| #   | Phase                               | What it delivers                                                                                                                                                                                                  | Depends on     | Size |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| 0   | Spike                               | A relay "hello": a guest renders a read-only copy of the host's run from raw snapshots, to measure bandwidth with a big horde                                                                                     | Hosting chosen | S    |
| 1   | Per-player input in the sim         | `step()` takes one `Input` per player; `localPlayer(...)` stops being a global assumption (5 call sites in `src/sim`); each client knows its own player id                                                        | none           | M    |
| 2   | Relay server                        | Rooms by code, join / leave, message size and rate limits, a version check; deployed                                                                                                                              | Hosting chosen | S-M  |
| 3   | Snapshot protocol                   | Full snapshot on join, then deltas at 15-20 Hz, only entities near each player, quantized numbers; guests interpolate; guests send inputs and commands (orders, grenade throws, shop buys, perk picks, E / V / G) | 0, 1, 2        | L    |
| 4   | Lobby UI                            | The Multiplayer button: create a room, share the code, join, pick the map, see the players, start                                                                                                                 | 2              | M    |
| 5   | Per-player economy and shared pause | Move gold, XP, perks and the shop onto each player; loot goes to the owner; a shared pause any player can toggle; menus that do not freeze everyone (sections 2 and 6)                                            | 3              | M    |
| 6   | Robustness                          | A guest disconnects (their soldier goes to the AI), reconnect, latency display, the host leaving ends the run with a message                                                                                      | 3, 4           | M    |
| 7   | Later                               | Host migration, a Node authoritative server, anti-cheat, leaderboards, accounts                                                                                                                                   | all            | L    |

## 5. What it needs

| Need                      | Notes                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A WebSocket host          | Not chosen. Candidates: Cloudflare Workers (Durable Objects), or a small Node server on Fly / Render. Prices and limits **not checked**: look before deciding |
| The game stays on Pages   | The static game keeps its current host; only the relay is new                                                                                                 |
| A privacy / safety stance | Rooms by code, no accounts, no chat in the first version (nothing to moderate)                                                                                |
| Version check             | Host and guests must run the same build, or the snapshot format breaks                                                                                        |

## 6. Open design questions (the user decides)

Answered on 2026-10-19: gold, XP and perks are per player; any player can pause and unpause. Still open:

| Question                                                                 | Why it matters                                                                 | Recommendation                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Do the shop, the squad screen and the level-up menu still pause the run? | In multiplayer one person opening a menu cannot freeze the others              | No: only the explicit pause freezes; menus stay open while the game runs |
| Can a player pause forever, or is there a limit?                         | Anyone can pause: a player could block the run                                 | Show who paused; a vote or a time limit is an option for later           |
| Does each player control their own soldier, or can they take any?        | Ownership is already in the sim (units belong to players)                      | Their own, plus the drone if unowned                                     |
| Can a player use RTS mode in multiplayer?                                | Orders only for their own units is the natural rule                            | Yes, for their own units                                                 |
| Which maps? Waves only, or Story too?                                    | Story objectives and briefings would need a shared view                        | Waves first                                                              |
| Is the host's advantage acceptable?                                      | The host has zero latency and could cheat; fine for friends, not for a ranking | Yes for friends                                                          |
| Can one player give gold or items to another?                            | Per-player gold makes a gift command useful                                    | Items yes (drag between units); gold later                               |

## 7. Risks

| Risk                                                         | Mitigation                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Snapshots of hundreds of zombies are heavy                   | Phase 0 measures it; send only what is near each player, deltas, quantized numbers    |
| Guests feel the lag on their own soldier                     | Client-side prediction of the player's own movement in phase 3 (only if it feels bad) |
| The host's browser slows down (sim plus render plus network) | Move the sim to a Web Worker; see the performance notes in section 8                  |
| Scope creep into versus, ranking, accounts                   | Keep them in phase 7                                                                  |

## 8. Performance and where code lives (Wasm, other languages, pathfinding, AI, physics)

Answer to the question "would something else move to the backend if we use Wasm or another language?".

| Piece                                               | Where it runs                                                             | Recommendation                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sim, AI, pathfinding, physics (single player)       | The browser, as today                                                     | **Stay in TypeScript, client side.** Putting them on a server would add latency and cost for no gain in a single-player game |
| Same pieces in multiplayer (this plan)              | The host's browser                                                        | Same code; only the host runs it                                                                                             |
| Same pieces if the sim moves to a Node server later | The server (Node, same TypeScript, or the same Wasm module if one exists) | Possible without a rewrite because `src/sim` has no DOM or Three.js                                                          |
| Relay, rooms                                        | The backend                                                               | The only new backend piece in this plan                                                                                      |
| Cloud maps, leaderboards, accounts                  | A backend                                                                 | Not planned; they need real validation and storage. Maps live in localStorage today                                          |

What the numbers say today (measured in Node on the user's PC, no drawing, an idle squad, `npm run bench:sim`): 1000 zombies step in about 2.7 ms against a 16.6 ms budget per frame. So the **sim is not the bottleneck yet**; the drawing probably is, and that has **not been measured in a browser** (open item in PENDING).

Order of attack if performance becomes a problem:

| #   | Step                                         | Why                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Profile in the browser (F3, Chrome profiler) | Decide between drawing and sim before touching anything                                                                                                                                                                                                                 |
| 2   | Move the sim to a Web Worker                 | Cheap, frees the main thread for drawing; the sim is already DOM-free                                                                                                                                                                                                   |
| 3   | A flow field for pathfinding                 | One search from the squad over a grid gives every zombie its direction in a lookup: cost grows with cells, not with zombies. Replaces the corner heuristic that got stuck before. Plain TypeScript is enough                                                            |
| 4   | Wasm only for a proven hotspot               | Candidates already named: zombie separation grid, `nearestTarget`, shot raycasts. Rust is the usual choice; AssemblyScript keeps TypeScript-like syntax. Costs: a toolchain, copying data between JS and Wasm (use typed arrays, struct-of-arrays), losing shared types |
| 5   | A physics engine                             | Not needed: movement is circles against boxes. Only if ragdolls or real vehicle physics are wanted (Rapier is Rust compiled to Wasm and has a deterministic build)                                                                                                      |

Wasm is also relevant to multiplayer: Wasm arithmetic is IEEE-exact and the same in every browser, which is what makes **lockstep** possible (no `Math.sin`; use own trig tables). That is the reason lockstep is not ruled out forever, but it is not needed for the first version.

## 9. Not in this plan

Versus modes, matchmaking, accounts and saves in the cloud, voice or text chat, mobile multiplayer, anti-cheat, replays.
