import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationController } from './animationController';
import type { CharacterSpec, CharactersConfig } from './characterConfig';
import {
  createPlaceholderDrone,
  createPlaceholderSoldier,
  createPlaceholderZombie,
  type CharacterFactory,
  type CharacterView,
} from './characters';

export interface CharacterFactories {
  /** One factory per soldier slot; soldier N uses entry (N - 1) modulo the length. */
  soldiers: CharacterFactory[];
  zombie: CharacterFactory;
  drone: CharacterFactory;
}

/** What the game depends on; swap the implementation to change where assets come from. */
export interface AssetLoader {
  loadCharacters(config: CharactersConfig): Promise<CharacterFactories>;
}

function createModelFactory(gltf: GLTF, spec: CharacterSpec): CharacterFactory {
  return (): CharacterView => {
    const root = new THREE.Group();
    // Skinned meshes need SkeletonUtils.clone; a plain clone would share one skeleton.
    const model = clone(gltf.scene);
    model.scale.setScalar(spec.scale);
    model.rotation.y = spec.yawOffset;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    root.add(model);

    const animation = new AnimationController(model, gltf.animations, spec);
    return {
      object: root,
      setState: (state) => animation.setState(state),
      update: (dt) => animation.update(dt),
    };
  };
}

/** Loads glTF/GLB models from public/; any character without a model (or that fails) uses a placeholder. */
export class GltfAssetLoader implements AssetLoader {
  private readonly loader = new GLTFLoader();

  async loadCharacters(config: CharactersConfig): Promise<CharacterFactories> {
    const [soldiers, zombie, drone] = await Promise.all([
      Promise.all(config.soldiers.map((spec) => this.load(spec, createPlaceholderSoldier))),
      this.load(config.zombie, createPlaceholderZombie),
      this.load(config.drone, createPlaceholderDrone),
    ]);
    return { soldiers, zombie, drone };
  }

  private async load(
    spec: CharacterSpec,
    placeholder: CharacterFactory,
  ): Promise<CharacterFactory> {
    if (!spec.model) return placeholder;
    try {
      const gltf = await this.loader.loadAsync(import.meta.env.BASE_URL + spec.model);
      return createModelFactory(gltf, spec);
    } catch (err) {
      console.warn(`Could not load "${spec.model}", using placeholder`, err);
      return placeholder;
    }
  }
}
