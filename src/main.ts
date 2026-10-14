import characters from '../data/characters.json';
import data from '../data/game.json';
import { Sfx } from './audio';
import { FpsCounter } from './fps';
import { Hud } from './hud';
import { MainMenu } from './mainMenu';
import { isMobile, MobileControls } from './mobile';
import { InputController } from './input';
import { CameraControls } from './cameraControls';
import { CratePrompt, InventoryUi } from './inventoryUi';
import { startLoop } from './loop';
import { GltfAssetLoader } from './render/assetLoader';
import { parseCharactersConfig } from './render/characterConfig';
import { GameRenderer, type ViewMode } from './render/gameRenderer';
import { RtsController } from './rts';
import {
  controlSoldier,
  createGame,
  maxHealthOf,
  nearestCrate,
  shopAvailable,
  orderFollow,
  orderHold,
  parseConfig,
  step,
  type Input,
} from './sim';
import { SquadPanel } from './squadPanel';
import { UnitsScreen } from './unitsScreen';
import { PausePanel } from './pausePanel';
import { loadSettings, saveSettings, type Settings } from './settings';
import { SettingsPanel } from './settingsPanel';
import { Radar } from './radar';
import { PerkPicker, Shop } from './upgradesUi';

/** Mobile: enemies within this distance (world units) are shot at automatically. */
const MOBILE_AIM_RANGE = 22;

/** Camera pan speed in RTS mode (world units per second). */
const PAN_SPEED = 22;

const HINT_DIRECT =
  'Direct control · WASD move · Mouse aim · Click fire · Ctrl/C: crouch · Shift: sprint · Space: jump · T: change view · Y: back to RTS · I: squad & inventories · E: open crate · B: shop (between waves) · Wheel: zoom · Right-drag: rotate/tilt';
const HINT_RTS =
  'RTS · WASD pan · Click/drag select · Right-click move · F follow · E all · 1-9 pick · Y: control selected · I: squad & inventories · B: shop (between waves) · Wheel: zoom · Right-drag: rotate/tilt';

