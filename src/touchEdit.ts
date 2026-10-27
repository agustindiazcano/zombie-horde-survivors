/** Finger travel (px) below which a touch is a tap, not a drag. */
const SLOP = 8;
/** A finger held still this long (ms) acts as a right click (drops the tool, ends a road). */
const LONG_PRESS_MS = 500;

/**
 * Lets the map editor be used with a finger: a tap or a drag with one finger becomes the left
 * mouse button, a long press the right one. Two fingers are left alone (the camera controls turn
 * them into a pinch zoom and an orbit). A tap clicks where it lands; a drag presses at the spot
 * where it started, so a brush or a box selection begins there.
 */
export function bridgeTouchToMouse(canvas: HTMLElement, enabled: () => boolean): void {
  let id: number | null = null;
  let startX = 0;
  let startY = 0;
  let pressed = false;
  let longTimer = 0;

  const fire = (type: string, x: number, y: number, button: number): void => {
    canvas.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button,
        buttons: type === 'mouseup' ? 0 : 1 << button,
      }),
    );
  };
  const release = (x: number, y: number): void => {
    window.clearTimeout(longTimer);
    if (pressed) fire('mouseup', x, y, 0);
    pressed = false;
    id = null;
  };
  const find = (list: TouchList): Touch | undefined =>
    Array.from(list).find((t) => t.identifier === id);

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (!enabled()) return;
      if (e.touches.length > 1) {
        // A second finger: cancel the one-finger action and let the pinch take over.
        if (id !== null) release(startX, startY);
        return;
      }
      e.preventDefault();
      const t = e.changedTouches[0]!;
      id = t.identifier;
      startX = t.clientX;
      startY = t.clientY;
      pressed = false;
      window.clearTimeout(longTimer);
      longTimer = window.setTimeout(() => {
        if (id === null || pressed) return;
        fire('mousedown', startX, startY, 2);
        fire('mouseup', startX, startY, 2);
        id = null;
      }, LONG_PRESS_MS);
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      const t = find(e.changedTouches);
      if (!enabled() || !t || e.touches.length > 1) return;
      e.preventDefault();
      if (!pressed) {
        if (Math.hypot(t.clientX - startX, t.clientY - startY) < SLOP) return;
        window.clearTimeout(longTimer);
        pressed = true;
        fire('mousedown', startX, startY, 0);
      }
      fire('mousemove', t.clientX, t.clientY, 0);
    },
    { passive: false },
  );

  const end = (e: TouchEvent): void => {
    const t = find(e.changedTouches);
    if (!t) return;
    if (!pressed && e.type === 'touchend') {
      // A tap: press and release in the same place.
      window.clearTimeout(longTimer);
      fire('mousedown', t.clientX, t.clientY, 0);
      fire('mouseup', t.clientX, t.clientY, 0);
      id = null;
      return;
    }
    release(t.clientX, t.clientY);
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
}
