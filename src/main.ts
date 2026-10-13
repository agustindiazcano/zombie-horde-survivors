import data from '../data/game.json';
import { InputController } from './input';
import { startLoop } from './loop';
import { createPlaceholderSoldier, createPlaceholderZombie } from './render/characters';
import { GameRenderer } from './render/gameRenderer';
import { createGame, parseConfig, step } from './sim';

const config = parseConfig(data);
const state = createGame(config, Date.now());
const renderer = new GameRenderer(document.body, config, {
  player: createPlaceholderSoldier,
  zombie: createPlaceholderZombie,
});
const input = new InputController(renderer.domElement);

startLoop(
  (dt) => {
    step(state, config, input.read(renderer.screenToGround), dt);
    renderer.onStep(state);
  },
  (alpha, frameDt) => renderer.render(state, alpha, frameDt),
);