async function main(): Promise<void> {
  const config = parseConfig(data);
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  let state = createGame(config, Date.now());
  let paused = false;
  const renderer = new GameRenderer(document.body, config, factories);
  const input = new InputController(renderer.domElement);
  const sfx = new Sfx();
  const fps = new FpsCounter(document.body);

  // Player options (graphics, lighting, FPS counter, volume), saved in the browser.
  let settings = loadSettings();
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
  const pausePanel = new PausePanel(document.body, config, openSettings);
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
    () => state.controlledId ?? [...rts.selected][0] ?? null,
  );
  const perks = new PerkPicker(document.body, config, () => state);
  const shop = new Shop(document.body, config, () => state);
  /** Any full-screen menu: the game is frozen and keyboard shortcuts are off. */
  // A random soldier floats next to the title, a different one on each visit.
  const preview = factories.soldiers[Math.floor(Math.random() * factories.soldiers.length)];
  const menu = new MainMenu(document.body, () => undefined, preview, openSettings);
  const modalOpen = () =>
    menu.isOpen || ui.isOpen || perks.isOpen || shop.isOpen || settingsPanel.isOpen;
  const rts = new RtsController(
    renderer.domElement,
    renderer,
    config,
    () => state,
    () => state.controlledId === null && state.status === 'playing' && !paused && !modalOpen(),
  );
  const hud = new Hud(document.body, config, () => {
    state = createGame(config, Date.now());
    hud.reset();
    rts.set([]);
    ui.close();
    shop.close();
  });
  const squad = new SquadPanel(document.body, (id, additive) => {
    if (state.controlledId === null) rts.toggle(id, additive);
  });

  const setPaused = (value: boolean) => {
    paused = value && state.status === 'playing' && !menu.isOpen;
    hud.setPaused(paused);
  };

  const mobile = isMobile();
  if (mobile) {
    // Touch play: one joystick moves the whole squad; the leader auto-aims and everyone fires.
    new MobileControls(document.body, {
      onMove: (x, z) => input.setTouchMove(x, z),
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
    });
  }

  /** Mobile: keeps a living soldier in control, with the rest of the squad following it. */
  const ensureMobileLeader = () => {
    if (state.status !== 'playing' || state.controlledId !== null) return;
    const leader = state.soldiers.find((s) => !s.dead && s.kind !== 'drone');
    if (!leader) return;
    controlSoldier(state, leader.id);
    orderFollow(
      state,
      state.soldiers.filter((s) => !s.dead && s.id !== leader.id).map((s) => s.id),
    );
  };

  /** Y: take direct control of the first selected soldier, or go back to RTS mode. */
  const toggleControl = () => {
    if (state.controlledId !== null) {
      controlSoldier(state, null);
      return;
    }
    const [first, ...others] = [...rts.selected];
    if (first === undefined) return;
    controlSoldier(state, first);
    if (state.controlledId === null) return;
    // Only the soldiers selected beforehand follow the controlled one; the rest stay put.
    orderFollow(state, others);
    orderHold(
      state,
      state.soldiers
        .filter((s) => !rts.selected.has(s.id) && s.order.type === 'follow')
        .map((s) => s.id),
    );
  };

  /** Normal -> third person -> first person -> normal. Only while controlling a unit. */
  const NEXT_VIEW: Record<ViewMode, ViewMode> = { top: 'third', third: 'first', first: 'top' };
  const setView = (mode: ViewMode) => {
    const unit = state.soldiers.find((s) => s.id === state.controlledId);
    renderer.setViewMode(mode, unit?.facing ?? 0);
    input.takeLook(); // drop movement accumulated before the switch
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
    state.controlledId ?? [...rts.selected][0] ?? state.soldiers.find((s) => !s.dead)?.id ?? null;

  /** The crate the controlled unit is close enough to open, if any. */
  const crateInReach = () => {
    const unit = state.soldiers.find((s) => s.id === state.controlledId);
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
    if (perks.onKey(e.code)) return;
    if (e.code === 'KeyM') sfx.toggleMute();
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
    } else if (e.code === 'KeyE') {
      const crate = crateInReach();
      if (ui.isOpen) ui.close();
      else if (playable() && !shop.isOpen && crate && state.controlledId !== null) {
        ui.openCrate(state.controlledId, crate.id);
      }
    } else if (e.code === 'KeyT' && playable() && !modalOpen() && state.controlledId !== null) {
      setView(NEXT_VIEW[renderer.viewMode]);
    } else if (e.code === 'KeyY' && playable() && !modalOpen()) toggleControl();
  });
  window.addEventListener('blur', () => setPaused(true));

  new CameraControls(renderer.domElement, renderer);

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

  /** Keyboard/mouse input with movement rotated to follow the camera's orbit. */
  const readInput = (): Input => {
    const raw = input.read(renderer.screenToGround);
    directInput.move = renderer.screenToWorldDir(raw.move.x, raw.move.z);
    const unit = state.soldiers.find((s) => s.id === state.controlledId);
    // In first/third person the view direction is the aim; top-down uses the cursor on the ground.
    directInput.aim =
      renderer.viewMode !== 'top' && unit ? renderer.lookAimPoint(unit.pos) : raw.aim;
    directInput.firing = raw.firing;
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
    }
    directInput.crouch = raw.crouch;
    directInput.sprint = raw.sprint;
    directInput.jump = raw.jump;
    return directInput;
  };

  startLoop(
    (dt) => {
      if (paused || modalOpen()) return;
      if (mobile) ensureMobileLeader();
      const direct = state.controlledId !== null;
      step(state, config, direct ? readInput() : noInput, dt);
      renderer.onStep(state);
      hud.onStep(state);
      sfx.onStep(state);
    },
    (alpha, frameDt) => {
      const rtsMode = state.controlledId === null;
      if (rtsMode && !paused) {
        const move = readInput().move;
        renderer.pan(move.x * PAN_SPEED * frameDt, move.z * PAN_SPEED * frameDt);
      }
      // Back to the normal view if control ends (RTS mode, death, game over).
      if (
        renderer.viewMode !== 'top' &&
        (state.controlledId === null || state.status !== 'playing')
      ) {
        setView('top');
      }
      const look = input.takeLook();
      if (!paused && !modalOpen()) renderer.look(look.x, look.y);
      perks.update();
      pausePanel.update(paused, state);
      unitsScreen.update(paused);
      radar.update(state, paused || modalOpen() ? 0 : frameDt);
      hud.setCrosshair(renderer.viewMode !== 'top' && state.controlledId !== null);
      rts.prune();
      renderer.render(state, alpha, frameDt);
      fps.tick(frameDt);

      const crate = !modalOpen() && playable() ? crateInReach() : undefined;
      if (crate) {
        const p = renderer.projectToScreen(crate.pos.x, crate.pos.z, 1.5);
        if (p) cratePrompt.show(p.x, p.z);
        else cratePrompt.hide();
      } else {
        cratePrompt.hide();
      }

      const focusId = state.controlledId ?? [...rts.selected][0] ?? null;
      hud.update(state, focusId);
      const stance = state.stance === 'normal' ? '' : `  [${state.stance.toUpperCase()}]`;
      const view =
        renderer.viewMode === 'top' ? '' : `  [${renderer.viewMode.toUpperCase()} PERSON]`;
      hud.setHint((rtsMode ? HINT_RTS : HINT_DIRECT) + stance + view);
      squad.update(state, rts.selected, maxHealthOf(state, config));
    },
  );
}

void main();
