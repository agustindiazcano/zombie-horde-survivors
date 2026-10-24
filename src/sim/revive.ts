import type { GameConfig } from './config';
import { itemDef } from './inventory';
import { maxHealthOf } from './stats';
import { bonus } from './training';
import type { GameState, Soldier } from './types';
import { hypot } from './vec';

const distance = (a: Soldier, b: Soldier): number => hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

/** A unit that can help: a soldier on its feet. */
const standing = (s: Soldier): boolean => !s.dead && !s.downed && s.kind === 'soldier';

/** Backpack slot of the first item of this type, or -1. */
const slotOfType = (config: GameConfig, s: Soldier, type: 'medical' | 'defibrillator'): number =>
  s.backpack.findIndex((st) => itemDef(config, st.item).type === type);

/** Takes one item out of a backpack stack. */
function consume(s: Soldier, index: number): void {
  const stack = s.backpack[index]!;
  if (--stack.count === 0) s.backpack.splice(index, 1);
}

/** The defibrillator's window to bring a fallen soldier back, or 0 if the game has none. */
function defibWindow(config: GameConfig): number {
  for (const def of Object.values(config.items)) {
    if (def.type === 'defibrillator') return def.reviveWindow;
  }
  return 0;
}

/** Can this soldier be brought back by an ally right now? Downed (medkit) or recently dead (defibrillator). */
function needsRescue(config: GameConfig, s: Soldier): boolean {
  if (s.kind !== 'soldier') return false;
  if (s.downed) return true;
  return s.dead && s.deadTime <= defibWindow(config);
}

/** The item a rescuer must carry for this patient. */
const toolFor = (patient: Soldier): 'medical' | 'defibrillator' =>
  patient.downed ? 'medical' : 'defibrillator';

/**
 * The patient a standing soldier with the right item should walk to: the nearest downed ally
 * (with a medkit) or recently fallen one (with a defibrillator). Null if it has nothing to do.
 */
export function rescueTarget(state: GameState, config: GameConfig, s: Soldier): Soldier | null {
  if (!standing(s)) return null;
  let best: Soldier | null = null;
  let bestD = Infinity;
  for (const p of state.soldiers) {
    if (p === s || !needsRescue(config, p) || slotOfType(config, s, toolFor(p)) < 0) continue;
    const d = distance(s, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Automatic first aid: a soldier on its feet with a medkit, within reach of a downed ally for
 * `downed.reviveTime`, spends the kit to stand the ally up (with the kit's health). With a
 * defibrillator, standing by a soldier who died less than the item's window ago for its channel
 * time brings them back at `downed.defibHealth` of their health (it always works, one use).
 */
export function updateRevives(state: GameState, config: GameConfig, dt: number): void {
  const rules = config.downed;
  // A medic's presence heals the allies near it.
  for (const medic of state.soldiers) {
    const aura = standing(medic) ? bonus(config, medic, 'aura') : 0;
    if (aura <= 0) continue;
    for (const ally of state.soldiers) {
      if (ally === medic || !standing(ally) || distance(ally, medic) > config.training.auraRange) {
        continue;
      }
      ally.health = Math.min(maxHealthOf(state, config, ally), ally.health + aura * dt);
    }
  }
  for (const patient of state.soldiers) {
    if (!needsRescue(config, patient)) {
      patient.reviveProgress = 0;
      continue;
    }
    const tool = toolFor(patient);
    let helper: Soldier | null = null;
    for (const s of state.soldiers) {
      if (s === patient || !standing(s) || distance(s, patient) > rules.reviveRange) continue;
      if (slotOfType(config, s, tool) >= 0) {
        helper = s;
        break;
      }
    }
    if (!helper) {
      patient.reviveProgress = 0;
      continue;
    }
    const index = slotOfType(config, helper, tool);
    const def = itemDef(config, helper.backpack[index]!.item);
    const needed =
      (def.type === 'defibrillator' ? def.channelTime : rules.reviveTime) *
      Math.max(0.2, 1 - bonus(config, helper, 'revive'));
    patient.reviveProgress += dt;
    if (patient.reviveProgress < needed) continue;

    consume(helper, index);
    patient.reviveProgress = 0;
    if (def.type === 'medical') {
      patient.downed = false;
      patient.bleedOut = 0;
      patient.health = Math.min(
        maxHealthOf(state, config, patient),
        def.heal * (1 + bonus(config, helper, 'heal')),
      );
    } else {
      patient.dead = false;
      patient.deadTime = 0;
      patient.health = maxHealthOf(state, config, patient) * rules.defibHealth;
      patient.armor = 0;
      patient.order = { type: 'follow' };
      patient.fireCooldown = 0;
    }
    state.events.push({ type: 'soldierRevived', soldierId: patient.id, byId: helper.id });
  }
}
