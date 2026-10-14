import characters from '../data/characters.json';
import data from '../data/game.json';
import { InputController } from './input';
import { startLoop } from './loop';
import { GltfAssetLoader } from './render/assetLoader';
import { parseCharactersConfig } from './render/characterConfig';
import { GameRenderer } from './render/gameRenderer';
import { createGame, parseConfig, step } from './sim';

async function main(): Promise<void> {
  const config = parseConfig(data);
  const factories = await new GltfAssetLoader().loadCharacters(parseCharactersConfig(characters));

  const state = createGame(config, Date.now());
  const renderer = new GameRenderer(document.body, config, factories);
  const input = new InputController(renderer.domElement);

  startLoop(
    (dt) => {
      step(state, config, input.read(renderer.screenToGround), dt);
      renderer.onStep(state);
    },
    (alpha, frameDt) => renderer.render(state, alpha, frameDt),
  );
}

void main();
