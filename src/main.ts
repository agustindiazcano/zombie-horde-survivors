import characters from '../data/characters.json';
import data from '../data/game.json';
import { Hud } from './hud';
import { InputController } from './input';
import { startLoop } from './loop';
import { GltfAssetLoader } from './render/assetLoader';
import { parseCharactersConfig } from './render/characterConfig';
import { GameRenderer } from './render/gameRenderer';
import { createGame, parseConfig, step } from './sim';

async function main(): Promise<void> {
  const config = parseConfig(data);
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  let state = createGame(config, Date.now());
  const renderer = new GameRenderer(document.body, config, factories);
  const input = new InputController(renderer.domElement);
  const hud = new Hud(document.body, config, () => {
    state = createGame(config, Date.now());
    hud.reset();
  });

  startLoop(
    (dt) => {
      step(state, config, input.read(renderer.screenToGround), dt);
      renderer.onStep(state);
      hud.onStep(state);
    },
    (alpha, frameDt) => {
      renderer.render(state, alpha, frameDt);
      hud.update(state);
    },
  );
}

void main();
