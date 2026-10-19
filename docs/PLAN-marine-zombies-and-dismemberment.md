# Plan: marine zombie variants and dismemberment

Status: **plan only, nothing built.** Written 2026-10-19 from the user's requests. Sizes are qualitative; nothing has been prototyped. Facts about the marine model were read from `public/models/soldier-marine.glb` on the same day.

## 1. Goal

Make the enemies one family built on the Meshy marine model (infected marines in several looks, with their own gaits and health), make bosses bigger and nastier marine variants, and let shots tear bodies apart: heads that burst or fly off, limbs that come off, legs shot away so the zombie crawls. All of it without new art budget: variants come from tints and procedural blood, dismemberment from the existing skeleton.

## 2. What the user asked for

| Request                                                                                        | Section |
| ---------------------------------------------------------------------------------------------- | ------- |
| A headshot makes the head explode or fly off                                                   | 5       |
| Other body parts too: legs and arms                                                            | 5       |
| Shooting only the legs tears them off and the zombie crawls                                    | 5, 6    |
| A zombie cut in two that crawls, with the upper body playing a walk clip (like the orc walk)   | 6       |
| Start replacing the other enemies with marine zombie variants                                  | 7       |
| New looks: brown, bloody, burgundy                                                             | 7       |
| A variant with blood-spurting animation and more health                                        | 7       |
| Mini bosses become marine zombie variants                                                      | 8       |
| Runner zombies that sprint at the squad from the moment they spawn                             | 7b      |
| Wanderers that roam until you walk close, and run at you once they see you (the fast run clip) | 7b      |
| Zombies that can climb                                                                         | 7b      |
| Write the plan in a document (this one)                                                        | -       |

## 3. What the marine model gives us (checked in the file)

| Fact                                                                                                                                                                                                                          | Consequence                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One skinned mesh (`Mesh_0`), one material, three JPEG textures (about 5.9 MB), **35,425 vertices and 61,272 triangles**                                                                                                       | Cheap to restyle (one material), but **very heavy for a horde**: the other enemies weigh about 1 MB each. See the performance phase (section 9)                                     |
| A Mixamo-style skeleton (`mixamorig:Head`, `Neck`, `Spine`, `Spine1`, `Spine2`, `LeftArm`, `LeftForeArm`, `LeftUpLeg`, `LeftLeg`, `Hips` ...)                                                                                 | Every body part has its own bones, so parts can be hidden or detached by bone. Clips from other Mixamo characters would share these bone names                                      |
| 15 clips already inside: `Running`, `Walking`, `Alert`, `Arise`, `Attack`, `BeHit_FlyUp`, `Boxing_Practice`, `Casual_Walk`, `Dead`, `Run_03`, `Skill_01`, `Skill_03`, `Slow_Orc_Walk`, `Triple_Combo_Attack`, `Unsteady_Walk` | The "orc walk" the user remembers is `Slow_Orc_Walk`. Different gaits for different variants need no new clips. `Arise` fits rising out of the ground; `BeHit_FlyUp` a hit reaction |
| The renderer already supports a colour `tint` per enemy (`data/characters.json`), a per-model flash on hit and a boss look (darkened, red eyes)                                                                               | Variants start as data; the boss look needs adapting (section 8)                                                                                                                    |
| `src/render/gore.ts` already bursts droplets, chunks and a puddle when an enemy "explodes"                                                                                                                                    | Reused for head bursts and limb loss                                                                                                                                                |

There is **no crawl clip**. A zombie with no legs needs one (section 6).

## 4. How the code is organised today

| Today                                                                                                                                                        | Consequence for the plan                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| The sim is 2D with circles; a shot now knows its **hit height** in third / first person and a head chance elsewhere (W4, `src/sim/hits.ts`)                  | Body zones come from the same rule: bands of height, plus a chance in top-down and for the AI (section 5) |
| `Zombie` has health, speed, `type`, `boss`, `size`, `stagger`; no per-part state                                                                             | A small `parts` record on the zombie, set by the sim; the renderer only reads it                          |
| Enemy types are multipliers in `data/game.json` (`enemies`) with a model entry in `data/characters.json`                                                     | A variant is one entry in each file: no code per variant                                                  |
| Bosses: every 3rd wave, types cycle over `boss.types` (zombie, skeleton, alien, brute, hound); the renderer darkens the model and adds red eyes (`makeBoss`) | Bosses switch to marine variants (section 8)                                                              |
| Views are pooled by `poolKey` (`type` or `boss:type`); a pooled view is reused by another enemy                                                              | A view that lost parts must be restored when it returns to the pool                                       |

