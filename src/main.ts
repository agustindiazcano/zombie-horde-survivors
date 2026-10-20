import characters from '../data/characters.json';
import data from '../data/game.json';
import map1 from '../data/maps/map-1.json';
import items from '../data/items.json';
import units from '../data/units.json';
import { Sfx } from './audio';
import { Editor } from './editor';
import { FpsCounter } from './fps';
import { DamageNumbers } from './damageNumbers';
import { Hud } from './hud';
import { MainMenu } from './mainMenu';
import { isMobile, MobileControls } from './mobile';
import { InputController } from './input';
import { CameraControls } from './cameraControls';
import { CratePrompt, InventoryUi } from './inventoryUi';
import { startLoop } from './loop';
import { GltfAssetLoader } from './render/assetLoader';
import { loadVehicleModel } from './render/vehicles';
import { parseCharactersConfig } from './render/characterConfig';
import { GameRenderer, type ViewMode } from './render/gameRenderer';
import { RtsController } from './rts';
import {
  controlSoldier,
  defaultEnvironment,
  isSquadUnit,
  itemDef,
  createGame,
  localPlayer,
  maxHealthOf,
  nearestCrate,
  getSoldier,
  getVehicle,
  aimErrorOf,
  aimZoomOf,
  startReload,
  meleeStrike,
  throwGrenade,
  useNearest,
  objectDef,
  getObject,
  toggleDrag,
  toggleVehicle,
  vehicleInReach,
  shopAvailable,
  orderFollow,
  orderHold,
  parseConfig,
  arenaOf,
  mapRules,
  parseMap,
  type MapData,
  step,
  type Input,
} from './sim';
import { SquadPanel } from './squadPanel';
import { UnitsScreen } from './unitsScreen';
import { PausePanel } from './pausePanel';
import { DEFAULT_SETTINGS, PRESETS, loadSettings, saveSettings, type Settings } from './settings';
import { SettingsPanel } from './settingsPanel';
import { Radar } from './radar';
import { BuildUi } from './buildUi';
import { PerkPicker, Shop } from './upgradesUi';

/** Mobile: enemies within this distance (world units) are shot at automatically. */
const MOBILE_AIM_RANGE = 22;
/** Mobile person view: fires when the nearest enemy is within this cosine of the view direction (about 30 degrees). */
const MOBILE_LOOK_FIRE_COS = 0.87;

/** Camera pan speed in RTS mode (world units per second). */
const PAN_SPEED = 22;
/** Editor: how close (m) a soldier must be to the selected unit for Y to drive it. */
const EDITOR_PICK_RANGE = 1.5;

const HINT_DIRECT =
  'Direct control · WASD move · Mouse aim · Click fire · Ctrl/C: crouch · Shift: sprint · Z: walk · Space: jump · T: change view · Y: back to RTS · I: squad & inventories · E: use / pick up / open / enter · R: reload · Right button: aim (3rd/1st person) · Q: throw a grenade · G: drag a body · V: enter / leave a vehicle · B: shop (between waves) · Wheel: zoom · Right-drag: rotate/tilt';
const HINT_RTS =
  'RTS · WASD pan · Click/drag select · Right-click move · F follow · G: aim a grenade · E all · 1-9 pick · Y: control selected · I: squad & inventories · B: shop (between waves) · Wheel: zoom · Right-drag: rotate/tilt';

