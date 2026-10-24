import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { GameState, SkyLight, Vec3 } from './types';
import { hypot, hypot3 } from './vec';
import { dcos, dexp, dsin } from './dmath';

/** A formation hovers this close (metres) to its point when it counts as arrived. */
const ARRIVE = 6;
/** The nearest a wandering light may drift to the middle of the map, and the farthest it may fly. */
const FAR_LIMIT = 650;
/** Houses within this distance (metres) of the middle of the map are the ones the formations visit. */
const HOUSE_RANGE = 70;

const between = (state: GameState, lo: number, hi: number): number =>
  lo + nextFloat(state.rng) * (hi - lo);

const copy = (to: Vec3, from: Vec3): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
};

/** The blue lights of the sky show: all far away and still at the start. */
export function createSky(state: GameState, config: GameConfig): void {
  if (!config.skyShowOn) return;
  const rules = config.skyShow;
  for (let i = 0; i < rules.count; i++) {
    const azimuth = nextFloat(state.rng) * Math.PI * 2;
    const elevation = between(state, 0.35, 1.35);
    const distance = between(state, rules.minDistance, rules.maxDistance);
    const pos = {
      x: dcos(azimuth) * dcos(elevation) * distance,
      y: dsin(elevation) * distance,
      z: dsin(azimuth) * dcos(elevation) * distance,
    };
    const inFormation = i < rules.formations * 3;
    state.skyLights.push({
      id: i + 1,
      pos,
      prev: { ...pos },
      vel: { x: 0, y: 0, z: 0 },
      role: 'star',
      group: inFormation ? Math.floor(i / 3) : -1,
      slot: inFormation ? i % 3 : 0,
      timer: 0,
      target: null,
      waypoint: null,
      hovering: false,
    });
  }
}

/**
 * The sky show, driven by the clock: the lights stand like stars, then drift, then some cross the
 * sky in straight lines like aircraft, and last the formations of three come down over the houses
 * in short bursts and sudden stops, the way the user described unidentified craft.
 */
export function updateSky(state: GameState, config: GameConfig, dt: number): void {
  if (state.skyLights.length === 0) return;
  const rules = config.skyShow;
  const t = state.time;
  const houses = config.arena.obstacles.filter(
    (o) => o.asset === 'house' && hypot(o.x, o.z) < HOUSE_RANGE,
  );

  for (const light of state.skyLights) {
    copy(light.prev, light.pos);
    if (light.group >= 0 && t >= rules.comeAt + light.group * rules.formationGap) {
      if (light.role !== 'formation') light.role = 'formation';
      flyFormation(state, config, light, houses, dt);
      continue;
    }
    if (t >= rules.flyAt && light.group < 0 && light.id % 4 === 0 && light.role !== 'plane') {
      light.role = 'plane';
      const heading = nextFloat(state.rng) * Math.PI * 2;
      light.vel.x = dcos(heading) * rules.planeSpeed;
      light.vel.y = 0;
      light.vel.z = dsin(heading) * rules.planeSpeed;
    } else if (t >= rules.wanderAt && light.role === 'star') {
      light.role = 'wander';
    }
    if (light.role === 'plane') {
      light.pos.x += light.vel.x * dt;
      light.pos.z += light.vel.z * dt;
      // Out of sight: come back in from the other side.
      if (hypot(light.pos.x, light.pos.z) > FAR_LIMIT) {
        light.pos.x *= -0.9;
        light.pos.z *= -0.9;
      }
    } else if (light.role === 'wander') {
      drift(state, config, light, dt);
    }
  }
}