## 5. Dismemberment: rules

### 5.1 Body zones

| Zone                | How a shot picks it                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Head                | Already built (W4): the top 20% of the height. Gets the head multiplier                                                                                                              |
| Torso               | Hit height in the middle band (about 45% to 80%)                                                                                                                                     |
| Legs                | Hit height in the lower band (below about 45%)                                                                                                                                       |
| Arms                | A sim with circles has no left or right. Proposal: a hit in the torso band has a small chance (about 15%) to take an arm instead, left or right at random. Always the case for melee |
| Top-down and the AI | No height: a hit picks legs, torso or arm by weight (mostly torso), and the head by the existing small chance                                                                        |

### 5.2 What each zone does

| Zone          | Effect                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Head          | A head hit that **kills** bursts the head (default) or sends it flying (random, by weapon: big calibre bursts, a pistol knocks it off). A head hit that does **not** kill still destroys the head: the zombie is **blind** (see open question 1) |
| Leg           | Each leg hit adds to a **leg damage** counter. At a fraction of max health (proposal: 25%) the legs come off: the zombie **crawls** (section 6). Bosses resist (a higher fraction)                                                               |
| Arm           | A hit arm accumulates the same way; at the threshold it comes off. One arm lost: melee damage x0.6. Both lost: the zombie bites with a short reach and low damage                                                                                |
| Torso         | Plain damage; the hit that kills can burst the whole body (the existing `explodeChance`) or cut it in two (section 6)                                                                                                                            |
| Kill by blast | Grenades and explosions have no zone: they roll limbs off at random around the blast (several parts fly)                                                                                                                                         |

