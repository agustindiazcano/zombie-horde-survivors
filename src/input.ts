import type { Input, Vec2 } from './sim';

/** Maps a normalized-device-coordinate point (-1..1) to the ground, or null if it misses. */
export type GroundProjector = (ndcX: number, ndcY: number) => Vec2 | null;

/**
 * Keyboard + mouse input. The camera looks towards -z with screen-up = -z, so
 * WASD maps straight onto world axes (screen-relative movement).
 */
export class InputController {
  private readonly keys = new Set<string>();
  private ndcX = 0;
  private ndcY = 0;
  private firing = false;
  private readonly current: Input = {
    move: { x: 0, z: 0 },
    aim: { x: 0, z: 1 },
    firing: false,
    crouch: false,
    sprint: false,
    jump: false,
  };

  constructor(target: HTMLElement) {
    // Space scrolls the page / presses focused buttons by default.
    const blockSpace = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    };
    window.addEventListener('keydown', (e) => {
      blockSpace(e);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      blockSpace(e);
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.style.cursor = 'crosshair';
  }

  /** Samples the current input. The returned object is reused between calls. */
  read(project: GroundProjector): Input {
    const k = this.keys;
    const move = this.current.move;
    move.x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    move.z = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);

    const ground = project(this.ndcX, this.ndcY);
    if (ground) {
      this.current.aim.x = ground.x;
      this.current.aim.z = ground.z;
    }
    this.current.firing = this.firing;
    // C is an alternative to Ctrl, since browsers reserve Ctrl+W and friends.
    this.current.crouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
    this.current.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    this.current.jump = k.has('Space');
    return this.current;
  }
}
