import { SHIPS } from './ships';
import type { ShipId } from './types';

export const FLEET_SIZE = 6;

export interface FleetShip {
  shipId: ShipId;
  hp: number;
  eliminated: boolean;
}

export interface LadderState {
  fleets: [FleetShip[], FleetShip[]];
  /** Index of the ship currently fighting for each side (-1 = none chosen yet) */
  active: [number, number];
  fight: number;
  seriesWinner: 0 | 1 | null;
  /** Winner of last fight keeps this HP into the next (no heal) */
  carryHp: [number | null, number | null];
  /** Which sides must pick a ship before the next bout */
  needsPick: [boolean, boolean];
}

export function makeFleet(ids: ShipId[]): FleetShip[] {
  return ids.map((shipId) => ({
    shipId,
    hp: SHIPS[shipId].maxHp,
    eliminated: false,
  }));
}

export function createLadder(fleet0: ShipId[], fleet1: ShipId[]): LadderState {
  if (fleet0.length !== FLEET_SIZE || fleet1.length !== FLEET_SIZE) {
    throw new Error(`Fleets must have ${FLEET_SIZE} ships`);
  }
  return {
    fleets: [makeFleet(fleet0), makeFleet(fleet1)],
    active: [-1, -1],
    fight: 1,
    seriesWinner: null,
    carryHp: [null, null],
    needsPick: [true, true],
  };
}

export function currentShip(ladder: LadderState, side: 0 | 1): FleetShip {
  const i = ladder.active[side];
  return ladder.fleets[side][Math.max(0, i)];
}

export function shipsRemaining(ladder: LadderState, side: 0 | 1): number {
  return ladder.fleets[side].filter((s) => !s.eliminated).length;
}

export function availablePicks(
  ladder: LadderState,
  side: 0 | 1,
): { index: number; ship: FleetShip }[] {
  return ladder.fleets[side]
    .map((ship, index) => ({ index, ship }))
    .filter((x) => !x.ship.eliminated);
}

export function selectShip(ladder: LadderState, side: 0 | 1, index: number): boolean {
  const ship = ladder.fleets[side][index];
  if (!ship || ship.eliminated) return false;
  ladder.active[side] = index;
  ladder.needsPick[side] = false;
  // Fresh deploy: full HP unless this side is carrying a wounded winner
  if (ladder.carryHp[side] === null) {
    ship.hp = SHIPS[ship.shipId].maxHp;
  }
  return true;
}

/** AI picks a remaining ship - prefer healthy / beefy hulls when behind */
export function aiPickShip(ladder: LadderState, side: 0 | 1): number {
  const opts = availablePicks(ladder, side);
  if (opts.length === 0) return 0;
  const foe = side === 0 ? 1 : 0;
  const behind = shipsRemaining(ladder, side) < shipsRemaining(ladder, foe as 0 | 1);
  opts.sort((a, b) => {
    const ha = SHIPS[a.ship.shipId].maxHp;
    const hb = SHIPS[b.ship.shipId].maxHp;
    return behind ? hb - ha : ha - hb;
  });
  // slight variety
  const pick = opts[Math.min(opts.length - 1, (Math.random() * Math.min(3, opts.length)) | 0)];
  return pick.index;
}

/**
 * Apply end-of-fight result.
 * Winner keeps current ship with remaining HP (no heal).
 * Loser ship is eliminated; that side must pick their next ship.
 */
export function resolveFight(
  ladder: LadderState,
  fightWinner: -1 | 0 | 1,
  hp0: number,
  hp1: number,
): void {
  if (ladder.seriesWinner !== null) return;

  const markOut = (side: 0 | 1): void => {
    const idx = ladder.active[side];
    if (idx < 0) return;
    const ship = ladder.fleets[side][idx];
    ship.eliminated = true;
    ship.hp = 0;
    ladder.active[side] = -1;
    ladder.carryHp[side] = null;
    ladder.needsPick[side] = true;
  };

  const keepWinner = (side: 0 | 1, hp: number): void => {
    const ship = currentShip(ladder, side);
    ship.hp = Math.max(1, Math.ceil(hp));
    ladder.carryHp[side] = ship.hp;
    ladder.needsPick[side] = false;
  };

  if (fightWinner === -1) {
    markOut(0);
    markOut(1);
  } else if (fightWinner === 0) {
    keepWinner(0, hp0);
    markOut(1);
  } else {
    keepWinner(1, hp1);
    markOut(0);
  }

  const left0 = shipsRemaining(ladder, 0);
  const left1 = shipsRemaining(ladder, 1);
  if (left0 === 0 && left1 === 0) {
    ladder.seriesWinner = hp0 >= hp1 ? 0 : 1;
    ladder.needsPick = [false, false];
  } else if (left0 === 0) {
    ladder.seriesWinner = 1;
    ladder.needsPick = [false, false];
  } else if (left1 === 0) {
    ladder.seriesWinner = 0;
    ladder.needsPick = [false, false];
  } else {
    ladder.fight += 1;
  }
}

export function bothPicked(ladder: LadderState): boolean {
  return !ladder.needsPick[0] && !ladder.needsPick[1];
}

export function nextFightShips(ladder: LadderState): {
  ship0: ShipId;
  ship1: ShipId;
  hp0: number;
  hp1: number;
} {
  if (ladder.active[0] < 0 || ladder.active[1] < 0) {
    throw new Error('Both sides must pick a ship before fighting');
  }
  const s0 = currentShip(ladder, 0);
  const s1 = currentShip(ladder, 1);
  return {
    ship0: s0.shipId,
    ship1: s1.shipId,
    hp0: ladder.carryHp[0] ?? s0.hp,
    hp1: ladder.carryHp[1] ?? s1.hp,
  };
}

/** Random unique 6-ship AI fleet */
export function randomFleet(rng = Math.random): ShipId[] {
  const pool = [...Object.keys(SHIPS)] as ShipId[];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, FLEET_SIZE);
}

export function toggleFleetShip(fleet: ShipId[], id: ShipId): ShipId[] {
  const idx = fleet.indexOf(id);
  if (idx >= 0) {
    return [...fleet.slice(0, idx), ...fleet.slice(idx + 1)];
  }
  if (fleet.length >= FLEET_SIZE) return fleet;
  return [...fleet, id];
}
