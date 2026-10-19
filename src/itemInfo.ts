import { itemDef, type GameConfig } from './sim';

export interface ItemInfo {
  icon: string;
  name: string;
  /** One short line for a slot. */
  stats: string;
  /** Tooltip: what the item is and which of its numbers do nothing yet. */
  title: string;
}

/** What the UI shows about an item of data/items.json. */
export function itemInfo(config: GameConfig, id: string): ItemInfo {
  const def = itemDef(config, id);
  const lines = [def.name];
  let stats = '';
  switch (def.type) {
    case 'weapon':
      stats = `${def.damage} dmg · ${def.fireRate}/s`;
      lines.push(
        `${def.class}, ${def.hands === 2 ? 'two-handed' : 'one-handed'}, ${def.damageType} damage`,
        `damage ${def.damage}, ${def.fireRate} shots/s, range ${def.range}`,
        `${def.fireMode === 'semi' ? 'Semi-automatic: one shot per click' : 'Automatic: fires while held'}`,
      );
      if (def.magazine) {
        lines.push(
          `Magazine ${def.magazine}${def.reloadTime ? `, reload ${def.reloadTime} s` : ''}`,
        );
      }
      break;
    case 'ammo':
      stats = `${def.pack} rounds`;
      lines.push(`Loads into a gun on R; a crate or shop unit gives ${def.pack} rounds`);
      break;
    case 'medical':
      stats = `+${def.heal} HP`;
      lines.push(`Heals ${def.heal} health when used`);
      break;
    case 'armor':
      stats = 'chest armor';
      lines.push('Worn on the chest');
      break;
    case 'plate':
      stats = `+${config.player.armorPlate} armor`;
      lines.push('Worn at once from a crate');
      break;
    case 'grenade':
      stats = `${def.blastDamage} dmg · ${def.blastRadius} m`;
      lines.push(
        `Thrown up to ${def.throwRange} m, blows up after ${def.fuse} s; hurts allies too`,
        'Q in direct control · G in RTS mode, then click',
      );
      break;
    case 'defibrillator':
      stats = 'revives';
      lines.push('Revives a fallen ally (not active yet)');
      break;
    case 'accessory':
      stats = `${def.slot} accessory`;
      lines.push(`Fits the ${def.slot} slot of a weapon (not active yet)`);
      break;
  }
  if (def.stack > 1) lines.push(`Stacks up to ${def.stack}`);
  if ('mocked' in def) {
    const mocked = Object.entries(def.mocked).map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(', ') || '—' : JSON.stringify(value)}`,
    );
    lines.push(`Not active yet: ${mocked.join(' · ')}`);
  }
  return { icon: def.icon, name: def.name, stats, title: lines.join('\n') };
}
