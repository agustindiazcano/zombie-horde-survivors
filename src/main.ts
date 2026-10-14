import characters from '../data/characters.json';
import data from '../data/game.json';
import { Sfx } from './audio';
import { FpsCounter } from './fps';
import { Hud } from './hud';
import { MainMenu } from './mainMenu';
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
import { PausePanel } from './pausePanel';
import { PerkPicker, Shop } from './upgradesUi';

/** Camera pan speed in RTS mode (world units per second). */
const PAN_SPEED = 22;

const HINT_DIRECT =
  'Direct control · WASD move · Mouse aim · Click fire · Ctrl/C: crouch · Shift: sprint · Space: jump · T: change view · Y: back to RTS · I: inventory · E: open crate · B: shop (between waves) · Wheel: zoom · Right-drag: rotate/tilt';
const HINT_RTS =
  'RTS · WASD pan · Click/drag select · Right-click move · F follow · E all · 1-9 pick · Y: control selected · I: inventory · B: shop (between waves) · Wheel: zoom · Right-drag: rotate/tilt';

async function main(): Promise<void> {
  const config = parseConfig(data);
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  let state = createGame(config, Date.now());
  let paused = false;
  const renderer = new GameRenderer(document.body, config, factories);
  const input = new InputController(renderer.domElement);
  const sfx = new Sfx();
  const fps = new FpsCounter(document.body);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      fps.toggle();
    }
  });
  const ui = new InventoryUi(document.body, config, () => state);
  const cratePrompt = new CratePrompt();
  const pausePanel = new PausePanel(document.body, config);
  const perks = new PerkPicker(document.body, config, () => state);
  const shop = new Shop(document.body, config, () => state);
  /** Any full-screen menu: the game is frozen and keyboard shortcuts are off. */
  const menu = new MainMenu(document.body, () => undefined);
  const modalOpen = () => menu.isOpen || ui.isOpen || perks.isOpen || shop.isOpen;
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
    if (menu.onKey(e.code)) return;
    if (perks.onKey(e.code)) return;
    if (e.code === 'KeyM') sfx.toggleMute();
    else if (e.code === 'Escape' && ui.isOpen) ui.close();
    else if (e.code === 'Escape' && shop.isOpen) shop.close();
    else if (e.code === 'KeyB') {
      if (shop.isOpen) shop.close();
      else if (playable() && !ui.isOpen && shopAvailable(state)) shop.show(inventoryFocus());
    } else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    else if (e.code === 'KeyI') {
      const focus = inventoryFocus();
      if (ui.isOpen) ui.close();
      else if (playable() && !shop.isOpen && focus !== null) ui.openInventory(focus);
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
    directInput.crouch = raw.crouch;
    directInput.sprint = raw.sprint;
    directInput.jump = raw.jump;
    return directInput;
  };

  startLoop(
    (dt) => {
      if (paused || modalOpen()) return;
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
