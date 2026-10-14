import * as THREE from 'three';

/**
 * A renderable character. Game code only talks to this interface, so the primitive
 * placeholders below can be swapped for glTF models without touching it.
 * State names match the simulation: player 'idle' | 'run', zombie 'walk' | 'attack' | 'death'.
 */
export interface CharacterView {
  readonly object: THREE.Object3D;
  setState(state: string): void;
  /** Advances the view's own animation clock by `dt` seconds. */
  update(dt: number): void;
}

export type CharacterFactory = () => CharacterView;

const RADIUS = 0.4;
const BODY_LENGTH = 0.8;
const BODY_Y = RADIUS + BODY_LENGTH / 2;

let bodyGeometry: THREE.CapsuleGeometry | undefined;
let boxGeometry: THREE.BoxGeometry | undefined;

const mat = (color: number) => new THREE.MeshStandardMaterial({ color });
const materials = {
  player: mat(0x4f7d4a),
  gun: mat(0x222222),
  zombie: mat(0x7a8f5a),
  zombieAttack: mat(0xb04a3a),
  zombieDead: mat(0x4a4f40),
};

interface PlaceholderOptions {
  body: (state: string) => THREE.Material;
  /** Adds the limbs/gun that make the facing direction readable. */
  addLimbs: (root: THREE.Group, box: THREE.BoxGeometry) => void;
  animate: (ctx: AnimationContext) => void;
}

interface AnimationContext {
  state: string;
  t: number;
  /** Seconds since the current state started. */
  stateTime: number;
  root: THREE.Group;
  body: THREE.Mesh;
}

function createPlaceholder(options: PlaceholderOptions): CharacterView {
  bodyGeometry ??= new THREE.CapsuleGeometry(RADIUS, BODY_LENGTH, 4, 12);
  boxGeometry ??= new THREE.BoxGeometry(1, 1, 1);

  const root = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry, options.body(''));
  body.position.y = BODY_Y;
  body.castShadow = true;
  root.add(body);
  options.addLimbs(root, boxGeometry);

  let state = '';
  let t = Math.random() * 10;
  let stateTime = 0;

  return {
    object: root,
    setState(next) {
      if (next === state) return;
      state = next;
      stateTime = 0;
      body.material = options.body(next);
    },
    update(dt) {
      t += dt;
      stateTime += dt;
      root.rotation.set(0, root.rotation.y, 0);
      root.position.y = 0;
      body.position.set(0, BODY_Y, 0);
      body.scale.set(1, 1, 1);
      options.animate({ state, t, stateTime, root, body });
    },
  };
}

function addBox(
  root: THREE.Group,
  box: THREE.BoxGeometry,
  material: THREE.Material,
  size: [number, number, number],
  pos: [number, number, number],
): void {
  const mesh = new THREE.Mesh(box, material);
  mesh.scale.set(...size);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  root.add(mesh);
}

export const createPlaceholderSoldier: CharacterFactory = () =>
  createPlaceholder({
    body: () => materials.player,
    addLimbs: (root, box) => addBox(root, box, materials.gun, [0.12, 0.12, 0.8], [0.3, 1.0, 0.5]),
    animate({ state, t, stateTime, root, body }) {
      if (state === 'death') {
        const k = Math.min(stateTime / 0.4, 1);
        root.rotation.x = -k * (Math.PI / 2);
        root.position.y = k * RADIUS;
      } else if (state === 'run') {
        body.position.y = BODY_Y + Math.abs(Math.sin(t * 12)) * 0.08;
        root.rotation.x = 0.15;
      } else {
        body.scale.y = 1 + Math.sin(t * 2) * 0.02;
      }
    },
  });

export const createPlaceholderZombie: CharacterFactory = () =>
  createPlaceholder({
    body: (state) =>
      state === 'attack'
        ? materials.zombieAttack
        : state === 'death'
          ? materials.zombieDead
          : materials.zombie,
    addLimbs(root, box) {
      addBox(root, box, materials.zombie, [0.14, 0.14, 0.7], [-0.35, 1.0, 0.5]);
      addBox(root, box, materials.zombie, [0.14, 0.14, 0.7], [0.35, 1.0, 0.5]);
    },
    animate({ state, t, stateTime, root, body }) {
      if (state === 'walk') {
        body.position.y = BODY_Y + Math.sin(t * 6) * 0.05;
        root.rotation.z = Math.sin(t * 4) * 0.1;
      } else if (state === 'attack') {
        body.position.z = Math.max(0, Math.sin(t * 14)) * 0.2;
      } else if (state === 'death') {
        // Fall backwards onto the ground over 0.4s.
        const k = Math.min(stateTime / 0.4, 1);
        root.rotation.x = -k * (Math.PI / 2);
        root.position.y = k * RADIUS;
      }
    },
  });

const droneMaterials = {
  body: new THREE.MeshStandardMaterial({ color: 0x6ad0ff, metalness: 0.5, roughness: 0.35 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x111418 }),
};

/** A hovering ball with a dark "eye" on the front. The renderer lifts it to flying height. */
export const createPlaceholderDrone: CharacterFactory = () => {
  const root = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), droneMaterials.body);
  ball.castShadow = true;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.12), droneMaterials.eye);
  eye.position.set(0, 0.05, 0.33);
  root.add(ball, eye);

  let t = Math.random() * 10;
  let state = '';
  return {
    object: root,
    setState: (next) => {
      state = next;
    },
    update(dt) {
      t += dt;
      // Gentle hover bob; tilts forward while moving.
      ball.position.y = Math.sin(t * 3) * 0.08;
      eye.position.y = 0.05 + ball.position.y;
      root.rotation.x = state === 'run' ? 0.25 : 0;
    },
  };
};
