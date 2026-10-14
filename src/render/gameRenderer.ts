import * as THREE from 'three';
import type { GameConfig, GameState } from '../sim';
import { buildArena } from './arena';
import type { CharacterFactory, CharacterView } from './characters';

/** Fixed camera offset from the player: above and behind (towards +z). */
const CAMERA_OFFSET = new THREE.Vector3(0, 13, 9);
/** Per-frame movement below this (world units) counts as standing still. */
const MOVING_EPSILON = 1e-4;

interface Factories {
  player: CharacterFactory;
  zombie: CharacterFactory;
}

interface ZombieEntry {
  view: CharacterView;
  seenFrame: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class GameRenderer {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly playerView: CharacterView;
  private readonly zombies = new Map<number, ZombieEntry>();
  /** Released zombie views kept for reuse instead of being rebuilt. */
  private readonly pool: CharacterView[] = [];
  private frame = 0;

  constructor(
    private readonly container: HTMLElement,
    config: GameConfig,
    private readonly factories: Factories,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x14171c);
    this.scene.add(buildArena(config.arena));
    this.addLights(config.arena.halfSize);

    this.playerView = factories.player();
    this.scene.add(this.playerView.object);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** Draws `state` interpolated by `alpha` (0..1) between the last two simulation steps. */
  render(state: GameState, alpha: number, dt: number): void {
    this.frame++;

    const p = state.player;
    const px = lerp(p.prev.x, p.pos.x, alpha);
    const pz = lerp(p.prev.z, p.pos.z, alpha);
    const moving = Math.hypot(p.pos.x - p.prev.x, p.pos.z - p.prev.z) > MOVING_EPSILON;
    this.playerView.object.position.set(px, 0, pz);
    this.playerView.object.rotation.y = p.facing;
    this.playerView.setState(moving ? 'run' : 'idle');
    this.playerView.update(dt);

    this.syncZombies(state, alpha, dt);

    this.camera.position.set(px, 0, pz).add(CAMERA_OFFSET);
    this.camera.lookAt(px, 0, pz);
    this.renderer.render(this.scene, this.camera);
  }

  private syncZombies(state: GameState, alpha: number, dt: number): void {
    for (const z of state.zombies) {
      let entry = this.zombies.get(z.id);
      if (!entry) {
        const view = this.pool.pop() ?? this.factories.zombie();
        this.scene.add(view.object);
        entry = { view, seenFrame: this.frame };
        this.zombies.set(z.id, entry);
      }
      entry.seenFrame = this.frame;
      const { object } = entry.view;
      object.position.set(lerp(z.prev.x, z.pos.x, alpha), 0, lerp(z.prev.z, z.pos.z, alpha));
      object.rotation.y = z.facing;
      entry.view.setState(z.state);
      entry.view.update(dt);
    }

    for (const [id, entry] of this.zombies) {
      if (entry.seenFrame === this.frame) continue;
      this.scene.remove(entry.view.object);
      this.pool.push(entry.view);
      this.zombies.delete(id);
    }
  }

  private addLights(halfSize: number): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30343a, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    const reach = halfSize * 1.5;
    cam.left = cam.bottom = -reach;
    cam.right = cam.top = reach;
    cam.far = 80;
    this.scene.add(sun);
  }

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
