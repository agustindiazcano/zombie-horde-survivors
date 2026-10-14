import characters from '../data/characters.json';
import data from '../data/game.json';
import { Sfx } from './audio';
import { Hud } from './hud';
import { InputController } from './input';
import { startLoop } from './loop';
import { GltfAssetLoader } from './render/assetLoader';
import { parseCharactersConfig } from './render/characterConfig';
import { GameRenderer } from './render/gameRenderer';
import { RtsController } from './rts';
import {
  controlSoldier,
  createGame,
  orderFollow,
  orderHold,
  parseConfig,
  step,
  type Input,
} from './sim';
import { SquadPanel } from './squadPanel';

/** Camera pan speed in RTS mode (world units per second). */
const PAN_SPEED = 22;

const HINT_DIRECT = 'Direct control · WASD move · Mouse aim · Click fire · Y: back to RTS';
const HINT_RTS =
  'RTS · WASD pan · Click/drag select · Right-click move · F follow · E all · 1-9 pick · Y: control selected';

async function main(): Promise<void> {
  const config = parseConfig(data);
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  let state = createGame(config, Date.now());
  let paused = false;
  const renderer = new GameRenderer(document.body, config, factories);
  const input = new InputController(renderer.domElement);
  const sfx = new Sfx();
  const rts = new RtsController(
    renderer.domElement,
    renderer,
    config,
    () => state,
    () => state.controlledId === null && state.status === 'playing' && !paused,
  );
  const hud = new Hud(document.body, config, () => {
    state = createGame(config, Date.now());
    hud.reset();
    rts.set([]);
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

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') sfx.toggleMute();
    else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    else if (e.code === 'KeyY' && !paused && state.status === 'playing') toggleControl();
  });
  window.addEventListener('blur', () => setPaused(true));

  const noInput: Input = { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, firing: false };

  startLoop(
    (dt) => {
      if (paused) return;
      const direct = state.controlledId !== null;
      step(state, config, direct ? input.read(renderer.screenToGround) : noInput, dt);
      renderer.onStep(state);
      hud.onStep(state);
      sfx.onStep(state);
    },
    (alpha, frameDt) => {
      const rtsMode = state.controlledId === null;
      if (rtsMode && !paused) {
        const move = input.read(renderer.screenToGround).move;
        renderer.pan(move.x * PAN_SPEED * frameDt, move.z * PAN_SPEED * frameDt);
      }
      rts.prune();
      renderer.render(state, alpha, frameDt);

      const focusId = state.controlledId ?? [...rts.selected][0] ?? null;
      hud.update(state, focusId);
      hud.setHint(rtsMode ? HINT_RTS : HINT_DIRECT);
      squad.update(state, rts.selected, config.player.maxHealth);
    },
  );
}

void main();
