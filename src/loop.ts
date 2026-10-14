import { FIXED_DT } from './sim';

/** Longest frame we simulate, so a background tab can't trigger a spiral of catch-up steps. */
const MAX_FRAME = 0.25;

/**
 * Fixed-timestep loop: `update` runs at FIXED_DT, `render` once per animation frame
 * with the leftover fraction `alpha` for interpolation.
 */
export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number, frameDt: number) => void,
): void {
  let last = performance.now();
  let accumulator = 0;

  const frame = (now: number) => {
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render(accumulator / FIXED_DT, frameDt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
