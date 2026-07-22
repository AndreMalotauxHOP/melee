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

/** Narrative shop bets - greed vs safety between bouts. */
export type ShopBetId = 'greed' | 'safe' | 'insurance';

export interface ShopBetDef {
  id: ShopBetId;
  name: string;
  desc: string;
  cost: number;
}

export const SHOP_BETS: ShopBetDef[] = [
  {
    id: 'safe',
    name: 'Safe Stash',
    desc: 'Lock $18 in the mattress. You keep it even if you eat dirt.',
    cost: 12,
  },
  {
    id: 'greed',
    name: 'Greed Coin Flip',
    desc: 'Risk $20. Win the next bout: +$45. Lose: that $20 is scrap.',
    cost: 20,
  },
  {
    id: 'insurance',
    name: 'Dignity Insurance',
    desc: 'Next time you drop a bout, get $30 back. One claim.',
    cost: 22,
  },
];

export interface ShopBetState {
  /** Credits locked that survive a loss */
  safeStash: number;
  /** Active greed wager (paid, awaiting bout result) */
  greedActive: boolean;
  /** Insurance claims remaining */
  insurance: number;
}

export const EMPTY_BETS: ShopBetState = {
  safeStash: 0,
  greedActive: false,
  insurance: 0,
};

export function canBuyBet(
  bets: ShopBetState,
  id: ShopBetId,
  credits: number,
): boolean {
  const def = SHOP_BETS.find((b) => b.id === id)!;
  if (credits < def.cost) return false;
  if (id === 'greed' && bets.greedActive) return false;
  if (id === 'insurance' && bets.insurance > 0) return false;
  if (id === 'safe' && bets.safeStash >= 54) return false;
  return true;
}

export function buyBet(
  bets: ShopBetState,
  id: ShopBetId,
  credits: number,
): { bets: ShopBetState; credits: number; ok: boolean; flash: string } {
  if (!canBuyBet(bets, id, credits)) {
    return { bets, credits, ok: false, flash: '' };
  }
  const def = SHOP_BETS.find((b) => b.id === id)!;
  const next = { ...bets };
  let flash = '';
  if (id === 'safe') {
    next.safeStash += 18;
    flash = 'STASHED $18';
  } else if (id === 'greed') {
    next.greedActive = true;
    flash = 'GREED LIVE';
  } else {
    next.insurance += 1;
    flash = 'INSURED';
  }
  return { bets: next, credits: credits - def.cost, ok: true, flash };
}

/** Resolve bets after a bout. winnerSide is human side for vsai, or the side that owns these bets. */
export function resolveBetsOnBout(
  bets: ShopBetState,
  credits: number,
  won: boolean,
): { bets: ShopBetState; credits: number; flashes: string[] } {
  const next = { ...bets };
  let cash = credits;
  const flashes: string[] = [];
  if (next.greedActive) {
    next.greedActive = false;
    if (won) {
      cash += 45;
      flashes.push('GREED PAYS +$45');
    } else {
      flashes.push('GREED ATE YOUR $20');
    }
  }
  if (!won && next.insurance > 0) {
    next.insurance -= 1;
    cash += 30;
    flashes.push('INSURANCE +$30');
  }
  if (!won && next.safeStash > 0) {
    const payout = next.safeStash;
    next.safeStash = 0;
    cash += payout;
    flashes.push(`STASH SAVED +$${payout}`);
  } else if (won && next.safeStash > 0) {
    // Keep stash for later losses - or cash out half on win for story
    const bonus = Math.round(next.safeStash * 0.25);
    if (bonus > 0) {
      cash += bonus;
      flashes.push(`STASH DIVIDEND +$${bonus}`);
    }
  }
  return { bets: next, credits: cash, flashes };
}