/** A slow, aimless drift: a new heading every few seconds, kept within the sky's shell. */
function drift(state: GameState, config: GameConfig, light: SkyLight, dt: number): void {
  const rules = config.skyShow;
  light.timer -= dt;
  if (light.timer <= 0) {
    light.timer = between(state, 2, 5);
    const speed = between(state, rules.wanderSpeed * 0.3, rules.wanderSpeed);
    const a = nextFloat(state.rng) * Math.PI * 2;
    const b = (nextFloat(state.rng) - 0.5) * Math.PI;
    light.vel.x = dcos(a) * dcos(b) * speed;
    light.vel.y = dsin(b) * speed * 0.6;
    light.vel.z = dsin(a) * dcos(b) * speed;
  }
  light.pos.x += light.vel.x * dt;
  light.pos.y += light.vel.y * dt;
  light.pos.z += light.vel.z * dt;
  // Keep it above the horizon and inside the shell it started in.
  light.pos.y = Math.max(light.pos.y, 120);
  const r = hypot3(light.pos.x, light.pos.y, light.pos.z);
  const clamped = Math.min(Math.max(r, rules.minDistance * 0.8), rules.maxDistance * 1.1);
  if (clamped !== r) {
    const k = clamped / r;
    light.pos.x *= k;
    light.pos.y *= k;
    light.pos.z *= k;
  }
}

/**
 * Formation flight. The leader (slot 0) flies in bursts toward a point over a house: it picks a
 * waypoint part of the way there with a sideways and vertical wobble, dashes to it at once, stops,
 * and goes again; the other two hold a triangle around it and trail a little behind. Once it is
 * over its house the formation hovers with a faint tremble.
 */
function flyFormation(
  state: GameState,
  config: GameConfig,
  light: SkyLight,
  houses: { x: number; z: number }[],
  dt: number,
): void {
  const rules = config.skyShow;
  const leader = state.skyLights.find((l) => l.group === light.group && l.slot === 0)!;

  if (light.slot !== 0) {
    // Followers: a slowly turning triangle around the leader.
    const angle = (light.slot / 3) * Math.PI * 2 + state.time * 0.5;
    const want = {
      x: leader.pos.x + dcos(angle) * rules.spread,
      y: leader.pos.y + dsin(state.time * 1.7 + light.slot) * 0.8,
      z: leader.pos.z + dsin(angle) * rules.spread,
    };
    const k = 1 - dexp(-3 * dt);
    light.pos.x += (want.x - light.pos.x) * k;
    light.pos.y += (want.y - light.pos.y) * k;
    light.pos.z += (want.z - light.pos.z) * k;
    return;
  }

  if (!light.target) {
    const house =
      houses.length > 0 ? houses[(light.group * 5 + 1) % houses.length]! : { x: 0, z: 0 };
    light.target = { x: house.x, y: between(state, rules.hoverMin, rules.hoverMax), z: house.z };
  }
  const target = light.target;

  if (light.hovering) {
    light.pos.y = target.y + dsin(state.time * 2.3 + light.group) * 0.4;
    return;
  }

  // Resting between bursts.
  if (!light.waypoint) {
    light.timer -= dt;
    if (light.timer > 0) return;
    const dx = target.x - light.pos.x;
    const dy = target.y - light.pos.y;
    const dz = target.z - light.pos.z;
    const dist = hypot3(dx, dy, dz);
    if (dist < ARRIVE) {
      light.hovering = true;
      return;
    }
    // A burst covers a part of the way, with a wobble that grows with the distance.
    const part = dist < 80 ? 1 : between(state, 0.25, 0.5);
    const wobble = dist < 80 ? 0 : Math.min(dist * 0.12, 60);
    light.waypoint = {
      x: light.pos.x + dx * part + (nextFloat(state.rng) - 0.5) * 2 * wobble,
      y: Math.max(light.pos.y + dy * part + (nextFloat(state.rng) - 0.5) * wobble, 15),
      z: light.pos.z + dz * part + (nextFloat(state.rng) - 0.5) * 2 * wobble,
    };
    light.timer = between(state, rules.burstSpeedMin, rules.burstSpeedMax); // speed of this burst
    return;
  }

  const wp = light.waypoint;
  const mx = wp.x - light.pos.x;
  const my = wp.y - light.pos.y;
  const mz = wp.z - light.pos.z;
  const d = hypot3(mx, my, mz);
  const step = light.timer * dt;
  if (d <= step) {
    copy(light.pos, wp);
    light.waypoint = null;
    light.timer = between(state, rules.pauseMin, rules.pauseMax);
    return;
  }
  light.pos.x += (mx / d) * step;
  light.pos.y += (my / d) * step;
  light.pos.z += (mz / d) * step;
}
