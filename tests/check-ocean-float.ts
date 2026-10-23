// Drops balls and boxes into the Map 13 ocean and prints where they settle: npm run check:ocean
import data from '../data/game.json';
import map13 from '../data/maps/map-13.json';
import { arenaOf, parseMap, oceanHeight } from '../src/sim';
import { RapierWorld } from '../src/sim/physics/rapierWorld';

const map = parseMap(map13);
const arena = arenaOf(map);
const w = await RapierWorld.create();
w.setArena(arena);
const ocean = { ...data.ocean };
const level = arena.terrain.water ?? 0;
const groundAt = () => -9;
w.ocean = { params: ocean as never, level, groundAt };
for (let i = 0; i < 20; i++) w.addBall(-10 + i, 6 + i * 0.2, -30, 0.5, 6, [0, 0, 0]);
for (let i = 0; i < 10; i++) w.addBox(-5 + i * 1.2, 5, -20, 0.5, 0.5, 0.5, 0);
const sum = new Float64Array(w.count);
let n = 0;
for (let s = 0; s < 900; s++) {
  w.oceanTime = s / 60;
  w.step();
  if (s >= 300) {
    n++;
    for (let i = 0; i < w.count; i++)
      sum[i]! +=
        w.pos[i * 3 + 1]! -
        oceanHeight(ocean as never, level, groundAt(), w.pos[i * 3]!, w.pos[i * 3 + 2]!, s / 60);
  }
}
let sunk = 0;
for (let i = 0; i < w.count; i++) if (sum[i]! / n < -0.6) sunk++;
console.log(
  `bodies ${w.count}; mean height over the surface (m): ${(sum.reduce((a, b) => a + b, 0) / n / w.count).toFixed(2)}; sunk more than 0.6 m on average: ${sunk}`,
);
