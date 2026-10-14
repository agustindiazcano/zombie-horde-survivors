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

  constructor(canvas: HTMLElement, renderer: GameRenderer) {
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        renderer.zoomBy(Math.exp(e.deltaY * ZOOM_PER_WHEEL_UNIT));
      },
      { passive: false },
    );

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
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