async function main(): Promise<void> {
  const config = parseConfig(data, parseMap(map1), units, items);
  /** The rules of game.json before any map overrides them. */
  const globalRules = {
    waves: config.waves,
    boss: config.boss,
    enemies: config.enemies,
    difficulty: config.difficulty,
  };
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  let state = createGame(config, Date.now());
  let paused = false;
  const renderer = new GameRenderer(document.body, config, factories);
  renderer.setVehicleModel(await loadVehicleModel());
  const input = new InputController(renderer.domElement);
  const sfx = new Sfx();
  const fps = new FpsCounter(document.body);

  // Player options (graphics, lighting, FPS counter, volume), saved in the browser.
  const mobile = isMobile();
  let settings = loadSettings(
    mobile ? { ...DEFAULT_SETTINGS, ...PRESETS.low, quality: 'low' } : DEFAULT_SETTINGS,
  );
  const commitSettings = (next: Settings) => {
    settings = next;
    saveSettings(settings);
    renderer.applyGraphics(settings);
    renderer.setDark(settings.darkMode);
    fps.setVisible(settings.showFps);
    sfx.setVolume(settings.volume);
  };
  commitSettings(settings);
  const settingsPanel = new SettingsPanel(document.body, () => settings, commitSettings);
  let resumeAfterSettings = false;
  const openSettings = () => {
    if (settingsPanel.isOpen) return;
    // Opened mid-game, it pauses the game and gives it back when closed.
    resumeAfterSettings = !paused && !menu.isOpen && state.status === 'playing';
    if (resumeAfterSettings) setPaused(true);
    // First/third person lock the cursor; free it so the window can be used with the mouse.
    if (document.pointerLockElement) document.exitPointerLock();
    settingsPanel.show(() => {
      if (!resumeAfterSettings) return;
      resumeAfterSettings = false;
      setPaused(false);
    });
  };
  window.addEventListener('keydown', (e) => {
    if (settingsPanel.isOpen) return;
    if (e.code === 'KeyL' && !menu.isOpen)
      commitSettings({ ...settings, darkMode: !settings.darkMode });
    else if (e.code === 'F3') {
      e.preventDefault();
      commitSettings({ ...settings, showFps: !settings.showFps });
    }
  });
  const ui = new InventoryUi(document.body, config, () => state);
  const cratePrompt = new CratePrompt();
  const vehiclePrompt = new CratePrompt('V');
  const pausePanel = new PausePanel(document.body, config, openSettings, () => {
    ui.close();
    shop.close();
    setPaused(false);
    menu.show();
  });
  const radar = new Radar(document.body);
  // The pause screen lists the squad: each unit's 3D view comes from the same models as in play.
  const unitsScreen = new UnitsScreen(
    document.body,
    config,
    () => state,
    (unit) =>
      unit.kind === 'drone'
        ? factories.drone
        : factories.soldiers[(unit.id - 1) % factories.soldiers.length]!,
    () => localPlayer(state).controlledId ?? [...rts.selected][0] ?? null,
  );
  const perks = new PerkPicker(document.body, config, () => state);
  const shop = new Shop(document.body, config, () => state);
  /** Any full-screen menu: the game is frozen and keyboard shortcuts are off. */
  // A random soldier floats next to the title, a different one on each visit.
  const preview = factories.soldiers[Math.floor(Math.random() * factories.soldiers.length)];
  // Map 1 is the only map the sim is built for so far; the picked map is ignored until phase 4.
  const menu = new MainMenu(
    document.body,
    (entry) => {
      loadMap(entry.map);
      hud.showBriefing(config.briefing ?? '');
      // Some maps start in a person's eyes (the sky show looks up from the street).
      if (config.startView && localPlayer(state).controlledId !== null) {
        setView(config.startView);
        renderer.setLookPitch(config.startPitch);
      }
    },
    preview,
    openSettings,
    () => openEditor(),
    !mobile,
  );
  const editor = new Editor(document.body, {
    canvas: renderer.domElement,
    groundAt: renderer.screenToGround,
    onMarks: (marks) => renderer.setEditMarkers(marks),
    onSpawnMarks: (points) => renderer.setSpawnMarkers(points),
    onPlay: () => {
      resetGame();
      hud.showBriefing(config.briefing ?? '');
      setPaused(false);
    },
    onStop: () => {
      resetGame();
      controlSoldier(state, null);
    },
    onMapChange: (map, unitsKept) => loadMap(map, unitsKept),
    onMenu: () => {
      editor.close();
      menu.show();
    },
  });
  const modalOpen = () =>
    menu.isOpen ||
    editor.isEditing ||
    ui.isOpen ||
    perks.isOpen ||
    shop.isOpen ||
    settingsPanel.isOpen;
  const rts: RtsController = new RtsController(
    renderer.domElement,
    renderer,
    config,
    () => state,
    () =>
      localPlayer(state).controlledId === null &&
      state.status === 'playing' &&
      !paused &&
      !modalOpen() &&
      !build.isArmed,
  );
  const build: BuildUi = new BuildUi(
    document.body,
    renderer.domElement,
    config,
    () => state,
    () => {
      const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
      if (unit && renderer.viewMode !== 'top') return renderer.lookAimPoint(unit.pos);
      return input.read(renderer.screenToGround).aim;
    },
    () => [...rts.selected],
  );
  const hud = new Hud(document.body, config, () => resetGame());
  const damageNumbers = new DamageNumbers(document.body, (x, z, y) =>
    renderer.projectToScreen(x, z, y),
  );
  const squad = new SquadPanel(document.body, config, (id, additive) => {
    // Clicking an icon while playing hands direct control to that unit; in RTS mode it selects.
    if (mobile || localPlayer(state).controlledId !== null) setLeader(id);
    else rts.toggle(id, additive);
  });

  /** A fresh run of the loaded map (restart, the editor's Play and Stop). */
  const resetGame = () => {
    state = createGame(config, Date.now(), editor.isEditing);
    // The editor is a live preview: no waves, enemies stand still, and nobody is under control
    // until Y. It shows only what the map places, so no default squad either.
    if (editor.isEditing) {
      if (!config.placed.some((u) => isSquadUnit(config, u.type))) {
        state.soldiers = [];
      }
      controlSoldier(state, null);
    }
    hud.reset();
    build.close();
    rts.set([]);
    ui.close();
    shop.close();
  };

  /** Makes the sim and the 3D scene use another map (the config object is shared, so edit it in place). */
  let groundOf: unknown[] = [];
  const loadMap = (map: MapData, unitsKept = false) => {
    Object.assign(config, mapRules(globalRules, map.logic, map.units));
    config.players = map.players;
    config.placed = map.units;
    renderer.setEnvironment(map.environment ?? defaultEnvironment());
    // Dragging an environment slider changes neither the ground nor the props: skip the rebuild.
    const ground = [map.meta.size, map.terrain, map.props, map.surfaces];
    if (!ground.every((part, i) => part === groundOf[i])) {
      groundOf = ground;
      config.arena = arenaOf(map);
      renderer.setArena(config.arena);
    }
    renderer.setFireMarkers(config.fires);
    renderer.setGoalMarkers(
      config.objectives.flatMap((o) =>
        o.kind === 'reach' ? [{ x: o.x, z: o.z, radius: o.radius }] : [],
      ),
    );
    // An editor edit that left the units alone (terrain, props) only redraws the ground.
    if (unitsKept) return;
    renderer.resetUnits();
    resetGame();
  };

  /** The editor opens paused on the map, in RTS mode so WASD pans the camera. */
  const openEditor = () => {
    controlSoldier(state, null);
    setPaused(false);
    editor.open();
  };

  const setPaused = (value: boolean) => {
    paused = value && state.status === 'playing' && !menu.isOpen;
    hud.setPaused(paused);
  };

  let mobileUi: MobileControls | null = null;
  if (mobile) {
    // Touch play: one joystick moves the whole squad; the leader auto-aims and everyone fires.
    mobileUi = new MobileControls(document.body, {
      onMove: (x, z) => input.setTouchMove(x, z),
      onLook: (dx, dy) => {
        if (paused || modalOpen() || localPlayer(state).controlledId === null) return;
        if (renderer.viewMode === 'top') setView('third');
        renderer.look(dx, dy);
      },
      onView: () => {
        if (playable() && !modalOpen() && localPlayer(state).controlledId !== null)
          setView(NEXT_VIEW[renderer.viewMode]);
      },
      onSettings: () => openSettings(),
      onMenu: () => {
        if (settingsPanel.isOpen) settingsPanel.close();
        ui.close();
        shop.close();
        setPaused(false);
        menu.show();
      },
      onShop: () => {
        if (shop.isOpen) shop.close();
        else if (playable() && !ui.isOpen && shopAvailable(state)) shop.show(inventoryFocus());
      },
      onInventory: () => {
        if (!modalOpen()) setPaused(!paused);
      },
      onCrate: () => {
        const crate = crateInReach();
        const unitId = localPlayer(state).controlledId;
        if (ui.isOpen) ui.close();
        else if (playable() && !shop.isOpen && crate && unitId !== null) {
          ui.openCrate(unitId, crate.id);
        }
      },
      onFullscreen: () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else {
          void document.documentElement
            .requestFullscreen()
            .then(() =>
              (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape'),
            )
            .catch(() => undefined);
        }
      },
      onAction: (action, on) => input.setTouchAction(action, on),
    });
  }

  /** Hands direct control to this unit (soldier or drone); the rest of the squad follows it. */
  const setLeader = (id: number) => {
    const leader = state.soldiers.find((s) => s.id === id);
    if (!leader || leader.dead) return;
    controlSoldier(state, leader.id);
    orderFollow(
      state,
      state.soldiers.filter((s) => !s.dead && s.id !== leader.id).map((s) => s.id),
    );
  };

  /** Mobile: keeps a living soldier in control, with the rest of the squad following it. */
  const ensureMobileLeader = () => {
    if (state.status !== 'playing' || localPlayer(state).controlledId !== null) return;
    const first = state.soldiers.find((s) => !s.dead && s.kind !== 'drone');
    if (first) setLeader(first.id);
  };

  /** Y: take direct control of the first selected soldier, or go back to RTS mode. */
  const toggleControl = () => {
    if (localPlayer(state).controlledId !== null) {
      controlSoldier(state, null);
      return;
    }
    const [first, ...others] = [...rts.selected];
    if (first === undefined) return;
    controlSoldier(state, first);
    if (localPlayer(state).controlledId === null) return;
    // Only the soldiers selected beforehand follow the controlled one; the rest stay put.
    orderFollow(state, others);
    orderHold(
      state,
      state.soldiers
        .filter((s) => !rts.selected.has(s.id) && s.order.type === 'follow')
        .map((s) => s.id),
    );
  };

  /** Editor, Y: drive the selected soldier (or the first one) in the preview, or let go of it. */
  const toggleEditorControl = () => {
    if (localPlayer(state).controlledId !== null) {
      controlSoldier(state, null);
      return;
    }
    const at = editor.selectedUnitAt();
    const alive = state.soldiers.filter((s) => !s.dead);
    const near = at
      ? alive.find((s) => Math.hypot(s.pos.x - at.x, s.pos.z - at.z) < EDITOR_PICK_RANGE)
      : undefined;
    const unit = near ?? alive[0];
    if (unit) controlSoldier(state, unit.id);
  };

  /** Normal -> third person -> first person -> normal. Only while controlling a unit. */
  const NEXT_VIEW: Record<ViewMode, ViewMode> = { top: 'third', third: 'first', first: 'top' };
  const setView = (mode: ViewMode) => {
    const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
    renderer.setViewMode(mode, unit?.facing ?? 0);
    input.takeLook(); // drop movement accumulated before the switch
    if (mobile) return; // touch has no cursor to lock: the look pad turns the view
    if (mode === 'top') {
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    // A locked cursor never hits the screen edge, so you can keep turning. Ask for raw
    // (unaccelerated) movement where supported, so the turn matches your hand exactly.
    const canvas = renderer.domElement;
    const lock = canvas.requestPointerLock as unknown as (o?: object) => Promise<void> | void;
    try {
      void Promise.resolve(lock.call(canvas, { unadjustedMovement: true })).catch(() => {
        void Promise.resolve(lock.call(canvas)).catch(() => undefined);
      });
    } catch {
      lock.call(canvas);
    }
  };
  document.addEventListener('pointerlockchange', () => {
    // Releasing the lock (Esc) returns to the normal view.
    if (!document.pointerLockElement && renderer.viewMode !== 'top') setView('top');
  });

  const playable = () => !paused && state.status === 'playing' && !perks.isOpen && !menu.isOpen;

  /** The unit the inventory opens on: controlled, else first selected, else first alive. */
  const inventoryFocus = () =>
    localPlayer(state).controlledId ??
    [...rts.selected][0] ??
    state.soldiers.find((s) => !s.dead)?.id ??
    null;

  /** The crate the controlled unit is close enough to open, if any. */
  const crateInReach = () => {
    const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
    return unit && !unit.dead ? nearestCrate(state, unit.pos, config.drops.pickupRange) : undefined;
  };

  window.addEventListener('keydown', (e) => {
    if (settingsPanel.isOpen) {
      if (e.code === 'Escape' || e.code === 'KeyO') settingsPanel.close();
      return;
    }
    if (menu.isOpen && e.code === 'KeyO') {
      openSettings();
      return;
    }
    if (menu.onKey(e.code)) return;
    if (editor.isEditing) {
      if (e.code === 'KeyY' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        toggleEditorControl();
      }
      return;
    }
    if (perks.onKey(e.code)) return;
    if (e.code === 'KeyN' && playable() && !modalOpen() && !e.repeat) build.toggle();
    else if (e.code === 'KeyR' && build.isArmed) build.rotate();
    else if (e.code === 'KeyM') sfx.toggleMute();
    else if (e.code === 'Escape' && build.cancel()) return;
    else if (e.code === 'Escape' && rts.grenadeAiming) rts.cancelGrenadeAim();
    else if (e.code === 'Escape' && ui.isOpen) ui.close();
    else if (e.code === 'Escape' && shop.isOpen) shop.close();
    else if (e.code === 'KeyB') {
      if (shop.isOpen) shop.close();
      else if (playable() && !ui.isOpen && shopAvailable(state)) shop.show(inventoryFocus());
    } else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    else if (e.code === 'KeyO') {
      if (!modalOpen()) openSettings();
    } else if (e.code === 'KeyI') {
      // The same screen as pausing: the squad, their inventories and your bonuses.
      if (!modalOpen()) setPaused(!paused);
    } else if (e.code === 'KeyV') {
      // Climb into the closest vehicle, or step out of the one you are in.
      if (playable() && !modalOpen()) {
        const controlled = localPlayer(state).controlledId;
        for (const id of controlled !== null ? [controlled] : [...rts.selected]) {
          toggleVehicle(state, config, id);
        }
      }
    } else if (e.code === 'KeyG') {
      // Direct control: grab a downed or dead ally by the shoulders and drag it, or let go.
      // RTS: aim a grenade with the selected units (the next click throws it).
      const controlled = localPlayer(state).controlledId;
      if (playable() && !modalOpen()) {
        if (controlled !== null) toggleDrag(state, config, controlled);
        else if (!e.repeat) rts.toggleGrenadeAim();
      }
    } else if (e.code === 'KeyQ') {
      // Direct control: lob a grenade at the aim point, like a Call of Duty frag.
      const controlled = localPlayer(state).controlledId;
      if (playable() && !modalOpen() && controlled !== null && !e.repeat) {
        throwGrenade(state, config, controlled, readInput().aim);
      }
    } else if (e.code === 'KeyF') {
      // Direct control: strike the nearest enemy in front (RTS keeps F for "follow").
      const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
      if (playable() && !modalOpen() && unit && !e.repeat) meleeStrike(state, config, unit);
    } else if (e.code === 'KeyR') {
      // Direct control: reload the gun in hand from the backpack's ammo.
      const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
      if (playable() && !modalOpen() && unit && !e.repeat) startReload(state, config, unit);
    } else if (e.code === 'KeyE') {
      // The action key: close an open crate, else use the closest thing in reach.
      const unitId = localPlayer(state).controlledId;
      if (ui.isOpen) ui.close();
      else if (playable() && !modalOpen() && unitId !== null && !e.repeat) {
        const crateId = useNearest(state, config, unitId);
        if (crateId !== null) ui.openCrate(unitId, crateId);
      }
    } else if (
      e.code === 'KeyT' &&
      playable() &&
      !modalOpen() &&
      localPlayer(state).controlledId !== null
    ) {
      setView(NEXT_VIEW[renderer.viewMode]);
    } else if (e.code === 'KeyY' && playable() && !modalOpen()) toggleControl();
  });
  window.addEventListener('blur', () => {
    if (!editor.isEditing) setPaused(true);
  });

  new CameraControls(renderer.domElement, renderer, () => editor.ownsRightDrag);

  const blank = (): Input => ({
    move: { x: 0, z: 0 },
    aim: { x: 0, z: 0 },
    firing: false,
    crouch: false,
    sprint: false,
    jump: false,
  });
  const noInput = blank();
  const directInput = blank();
  let aimToggled = false;

  /** Keyboard/mouse input with movement rotated to follow the camera's orbit. */
  const readInput = (): Input => {
    const raw = input.read(renderer.screenToGround);
    directInput.move = renderer.screenToWorldDir(raw.move.x, raw.move.z);
    const unit = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
    // In first/third person the view direction is the aim; top-down uses the cursor on the ground.
    directInput.aim =
      renderer.viewMode !== 'top' && unit ? renderer.lookAimPoint(unit.pos) : raw.aim;
    // Clicks edit the map in the editor, so the driven unit does not fire there.
    directInput.firing = raw.firing && !editor.isEditing && !build.isArmed;
    directInput.aimLine = renderer.sightLine() ?? undefined;
    // Aiming down the sights: the right button, only in third and first person.
    const presses = input.takeAimPresses();
    if (renderer.viewMode === 'top' || unit?.aimBroken || !settings.aimToggle) aimToggled = false;
    else if (presses % 2 === 1) aimToggled = !aimToggled;
    directInput.aiming =
      renderer.viewMode !== 'top' &&
      !editor.isEditing &&
      (settings.aimToggle ? aimToggled : input.aimButton);
    if (mobile && unit) {
      // No cursor: aim at the nearest enemy and keep firing; otherwise face the way we walk.
      let best: { x: number; z: number } | null = null;
      let bestDist = MOBILE_AIM_RANGE;
      for (const z of state.zombies) {
        if (z.state === 'death') continue;
        const d = Math.hypot(z.pos.x - unit.pos.x, z.pos.z - unit.pos.z);
        if (d < bestDist) {
          bestDist = d;
          best = z.pos;
        }
      }
      const m = directInput.move;
      if (best) directInput.aim = best;
      else if (m.x !== 0 || m.z !== 0)
        directInput.aim = { x: unit.pos.x + m.x, z: unit.pos.z + m.z };
      else
        directInput.aim = {
          x: unit.pos.x + Math.sin(unit.facing),
          z: unit.pos.z + Math.cos(unit.facing),
        };
      directInput.firing = best !== null;
      if (renderer.viewMode !== 'top') {
        // The look pad aims: keep the view's aim point and fire only at an enemy near the line of sight.
        const aim = renderer.lookAimPoint(unit.pos);
        const ax = aim.x - unit.pos.x;
        const az = aim.z - unit.pos.z;
        directInput.aim = aim;
        directInput.firing =
          best !== null &&
          (ax * (best.x - unit.pos.x) + az * (best.z - unit.pos.z)) /
            (Math.hypot(ax, az) * bestDist) >
            MOBILE_LOOK_FIRE_COS;
      }
    }
    directInput.autoTrigger = mobile;
    directInput.crouch = raw.crouch;
    directInput.sprint = raw.sprint;
    directInput.walk = raw.walk;
    directInput.jump = raw.jump;
    return directInput;
  };

  startLoop(
    (dt) => {
      const overlay =
        menu.isOpen || ui.isOpen || perks.isOpen || shop.isOpen || settingsPanel.isOpen;
      // The editor keeps the sandbox running so a unit can be driven while editing.
      if (paused || overlay || (modalOpen() && !editor.isEditing)) return;
      if (mobile) ensureMobileLeader();
      const direct = localPlayer(state).controlledId !== null;
      step(state, config, direct ? readInput() : noInput, dt);
      renderer.onStep(state);
      hud.onStep(state);
      damageNumbers.onStep(state);
      sfx.onStep(state);
      for (const e of state.events) {
        if (e.type === 'tooHeavy') {
          rts.notice = `Too heavy: needs ${e.needed} strength`;
        } else if (e.type === 'doorDenied') {
          rts.notice =
            e.reason === 'locked'
              ? `Locked: needs ${e.key ? itemDef(config, e.key).name : 'a key'}`
              : e.reason === 'powered'
                ? 'Powered: use its switch'
                : 'Something is in the doorway';
        } else continue;
        rts.noticeUntil = performance.now() + 2500;
      }
      // A soldier sent to a crate has arrived: open it for them.
      for (const e of state.events) {
        if (e.type === 'crateReached' && playable() && !modalOpen())
          ui.openCrate(e.soldierId, e.crateId);
      }
      if (state.events.some((e) => e.type === 'soldierHurt')) mobileUi?.vibrate(35);
    },
    (alpha, frameDt) => {
      const rtsMode = localPlayer(state).controlledId === null;
      if (rtsMode && !paused) {
        const move = readInput().move;
        renderer.pan(move.x * PAN_SPEED * frameDt, move.z * PAN_SPEED * frameDt);
      }
      // Back to the normal view if control ends (RTS mode, death, game over).
      if (
        renderer.viewMode !== 'top' &&
        (localPlayer(state).controlledId === null || state.status !== 'playing')
      ) {
        setView('top');
      }
      const look = input.takeLook();
      if (!paused && !modalOpen()) renderer.look(look.x, look.y);
      perks.update();
      pausePanel.update(paused, state);
      unitsScreen.update(paused);
      radar.update(state, paused || modalOpen() ? 0 : frameDt);
      const shooter = state.soldiers.find((s) => s.id === localPlayer(state).controlledId);
      hud.setCrosshair(renderer.viewMode !== 'top' && shooter !== undefined);
      if (shooter) {
        hud.setCrosshairError(aimErrorOf(state, config, shooter) ?? 0);
        renderer.setAimZoom(shooter.aiming ? aimZoomOf(config, shooter) : 1);
      } else renderer.setAimZoom(1);
      rts.prune();
      rts.updateHover();
      if (localPlayer(state).controlledId !== null || paused || modalOpen()) rts.cancelGrenadeAim();
      if (paused || state.status !== 'playing') build.close();
      renderer.setGrenadePreview(rts.grenadePreview());
      build.update();
      renderer.setBuildGhost(build.ghost());
      renderer.render(state, alpha, frameDt);
      damageNumbers.update(paused ? 0 : frameDt);
      fps.tick(frameDt);

      const crate = !modalOpen() && playable() ? crateInReach() : undefined;
      mobileUi?.setCrateReady(crate !== undefined);
      mobileUi?.setMenuOpen(paused || modalOpen());
      if (crate) {
        const p = renderer.projectToScreen(crate.pos.x, crate.pos.z, 1.5);
        if (p) cratePrompt.show(p.x, p.z);
        else cratePrompt.hide();
      } else {
        cratePrompt.hide();
      }

      const unit = getSoldier(state, localPlayer(state).controlledId);
      const nearVehicle =
        !modalOpen() && playable() && unit && !unit.dead && unit.vehicleId === null
          ? vehicleInReach(state, config, unit.pos)
          : undefined;
      if (nearVehicle) {
        const p = renderer.projectToScreen(nearVehicle.pos.x, nearVehicle.pos.z, 2.5);
        if (p) vehiclePrompt.show(p.x, p.z);
        else vehiclePrompt.hide();
      } else {
        vehiclePrompt.hide();
      }
      const carry = unit?.carrying;
      const carryHint = carry
        ? carry.kind === 'object'
          ? `  [HOLDING ${objectDef(config, getObject(state, carry.id)!).name.toUpperCase()} · click: throw · E: put down]`
          : '  [CARRYING A BODY · E: put down]'
        : '';
      const ride = getVehicle(state, unit?.vehicleId ?? null);
      const rideHint = ride
        ? `  [${config.vehicles[ride.type]!.name.toUpperCase()} ${Math.round((ride.health / ride.maxHealth) * 100)}% · V: get out]`
        : '';

      const focusId = localPlayer(state).controlledId ?? [...rts.selected][0] ?? null;
      hud.update(state, focusId);
      const stance = state.stance === 'normal' ? '' : `  [${state.stance.toUpperCase()}]`;
      const view =
        renderer.viewMode === 'top' ? '' : `  [${renderer.viewMode.toUpperCase()} PERSON]`;
      const aimHint = rts.grenadeAiming
        ? '  [GRENADE: click to throw · Shift+click keeps aiming · G / Esc / right-click cancels]'
        : performance.now() < rts.noticeUntil
          ? `  [${rts.notice}]`
          : '';
      hud.setHint(
        (rtsMode ? HINT_RTS : HINT_DIRECT) + stance + view + rideHint + carryHint + aimHint,
      );
      squad.update(state, rts.selected, maxHealthOf(state, config));
    },
  );
}

void main();
