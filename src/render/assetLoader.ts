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
  /** By enemy variant id; always contains 'zombie'. */
  enemies: Record<string, CharacterFactory>;
  drone: CharacterFactory;
}

/** What the game depends on; swap the implementation to change where assets come from. */
export interface AssetLoader {
  loadCharacters(config: CharactersConfig): Promise<CharacterFactories>;
}

/** Code-driven squirm for static models (e.g. the worm): sways while alive, squashes on death. */
function createWiggleView(root: THREE.Group, model: THREE.Object3D, scale: number): CharacterView {
  let t = Math.random() * 10;
  let state = '';
  let stateTime = 0;
  return {
    object: root,
    setState(next) {
      if (next === state) return;
      state = next;
      stateTime = 0;
    },
    update(dt) {
      t += dt;
      stateTime += dt;
      const speed = state === 'attack' ? 14 : 5;
      model.rotation.z = Math.sin(t * speed) * 0.18;
      model.scale.set(
        scale * (1 + Math.sin(t * speed * 2) * 0.05),
        scale * (1 + Math.sin(t * speed + 1) * 0.12),
        scale,
      );
      if (state === 'death') {
        const k = Math.min(stateTime / 0.4, 1);
        model.scale.y = scale * (1 - 0.85 * k);
      }
    },
  };
}

/** Static flying machine: bobs in place and pitches its nose down while moving. */
function createHoverView(root: THREE.Group, model: THREE.Object3D): CharacterView {
  let t = Math.random() * 10;
  let moving = false;
  return {
    object: root,
    setState(next) {
      moving = next === 'run';
    },
    update(dt) {
      t += dt;
      model.position.y = Math.sin(t * 3) * 0.08;
      model.rotation.z = Math.sin(t * 1.7) * 0.06;
      const pitch = moving ? 0.3 : 0;
      root.rotation.x += (pitch - root.rotation.x) * Math.min(1, dt * 8);
    },
  };
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

    if (spec.procedural === 'wiggle') return createWiggleView(root, model, spec.scale);
    if (spec.procedural === 'hover') return createHoverView(root, model);

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
    const enemyIds = Object.keys(config.enemies);
    const [soldiers, enemyList, drone] = await Promise.all([
      Promise.all(config.soldiers.map((spec) => this.load(spec, createPlaceholderSoldier))),
      Promise.all(enemyIds.map((id) => this.load(config.enemies[id]!, createPlaceholderZombie))),
      this.load(config.drone, createPlaceholderDrone),
    ]);
    const enemies = Object.fromEntries(enemyIds.map((id, i) => [id, enemyList[i]!]));
    return { soldiers, enemies, drone };
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