All thresholds, chances and multipliers go in a `dismember` section of `game.json` (and per-variant overrides in `enemies`), with the usual zod schema. No new tests (the user's rule); the 48 stay green.

### 5.3 Sim and render split

| Layer  | Does                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sim    | `Zombie.parts` (head, arms, legs present or not) and the counters; `speed`, `attackRange`, damage and the hitbox change with what is missing (a crawler is shorter, so its head band is lower); an event `{ type: 'dismember', zombieId, part, pos, dir, speed }` carries what flew off and where |
| Render | Hides the part, draws a stump, and spawns the loose part with a simple ballistic motion (gravity, a bounce, a few seconds, then it fades); blood droplets and a puddle through `gore.ts`; the zombie's view is restored when it returns to the pool                                               |
| Audio  | A wet crunch for a head burst, a snap for a limb (procedural, like the other SFX)                                                                                                                                                                                                                 |

## 6. Dismemberment: how the model is cut (no Blender needed)

The marine is one mesh, so parts cannot just be hidden. At load time, once per model:

1. For each vertex take its **dominant bone** from `JOINTS_0` / `WEIGHTS_0`, and map the bone to a group: head (Head, Neck above the collar), left arm, right arm (shoulder to fingers), legs (UpLeg to toes), torso (the rest).
2. Group each triangle by the majority of its vertices and build **one index range per group**, so a group can be hidden by drawing fewer triangles. A loose part is a second `SkinnedMesh` sharing the geometry but drawing only that range.
3. The cut is a hole (the mesh is hollow). Fill it with a small **stump cap**: a dark-red disc or low sphere placed at the joint bone, oriented along the bone.

| Case                   | Approach                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless               | Hide the head group; cap at the neck; a short blood jet from the neck bone while it walks                                                                                                                                                                                                                             |
| Flying head or limb    | The loose `SkinnedMesh` is posed once in the current animation frame and then moves as a rigid body (no skeleton animation)                                                                                                                                                                                           |
| Missing arm            | Hide the arm group; cap at the shoulder                                                                                                                                                                                                                                                                               |
| Legless crawler        | Hide the leg group and the lower hips; drop the model so the torso lies near the ground, tilted forward; play an upper-body clip and **add a procedural crawl** (body sways and drags). The legs stay as a loose part where they were shot off                                                                        |
| "Cut in two" on a kill | Same as the crawler, but the legs are left behind as a separate part and the upper half keeps moving for a moment (or finishes the death clip)                                                                                                                                                                        |
| Upper body with a clip | `Slow_Orc_Walk` or `Unsteady_Walk` plays on the whole skeleton as usual; the legs are hidden, so only the upper body is seen moving, which is what the user described. Playing a clip from a **different character** on the upper bones only is not needed here, because the clips are already inside the marine file |
| A real crawl animation | A later asset: a Mixamo-skeleton "crawl" clip would retarget cleanly (same bone names), but **Mixamo's terms are not CC0 / CC-BY**: confirm them with the user before adding any (CLAUDE.md section 11) or use a CC0 clip                                                                                             |

Risks of this approach: triangles that straddle two groups at a joint leave a ragged edge (the cap and blood hide most of it); the result can only be judged by eye, and Claude has no browser, so the user checks and the groups' bone lists and cap sizes are constants to tune.

## 7. Marine zombie variants (replacing the other enemies)

All variants share **one model file** (no extra download); each is a `characters.json` entry (tint, scale, clip choice) and an `enemies` entry (multipliers). Looks come from a tint and from **procedural blood textures** made at load with a canvas (stains, splatter, drips), so there is no new image asset and no new license.

| Id (proposed)     | Replaces       | Look                                       | Gait and attacks                                                                    | Stats vs. the base zombie                                    |
| ----------------- | -------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `marine_zombie`   | zombie         | Green skin (exists)                        | `Unsteady_Walk`, `Attack`                                                           | Base                                                         |
| `marine_rotten`   | skeleton       | **Brown**, mud and rot                     | `Walking` (slower, stiff), `Attack`                                                 | Slow, low health, more of them                               |
| `marine_gory`     | alien          | **Bloody**: red-stained, wet shine         | `Run_03`, `Triple_Combo_Attack`                                                     | Fast, medium health, bites quickly                           |
| `marine_burgundy` | brute          | **Burgundy** (bordó), larger (about 1.25x) | `Slow_Orc_Walk`, `Skill_01` as a heavy blow                                         | Slow, tanky, hard-hitting                                    |
| `marine_bleeder`  | (new top tier) | Green with open wounds                     | `Unsteady_Walk`; blood **spurts** from the torso and arm in bursts, leaving a trail | **More health** (about x2.5), average speed; reward higher   |
| `marine_crawler`  | hound          | The marine without legs from the start     | The procedural crawl (section 6), fast                                              | Low health, low and fast; hard to hit from the top-down view |

The giant worm stays as it is for now (it is not humanoid and its "no head" rule is already set). The dog and cat stay (they are map animals, not enemies).

Bleeder blood: a small particle emitter parented to two bones (spine, one arm) that fires drops in short bursts, plus a faint red pulse in the material. It costs particles only for these enemies; cap the number alive on screen.

Waves: the unlock waves and spawn weights of the old types are kept, so the difficulty curve does not move; only the faces change. The old models stay in `public/models` and `assets.toml` (the user's decision), usable again from the editor and the map data.

## 7b. Behaviours: runners, wanderers and climbers

Today every enemy chases the nearest soldier at a fixed speed from the moment it spawns. Three behaviour traits are added, set per variant in `data/game.json` (so any variant can have any trait) and read by the sim. The marine already has the clips: `Running` and `Run_03` for sprinting, `Walking`, `Casual_Walk` and `Unsteady_Walk` for roaming.

| Trait        | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Clips                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Runner**   | Chases at a high speed (about 2x the walker) from the first step; the speed is a variant multiplier, so waves still scale it (capped by `maxSpeedScale`). Low health to balance it                                                                                                                                                                                                                                                                                                            | `Run_03` (or `Running`) as its `walk` clip                     |
| **Wanderer** | Starts in a `wander` state: roams slowly to random nearby points (never far from where it spawned), stopping now and then. It becomes **alert** when a soldier walks or fires within its `senseRadius`, or comes in sight inside a longer `sightRadius` (no obstacle between), or when a shot makes noise nearby (the W6 `noise` rule, when it is on). Once alerted it **runs** at the squad for good, and the ones close by get alerted too (a short shout radius) so a group wakes together | `Casual_Walk` / `Unsteady_Walk` while roaming, then `Run_03`   |
| **Climber**  | Treats a low obstacle as passable: it climbs a box whose height is under `climbMaxHeight` (a limit of its own, higher than the player's) instead of walking around, with a short climb time, and can stand on top of a box. The flow field (already built) gets a **climb cost** for such cells instead of blocking them, so the horde chooses between a detour and a climb by distance                                                                                                       | No climb clip: a procedural hop, like the player's climb today |

How it fits the code:

| Piece                     | Plan                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sim state                 | `Zombie.mode`: `wander` or `chase` (next to the existing `state`: walk, attack, death); a roam target and a pause timer for wanderers; a height above the ground for climbers. The 2D circle sim keeps working: a climber's height reuses the player's climb rules (`topOf`, `STEP_UP`) |
| Perception                | One cheap check per wanderer per step against the squad (distance first, line of sight only when close) using the spatial grid; alert is sticky. The cost grows with the number of wanderers, not with everyone                                                                         |
| Flow field                | `src/sim/flowfield.ts` marks climbable obstacles with a cost instead of blocking them for climbers; walkers still treat them as blocked. Two cost layers, so the field is searched once per layer (about 1 ms each)                                                                     |
| Spawns and waves          | A wave mix says how many of each trait; wanderers can also be **placed by a map** (a unit entry with a `wander` behaviour) so story missions can have sleeping zombies                                                                                                                  |
| Events and render         | A `zombieAlerted` event (a short growl and an exclamation icon above its head for the player); the render swaps the clip from roam to run; climbing hops are procedural                                                                                                                 |
| Variants                  | `marine_runner` (fast, thin, lighter tint) and `marine_wanderer` (pale, torn clothes, dormant) are two more entries in section 7; any other variant can be given the traits in data                                                                                                     |
| Dismemberment interaction | A crawler cannot climb, and a runner that loses its legs becomes a crawler, so shooting the legs of a runner is a real tactic                                                                                                                                                           |

Balance notes (all estimates): wanderers make the early waves calmer and let the player pull groups on purpose; runners are the pressure that makes crouching and aiming worth using; climbers make cover less safe, which matters for the build-mode plan ([PLAN-build-mode.md](PLAN-build-mode.md)), where walls are meant to stop zombies. The break cost of structures and the climb cost of the field are the same mechanism and are designed together.

## 8. Mini bosses as marine variants

| Item                | Proposal                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types               | `boss.types` lists marine variants instead of zombie, skeleton, alien, brute, hound; the cycle order and the health, damage and size lists in `game.json` do not change                                     |
| Look                | Each boss keeps its variant's tint but heavier: armour plates (cheap boxes parented to chest and shoulders), a darker skin, scars, and the red eyes of today; the size 2x to 5x still grows with its health |
| Dismemberment       | Bosses lose parts only after taking a large share of their health (a higher fraction), and a boss never crawls before the last phase; a lost arm makes a boss enraged (x1.3 speed) instead of weaker        |
| Headshots on bosses | The head multiplier is smaller on bosses (they already have a lot of health), and a head never bursts before death                                                                                          |
| Loot                | Unchanged; better loot already comes from the boss reward multiplier                                                                                                                                        |

## 9. Performance (the real blocker)

The marine has **61,272 triangles**; the old enemies are far lighter. A horde of 200 marines is about 12 million triangles per frame before shadows, and the user already suspects drawing, not the sim (about 2.7 ms per step with 1000 zombies), as the bottleneck. So before any variant replaces an enemy:

| Step              | What                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Measure           | F3 and Chrome's profiler with a heavy wave of the current marine zombies (the user runs it); decide the budget                                                                                                                                                                                                                             |
| A light marine    | Make a **low-poly copy** of the model (aim for about 4,000 to 6,000 triangles, textures at 512 px) with a decimation tool such as gltf-transform's `simplify` (meshoptimizer; runs from the terminal) or Blender in background mode if installed; keep the skeleton, the weights and every clip. This also cuts the 16 MB first load a lot |
| Keep the full one | The full model stays for the menu viewer and the squad (4 units), the light one for the horde                                                                                                                                                                                                                                              |
| More              | A distance LOD (swap to an even lighter mesh far away), no shadows for far enemies, and capping live loose parts and particles                                                                                                                                                                                                             |

The decimated copy must keep the dismemberment groups clean; section 6 runs on it.

## 10. Phases

Each phase is a branch that ends green (lint, format, typecheck, the 48 tests, build, asset check). No new tests; visual checks are the user's. Dismemberment needs the weapon work on `feat/weapon-instances` (hit zones), so cut those branches from it, or from `main` after it is merged.

| #   | Phase                        | What it delivers                                                                                                                                                                              | Depends on     | Size |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| M0  | Measure and the light marine | Profile a heavy wave; the low-poly marine file with all clips; the credit stays Meshy AI (CC-BY-4.0) in `assets.toml`                                                                         | none           | M    |
| M1  | Variants                     | Procedural blood textures and tints; the variants of section 7 as data; the old enemy types replaced in the wave mix; the bleeder's spurts                                                    | M0             | M    |
| M1b | Behaviours                   | Runner, wanderer (roam, sense, alert, run, wake the neighbours) and climber (field climb cost, procedural hop); the `marine_runner` and `marine_wanderer` variants; the alert event and sound | M1, flow field | L    |
| M2  | Mesh groups and head         | Split the marine by bone group at load; head hidden, stump cap, burst or flying head, blood; the `dismember` event and config section                                                         | W4 (done), M0  | L    |
| M3  | Limbs and zones              | Body zones in the hit rule (legs, arms, torso); leg and arm counters; loose limbs with simple physics; grenades rolling limbs                                                                 | M2             | M    |
| M4  | Crawling                     | Legless state in the sim (speed, hitbox, reach); the procedural crawl; the `marine_crawler` enemy; the cut-in-two kill                                                                        | M3             | M    |
| M5  | Bosses                       | Boss types become marine variants; armour plates; the part-loss and head rules for bosses                                                                                                     | M1, M3         | M    |
| M6  | Polish and balance           | Retune thresholds after play; sounds; a real crawl clip if the user approves a source; drop the unused old models from the wave mix only if the user agrees                                   | all            | M    |

## 11. Decisions the user should take

| #   | Question                                                                                            | Recommendation                                                                                               |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | A head shot that does not kill: does the zombie keep walking blind, or always die?                  | Blind (it only senses things within 2 m and keeps walking): funny and readable, and rewards finishing it     |
| 2   | Arms: random side on a torso hit (section 5.1), or only on a melee blow and grenades?               | Random side with a small chance, so arms come off in normal play                                             |
| 3   | Do hounds become crawlers, or do both exist?                                                        | Replace the hound with the crawler (same job: fast and low)                                                  |
| 4   | Is gore OK as it is? There is already a `gore` graphics option                                      | Everything new respects that option: with it off, parts simply vanish and no blood is drawn                  |
| 5   | A real crawl clip: allow a Mixamo-sourced one? Its terms are not CC0 / CC-BY                        | Start with the procedural crawl; decide on a clip only if it looks bad                                       |
| 7   | Wanderers: what wakes them? Walking close, being seen, noise, or all three                          | All three, each with its own radius in the JSON; the noise one stays off until the W6 noise rule is accepted |
| 8   | Climbers: every variant, or only some (so walls still stop most of the horde)?                      | Only some variants (a climber variant and the bosses), so build mode keeps its point                         |
| 6   | Brown / bloody / burgundy are named here as rotten / gory / burgundy: are those the looks you want? | Yes; tell me if you want other names or other colours                                                        |

## 12. Risks

| Risk                                                               | Mitigation                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 61k triangles per enemy makes the game unplayable in big waves     | M0 first: measure, then a low-poly copy; do not replace any enemy before that                                                                        |
| Cuts look ragged or hollow                                         | Stump caps and blood at every joint; per-group bone lists and cap sizes are constants; the user judges by eye                                        |
| Procedural blood textures look flat                                | They are canvas code: iterate on the parameters; a hand-painted texture can replace them later                                                       |
| The leg/arm rules make the game easier (crawlers are slow targets) | Crawlers are low and hard to hit from above, bosses resist; every number is in the JSON; retune after play                                           |
| Wanderers and climbers cost sim time (perception, a second field)  | Distance checks first and sticky alerts; the second field only when a climber exists and a straight way is blocked; measure with `npm run bench:sim` |
| Pooled views keep a lost part after reuse                          | Restore every group and remove loose parts when a view returns to the pool                                                                           |
| Claude cannot see any of it                                        | Say so in the PR and ask the user to look; keep constants named and few                                                                              |
