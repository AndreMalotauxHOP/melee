import { ARENA_H, ARENA_W, type ShipId } from './types';

export type ArenaFormat = 'duel' | 'teams2v2' | 'ffa20';

export type ArenaSlot = {
  shipId: ShipId;
  /** Team for 2v2; null for FFA / duel uses 0 vs 1 */
  team: 0 | 1 | null;
  /** Controlled by local human (usually slot 0) */
  human: boolean;
};

/** Active wrap dimensions - set per match so math/wrap stay in sync. */
let activeW = ARENA_W;
let activeH = ARENA_H;
let activePlanetX = ARENA_W / 2;
let activePlanetY = ARENA_H / 2;

export function setActiveArena(w: number, h: number): void {
  activeW = w;
  activeH = h;
  activePlanetX = w / 2;
  activePlanetY = h / 2;
}

export function getArenaW(): number {
  return activeW;
}

export function getArenaH(): number {
  return activeH;
}

export function getPlanetX(): number {
  return activePlanetX;
}

export function getPlanetY(): number {
  return activePlanetY;
}

export function resetArenaToDefault(): void {
  setActiveArena(ARENA_W, ARENA_H);
}

export function arenaSizeFor(format: ArenaFormat): { w: number; h: number } {
  switch (format) {
    case 'teams2v2':
      return { w: ARENA_W * 2, h: ARENA_H * 2 };
    case 'ffa20':
      return { w: ARENA_W * 10, h: ARENA_H * 10 };
    default:
      return { w: ARENA_W, h: ARENA_H };
  }
}

export function slotCountFor(format: ArenaFormat): number {
  switch (format) {
    case 'teams2v2':
      return 4;
    case 'ffa20':
      return 20;
    default:
      return 2;
  }
}

/** Spawn poses for N ships around the planet. */
export function spawnLayout(
  format: ArenaFormat,
  slots: ArenaSlot[],
  planetR: number,
): { x: number; y: number; angle: number; vy: number }[] {
  const w = getArenaW();
  const h = getArenaH();
  const cx = getPlanetX();
  const cy = getPlanetY();
  const n = slots.length;

  if (format === 'duel' && n === 2) {
    return [
      { x: w * 0.2, y: h * 0.5, angle: 0, vy: -70 },
      { x: w * 0.8, y: h * 0.5, angle: Math.PI, vy: 70 },
    ];
  }

  if (format === 'teams2v2') {
    const out: { x: number; y: number; angle: number; vy: number }[] = [];
    let t0 = 0;
    let t1 = 0;
    for (const s of slots) {
      const team = s.team ?? 0;
      const i = team === 0 ? t0++ : t1++;
      const side = team === 0 ? -1 : 1;
      const spread = (i - 0.5) * 140;
      const x = cx + side * (planetR + 280);
      const y = cy + spread;
      out.push({
        x,
        y,
        angle: team === 0 ? 0 : Math.PI,
        vy: side * -40,
      });
    }
    return out;
  }

  // FFA ring
  const radius = planetR + 320 + Math.min(900, n * 18);
  return slots.map((_, i) => {
    const a = (i / n) * Math.PI * 2;
    return {
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
      angle: a + Math.PI,
      vy: Math.sin(a) * 40,
    };
  });
}

export function buildCpuFilledSlots(
  format: ArenaFormat,
  humanShip: ShipId,
  cpuShips: ShipId[],
  humanTeam: 0 | 1 = 0,
): ArenaSlot[] {
  const n = slotCountFor(format);
  const slots: ArenaSlot[] = [];
  let cpuIdx = 0;
  const nextCpu = (): ShipId => {
    const id = cpuShips[cpuIdx % Math.max(1, cpuShips.length)] ?? humanShip;
    cpuIdx++;
    return id;
  };

  if (format === 'teams2v2') {
    for (let i = 0; i < 4; i++) {
      const team = (i < 2 ? 0 : 1) as 0 | 1;
      const human = i === (humanTeam === 0 ? 0 : 2);
      slots.push({
        shipId: human ? humanShip : nextCpu(),
        team,
        human,
      });
    }
    return slots;
  }

  if (format === 'ffa20') {
    slots.push({ shipId: humanShip, team: null, human: true });
    for (let i = 1; i < n; i++) {
      slots.push({ shipId: nextCpu(), team: null, human: false });
    }
    return slots;
  }

  slots.push({ shipId: humanShip, team: 0, human: true });
  slots.push({ shipId: nextCpu(), team: 1, human: false });
  return slots;
}
