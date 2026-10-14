import data from '../data/game.json';
import { startLoop } from './loop';
import { createPlaceholderSoldier, createPlaceholderZombie } from './render/characters';
import { GameRenderer } from './render/gameRenderer';
import { createGame, parseConfig, step, type Input } from './sim';

const config = parseConfig(data);
const state = createGame(config, Date.now());
const renderer = new GameRenderer(document.body, config, {
  player: createPlaceholderSoldier,
  zombie: createPlaceholderZombie,
});

// Real keyboard/mouse input arrives in the input task; until then the player stands still.
const input: Input = { move: { x: 0, z: 0 }, aim: { x: 0, z: 1 }, firing: false };

startLoop(
  (dt) => step(state, config, input, dt),
  (alpha, frameDt) => renderer.render(state, alpha, frameDt),
);
