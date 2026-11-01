// Headless run of the author's benchmark page (tests/physics-lab-diaz-cano-vs-euler.html): npm run bench:physics-html
// It takes the page's own physics code (everything before the Three.js section), wraps it in a
// function (closure variables, so the timing is fair) and prints the 91-ball pyramid drop and the
// time per step for both solvers. The page is not rewritten.
import { readFileSync } from 'node:fs';

const html = readFileSync(
  new URL('../tests/physics-lab-diaz-cano-vs-euler.html', import.meta.url),
  'utf8',
);
const script = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('</script>'));
const cut = script.indexOf('8. THREE.JS');
const physics = script.slice(0, script.lastIndexOf('/***', cut));

const tail = `
function spawnBlastVisualRing() {}
function computeStateHash() {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < Math.min(bodyCount, 64); i++) {
    h = Math.imul(h ^ ((posX[i] * 1000) | 0), 16777619);
    h = Math.imul(h ^ ((posY[i] * 1000) | 0), 16777619);
    h = Math.imul(h ^ ((posZ[i] * 1000) | 0), 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
function bench(name, solverFn, setup, steps) {
  setup();
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) solverFn();
  const ms = (performance.now() - t0) / steps;
  const drop = trackedApexIndex >= 0 ? (initialApexY - posY[trackedApexIndex]) * 100 : NaN;
  console.log(name.padEnd(34), String(bodyCount).padStart(5), 'bodies', ms.toFixed(3).padStart(8), 'ms/step',
    'apex drop', drop.toFixed(1).padStart(7), 'cm', 'hash', computeStateHash());
}
const pyr = () => setupPyramidScene();
const rain = (n) => () => { setupPyramidScene(); spawnBatch(n); };
useFastPairCacheAndSleep = true;
bench('Diaz-Cano  pyramid 91, 10 s', stepDiazCanoSolver, pyr, 600);
useFastPairCacheAndSleep = false;
bench('Diaz-Cano  pyramid 91, no sleep', stepDiazCanoSolver, pyr, 600);
useFastPairCacheAndSleep = true;
eulerSubsteps = 3;
bench('Euler      pyramid 91, 3 substeps', stepClassicEulerSolver, pyr, 600);
eulerSubsteps = 1;
bench('Euler      pyramid 91, 1 substep', stepClassicEulerSolver, pyr, 600);
eulerSubsteps = 3;
for (const n of [100, 500]) {
  bench('Diaz-Cano  91 + rain ' + n, stepDiazCanoSolver, rain(n), 300);
  bench('Euler      91 + rain ' + n, stepClassicEulerSolver, rain(n), 300);
}
`;
new Function('performance', 'console', physics + tail)(performance, console);
