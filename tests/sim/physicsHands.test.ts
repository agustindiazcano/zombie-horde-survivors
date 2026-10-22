import { describe, expect, it } from 'vitest';
import { FIXED_DT, setDynamicSolids, step, type GameConfig, type GameState } from '../../src/sim';
import { PhysicsHands } from '../../src/physicsHands';
import { RapierWorld } from '../../src/sim/physics/rapierWorld';
import { idle, makeGame } from './helpers';

/** The sim and a Rapier world stepped together, the way PhysicsLab does it. */
async function rig(): Promise<{
  state: GameState;
  config: GameConfig;
  w: RapierWorld;
  hands: PhysicsHands;
  tick: (input?: Partial<typeof idle>) => void;
}> {
  const { state, config } = makeGame();
  const w = await RapierWorld.create();
  w.setArena(config.arena);
  const hands = new PhysicsHands();
  hands.publish(w, config.arena);
  const tick = (input: Partial<typeof idle> = {}): void => {
    step(state, config, { ...idle, ...input }, FIXED_DT);
    hands.control(w, state, config, config.arena);
    w.step();
    hands.publish(w, config.arena);
  };
  return { state, config, w, hands, tick };
}

describe('units and the free bodies of the physics lab', () => {
  it('a walker pushes a box and is stopped by one it cannot move', async () => {
    const { state, w, tick } = await rig();
    const light = w.addBox(2, 0.5, 0);
    for (let i = 0; i < 180; i++) tick({ move: { x: 1, z: 0 } });
    expect(w.pos[light * 3]!).toBeGreaterThan(4);
    // The unit stays behind the box it pushes.
    expect(state.soldiers[0]!.pos.x).toBeLessThan(w.pos[light * 3]!);
    setDynamicSolids([]);
  });

  it('vaults onto a box and stands on it', async () => {
    const { state, w, tick } = await rig();
    // Heavy enough not to be pushed away while the unit climbs.
    w.addBox(1.5, 0.5, 0, 0.5, 0.5, 0.5, 0, 5000);
    for (let i = 0; i < 20; i++) tick();
    // Jump into the box, then stop on top of it.
    for (let i = 0; i < 60; i++) tick({ move: { x: i < 17 ? 1 : 0, z: 0 }, jump: i < 4 });
    const s = state.soldiers[0]!;
    expect(s.y).toBeCloseTo(1, 1);
    expect(s.vy).toBe(0);
    setDynamicSolids([]);
  });

  it('lifts a box with E, throws it with fire, and drops or drags it', async () => {
    const { state, config, w, hands, tick } = await rig();
    const id = w.addBox(1.2, 0.5, 0);
    for (let i = 0; i < 30; i++) tick();
    const unit = state.soldiers[0]!.id;
    expect(hands.grab(w, state, unit, config.arena).handled).toBe(true);
    for (let i = 0; i < 60; i++) tick();
    expect(w.pos[id * 3 + 1]!).toBeGreaterThan(2);
    expect(hands.isHolding).toBe(true);
    // The press of the E key is not a throw: the button must be let go first.
    hands.fire(false, { x: 20, z: 0 }, state);
    // A press throws it; the press is not a shot.
    expect(hands.fire(true, { x: 20, z: 0 }, state)).toBe(true);
    tick();
    expect(hands.isHolding).toBe(false);
    for (let i = 0; i < 20; i++) tick();
    expect(w.pos[id * 3]!).toBeGreaterThan(5);
    // Held fire keeps being swallowed until it is let go.
    expect(hands.fire(true, { x: 20, z: 0 }, state)).toBe(true);
    expect(hands.fire(false, { x: 20, z: 0 }, state)).toBe(false);
    setDynamicSolids([]);
  });
});
