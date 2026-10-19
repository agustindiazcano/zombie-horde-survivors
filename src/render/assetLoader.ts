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
  /** Where each enemy's health bar floats, by variant id. */
  barHeights: Record<string, number>;
  drone: CharacterFactory;
  /** By animal id. */
  animals: Record<string, CharacterFactory>;
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

const DEFAULT_BAR_HEIGHT = 2.2;
const FLASH_COLOR = new THREE.Color(1, 1, 1);

/**
 * Gives this clone its own materials (clones share them otherwise) and returns a function
 * that lights the whole model up, for hit flashes.
 */
function makeFlasher(model: THREE.Object3D, tint?: string): (amount: number) => void {
  const items: {
    material: THREE.MeshStandardMaterial;
    emissive: THREE.Color;
    intensity: number;
  }[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const list: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = list.map((m) => m.clone());
    o.material = Array.isArray(o.material) ? cloned : cloned[0]!;
    for (const m of cloned) {
      if (m instanceof THREE.MeshStandardMaterial) {
        if (tint) m.color.multiply(new THREE.Color(tint));
        items.push({ material: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
      }
    }
  });

  let last = 0;
  return (amount) => {
    if (amount === last) return;
    last = amount;
    for (const it of items) {
      it.material.emissive.copy(it.emissive).lerp(FLASH_COLOR, amount);
      it.material.emissiveIntensity = it.intensity + amount * 1.3;
    }
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
    const setFlash = makeFlasher(model, spec.tint);

    if (spec.procedural === 'wiggle') {
      return { ...createWiggleView(root, model, spec.scale), setFlash };
    }
    if (spec.procedural === 'hover') return { ...createHoverView(root, model), setFlash };

    const animation = new AnimationController(model, gltf.animations, spec);
    return {
      object: root,
      setState: (state) => animation.setState(state),
      update: (dt) => animation.update(dt),
      setFlash,
    };
  };
}

/** Loads glTF/GLB models from public/; any character without a model (or that fails) uses a placeholder. */
export class GltfAssetLoader implements AssetLoader {
  private readonly loader = new GLTFLoader();

  async loadCharacters(config: CharactersConfig): Promise<CharacterFactories> {
    const enemyIds = Object.keys(config.enemies);
    const animalIds = Object.keys(config.animals);
    const [soldiers, enemyList, drone, animalList] = await Promise.all([
      Promise.all(config.soldiers.map((spec) => this.load(spec, createPlaceholderSoldier))),
      Promise.all(enemyIds.map((id) => this.load(config.enemies[id]!, createPlaceholderZombie))),
      this.load(config.drone, createPlaceholderDrone),
      Promise.all(animalIds.map((id) => this.load(config.animals[id]!, createPlaceholderZombie))),
    ]);
    const enemies = Object.fromEntries(enemyIds.map((id, i) => [id, enemyList[i]!]));
    const barHeights = Object.fromEntries(
      enemyIds.map((id) => [id, config.enemies[id]!.barHeight ?? DEFAULT_BAR_HEIGHT]),
    );
    const animals = Object.fromEntries(animalIds.map((id, i) => [id, animalList[i]!]));
    return { soldiers, enemies, barHeights, drone, animals };
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
