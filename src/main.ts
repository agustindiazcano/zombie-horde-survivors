import characters from '../data/characters.json';
import data from '../data/game.json';
import { Sfx } from './audio';
import { Hud } from './hud';
import { InputController } from './input';
import { CameraControls } from './cameraControls';
import { CratePrompt, InventoryUi } from './inventoryUi';
import { startLoop } from './loop';
import { GltfAssetLoader } from './render/assetLoader';
import { parseCharactersConfig } from './render/characterConfig';
import { GameRenderer } from './render/gameRenderer';
import { RtsController } from './rts';
import {
  controlSoldier,
  createGame,
  nearestCrate,
  orderFollow,
  orderHold,
  parseConfig,
  step,
  type Input,
} from './sim';
import { SquadPanel } from './squadPanel';

/** Camera pan speed in RTS mode (world units per second). */
const PAN_SPEED = 22;

const HINT_DIRECT =
  'Direct control · WASD move · Mouse aim · Click fire · Ctrl/C: crouch · Shift: sprint · Space: jump · Y: back to RTS · I: inventory · E: open crate · Wheel: zoom · Right-drag: rotate/tilt';
const HINT_RTS =
  'RTS · WASD pan · Click/drag select · Right-click move · F follow · E all · 1-9 pick · Y: control selected · I: inventory · Wheel: zoom · Right-drag: rotate/tilt';

async function main(): Promise<void> {
  const config = parseConfig(data);
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  let state = createGame(config, Date.now());
  let paused = false;
  const renderer = new GameRenderer(document.body, config, factories);
  const input = new InputController(renderer.domElement);
  const sfx = new Sfx();
  const ui = new InventoryUi(document.body, config, () => state);
  const cratePrompt = new CratePrompt();
  const rts = new RtsController(
    renderer.domElement,
    renderer,
    config,
    () => state,
    () => state.controlledId === null && state.status === 'playing' && !paused && !ui.isOpen,
  );
  const hud = new Hud(document.body, config, () => {
    state = createGame(config, Date.now());
    hud.reset();
    rts.set([]);
    ui.close();
  });
  const squad = new SquadPanel(document.body, (id, additive) => {
    if (state.controlledId === null) rts.toggle(id, additive);
  });

  const setPaused = (value: boolean) => {
    paused = value && state.status === 'playing';
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

  const playable = () => !paused && state.status === 'playing';

  /** The unit the inventory opens on: controlled, else first selected, else first alive. */
  const inventoryFocus = () =>
    state.controlledId ?? [...rts.selected][0] ?? state.soldiers.find((s) => !s.dead)?.id ?? null;

  /** The crate the controlled unit is close enough to open, if any. */
  const crateInReach = () => {
    const unit = state.soldiers.find((s) => s.id === state.controlledId);
    return unit && !unit.dead ? nearestCrate(state, unit.pos, config.drops.pickupRange) : undefined;
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') sfx.toggleMute();
    else if (e.code === 'Escape' && ui.isOpen) ui.close();
    else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    else if (e.code === 'KeyI') {
      const focus = inventoryFocus();
      if (ui.isOpen) ui.close();
      else if (playable() && focus !== null) ui.openInventory(focus);
    } else if (e.code === 'KeyE') {
      const crate = crateInReach();
      if (ui.isOpen) ui.close();
      else if (playable() && crate && state.controlledId !== null) {
        ui.openCrate(state.controlledId, crate.id);
      }
    } else if (e.code === 'KeyY' && playable() && !ui.isOpen) toggleControl();
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
    directInput.aim = raw.aim;
    directInput.firing = raw.firing;
    directInput.crouch = raw.crouch;
    directInput.sprint = raw.sprint;
    directInput.jump = raw.jump;
    return directInput;
  };

  startLoop(
    (dt) => {
      if (paused || ui.isOpen) return;
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
      rts.prune();
      renderer.render(state, alpha, frameDt);

      const crate = !ui.isOpen && playable() ? crateInReach() : undefined;
      if (crate) {
        const p = renderer.worldToScreen(crate.pos.x, crate.pos.z, 1.5);
        cratePrompt.show(p.x, p.z);
      } else {
        cratePrompt.hide();
      }

      const focusId = state.controlledId ?? [...rts.selected][0] ?? null;
      hud.update(state, focusId);
      const stance = state.stance === 'normal' ? '' : `  [${state.stance.toUpperCase()}]`;
      hud.setHint((rtsMode ? HINT_RTS : HINT_DIRECT) + stance);
      squad.update(state, rts.selected, config.player.maxHealth);
    },
  );
}

void main();
