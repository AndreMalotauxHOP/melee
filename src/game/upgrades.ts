export type UpgradeId = 'hull' | 'capacitor' | 'thrusters' | 'weapons' | 'cooldown';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  /** Cost for next level = baseCost * (level + 1) */
  baseCost: number;
  maxLevel: number;
  /** Per-level effect summary for UI */
  perLevel: string;
}

export interface PlayerUpgrades {
  hull: number;
  capacitor: number;
  thrusters: number;
  weapons: number;
  cooldown: number;
}

export const EMPTY_UPGRADES: PlayerUpgrades = {
  hull: 0,
  capacitor: 0,
  thrusters: 0,
  weapons: 0,
  cooldown: 0,
};

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: 'hull',
    name: 'Hull Plating',
    desc: 'Thicker armor for every ship you deploy.',
    baseCost: 35,
    maxLevel: 5,
    perLevel: '+12% max HP',
  },
  {
    id: 'capacitor',
    name: 'Capacitor',
    desc: 'Bigger batteries and faster recharge.',
    baseCost: 30,
    maxLevel: 5,
    perLevel: '+12% energy & regen',
  },
  {
    id: 'thrusters',
    name: 'Thrusters',
    desc: 'More push when you hit the gas.',
    baseCost: 32,
    maxLevel: 5,
    perLevel: '+10% thrust',
  },
  {
    id: 'weapons',
    name: 'Hot Loads',
    desc: 'All primary and special projectiles hit harder.',
    baseCost: 40,
    maxLevel: 5,
    perLevel: '+10% damage',
  },
  {
    id: 'cooldown',
    name: 'Coolant',
    desc: 'Fire and specials recycle faster.',
    baseCost: 38,
    maxLevel: 5,
    perLevel: '-8% cooldowns',
  },
];

export function upgradeCost(id: UpgradeId, currentLevel: number): number {
  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  return def.baseCost * (currentLevel + 1);
}

export function canBuy(
  ups: PlayerUpgrades,
  id: UpgradeId,
  credits: number,
): boolean {
  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  if (ups[id] >= def.maxLevel) return false;
  return credits >= upgradeCost(id, ups[id]);
}

export function buyUpgrade(
  ups: PlayerUpgrades,
  id: UpgradeId,
  credits: number,
): { ups: PlayerUpgrades; credits: number; ok: boolean } {
  if (!canBuy(ups, id, credits)) return { ups, credits, ok: false };
  const cost = upgradeCost(id, ups[id]);
  return {
    ups: { ...ups, [id]: ups[id] + 1 },
    credits: credits - cost,
    ok: true,
  };
}

/** Combat multipliers derived from upgrade levels */
export function combatMods(ups: PlayerUpgrades): {
  hp: number;
  energy: number;
  regen: number;
  thrust: number;
  damage: number;
  cooldown: number;
} {
  return {
    hp: 1 + ups.hull * 0.12,
    energy: 1 + ups.capacitor * 0.12,
    regen: 1 + ups.capacitor * 0.12,
    thrust: 1 + ups.thrusters * 0.1,
    damage: 1 + ups.weapons * 0.1,
    cooldown: Math.max(0.6, 1 - ups.cooldown * 0.08),
  };
}

export function cloneUpgrades(ups: PlayerUpgrades): PlayerUpgrades {
  return { ...ups };
}
