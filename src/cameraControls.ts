import type { GameRenderer } from './render/gameRenderer';

/** Right-button movement below this (px) is a click, not a camera drag. Matches rts.ts. */
const DRAG_THRESHOLD = 6;
const YAW_PER_PIXEL = 0.005;
const PITCH_PER_PIXEL = 0.004;
const ZOOM_PER_WHEEL_UNIT = 0.001;

/**
 * Mouse wheel zooms; dragging with the right button orbits (horizontal) and tilts (vertical)
 * the camera. Works in both direct and RTS mode.
 */
export class CameraControls {
  private drag: {
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    active: boolean;
  } | null = null;

  /** `blocked` says a right-drag belongs to something else right now (the editor moving items). */
  constructor(
    canvas: HTMLElement,
    renderer: GameRenderer,
    blocked: () => boolean = () => false,
    /** While true, two fingers moving together also orbit and tilt the camera (the map editor). */
    twoFingerOrbit: () => boolean = () => false,
  ) {
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        renderer.zoomBy(Math.exp(e.deltaY * ZOOM_PER_WHEEL_UNIT));
      },
      { passive: false },
    );

    // Two-finger pinch zooms on touch screens.
    let pinch = 0;
    let mid = { x: 0, y: 0 };
    const midpoint = (t: TouchList) => ({
      x: (t[0]!.clientX + t[1]!.clientX) / 2,
      y: (t[0]!.clientY + t[1]!.clientY) / 2,
    });
    const span = (t: TouchList) =>
      Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    canvas.addEventListener('touchstart', (e) => {
      pinch = e.touches.length === 2 ? span(e.touches) : 0;
      if (e.touches.length === 2) mid = midpoint(e.touches);
    });
    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 2 || pinch === 0) return;
        e.preventDefault();
        const now = span(e.touches);
        renderer.zoomBy(pinch / now);
        pinch = now;
        if (twoFingerOrbit()) {
          const m = midpoint(e.touches);
          renderer.rotate(-(m.x - mid.x) * YAW_PER_PIXEL, (m.y - mid.y) * PITCH_PER_PIXEL);
          mid = m;
        }
      },
      { passive: false },
    );
    canvas.addEventListener('touchend', () => (pinch = 0));

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 2 || blocked()) return;
      this.drag = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
      };
    });

    window.addEventListener('mousemove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.active = true;
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        return;
      }
      renderer.rotate(
        -(e.clientX - d.lastX) * YAW_PER_PIXEL,
        (e.clientY - d.lastY) * PITCH_PER_PIXEL,
      );
      d.lastX = e.clientX;
      d.lastY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.drag = null;
    });
    window.addEventListener('blur', () => (this.drag = null));
  }
}
