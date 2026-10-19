import type { Input, Vec2 } from './sim';

/** Maps a normalized-device-coordinate point (-1..1) to the ground, or null if it misses. */
export type GroundProjector = (ndcX: number, ndcY: number) => Vec2 | null;

/** Largest mouse movement (px) accepted from a single event. */
const MAX_LOOK_DELTA = 600;

/**
 * Keyboard + mouse input. The camera looks towards -z with screen-up = -z, so
 * WASD maps straight onto world axes (screen-relative movement).
 */
export class InputController {
  private readonly keys = new Set<string>();
  private ndcX = 0;
  private ndcY = 0;
  private firing = false;
  private aimHeld = false;
  private aimPresses = 0;
  private lookX = 0;
  private lookY = 0;
  /** Virtual joystick on touch screens (-1..1 per axis, screen-relative like WASD). */
  private readonly touchMove = { x: 0, z: 0 };
  private readonly touchHeld = { jump: false, sprint: false, crouch: false };
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
      this.aimHeld = false;
    });
    window.addEventListener('mousemove', (e) => {
      // Some systems report a huge bogus delta now and then; a real flick never gets close.
      this.lookX += Math.max(-MAX_LOOK_DELTA, Math.min(MAX_LOOK_DELTA, e.movementX));
      this.lookY += Math.max(-MAX_LOOK_DELTA, Math.min(MAX_LOOK_DELTA, e.movementY));
      this.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.firing = true;
      if (e.button === 2) {
        this.aimHeld = true;
        this.aimPresses++;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aimHeld = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.style.cursor = 'crosshair';
  }

  /** Sets the virtual joystick; the stick adds to the keyboard (clamped by the sim). */
  setTouchMove(x: number, z: number): void {
    this.touchMove.x = x;
    this.touchMove.z = z;
  }

  /** On-screen jump / sprint / crouch buttons (OR-ed with the keyboard). */
  setTouchAction(action: 'jump' | 'sprint' | 'crouch', on: boolean): void {
    this.touchHeld[action] = on;
  }

  /** Right-button presses since the last call (for click-to-toggle aiming). */
  takeAimPresses(): number {
    const n = this.aimPresses;
    this.aimPresses = 0;
    return n;
  }

  /** Whether the right button is down. */
  get aimButton(): boolean {
    return this.aimHeld;
  }

  /** Mouse movement (pixels) since the last call; drives first/third person look. */
  takeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  /** Samples the current input. The returned object is reused between calls. */
  read(project: GroundProjector): Input {
    const k = this.keys;
    const move = this.current.move;
    move.x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    move.z = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
    move.x += this.touchMove.x;
    move.z += this.touchMove.z;

    const ground = project(this.ndcX, this.ndcY);
    if (ground) {
      this.current.aim.x = ground.x;
      this.current.aim.z = ground.z;
    }
    this.current.firing = this.firing;
    // C is an alternative to Ctrl, since browsers reserve Ctrl+W and friends.
    this.current.crouch =
      k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC') || this.touchHeld.crouch;
    this.current.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchHeld.sprint;
    this.current.jump = k.has('Space') || this.touchHeld.jump;
    return this.current;
  }
}
