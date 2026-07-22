import { SHIPS } from './ships';
import { combatMods, EMPTY_UPGRADES, type PlayerUpgrades } from './upgrades';
import { mapRulesFromSeed, type MapRules } from './meta';
import {
  arenaSizeFor,
  getArenaH,
  getArenaW,
  getPlanetX,
  getPlanetY,
  setActiveArena,
  spawnLayout,
  type ArenaFormat,
  type ArenaSlot,
} from './arena';
import {
  angDiff,
  clamp,
  mulberry32,
  normalizeAngle,
  wrapDelta,
  wrapPos,
} from './math';
import {
  ARENA_H,
  ARENA_W,
  DT,
  EMPTY_INPUT,
  MAX_SPEED,
  isHostile,
  type Drone,
  type Effect,
  type PlayerInput,
  type Projectile,
  type ProjectileKind,
  type ShipId,
  type ShipRuntime,
  type SimState,
  type Asteroid,
  type AsteroidKind,
  type ScrapZone,
} from './types';

export interface PlanetConfig {
  planetR: number;
  gravity: number;
  gravityTier: 0 | 1 | 2;
}

/** Deterministic planet for a series seed - gravity varies a lot */
export function planetFromSeed(seed: number): PlanetConfig {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const roll = rng();
  // Bias toward milder worlds so the game stays approachable
  let gravityTier: 0 | 1 | 2;
  if (roll < 0.4) gravityTier = 0;
  else if (roll < 0.78) gravityTier = 1;
  else gravityTier = 2;

  const planetR = 34 + rng() * 28; // 34..62
  const gravity =
    gravityTier === 0
      ? 1800 + rng() * 3200 // whisper
      : gravityTier === 1
        ? 5500 + rng() * 5500 // normal
        : 12000 + rng() * 10000; // crushing

  return { planetR, gravity, gravityTier };
}

export function gravityLabel(tier: 0 | 1 | 2): string {
  return tier === 0 ? 'LOW GRAVITY' : tier === 1 ? 'STANDARD GRAVITY' : 'CRUSHING GRAVITY';
}

function nearestHostile(state: SimState, me: ShipRuntime): ShipRuntime | null {
  let best: ShipRuntime | null = null;
  let bestD = Infinity;
  for (const s of state.ships) {
    if (!isHostile(me, s)) continue;
    const d = wrapDelta(me.x, me.y, s.x, s.y).dist;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function hostileBySlots(state: SimState, ownerSlot: number, targetSlot: number): boolean {
  if (ownerSlot === targetSlot) return false;
  const a = state.ships[ownerSlot];
  const b = state.ships[targetSlot];
  if (a && b && a.team !== null && b.team !== null && a.team === b.team) return false;
  return true;
}

function spawnShipAt(
  slot: number,
  shipId: ShipId,
  team: 0 | 1 | null,
  pose: { x: number; y: number; angle: number; vy: number },
  ups: PlayerUpgrades = EMPTY_UPGRADES,
): ShipRuntime {
  const def = SHIPS[shipId];
  const mods = combatMods(ups);
  const maxHp = Math.round(def.maxHp * mods.hp);
  const maxEnergy = Math.round(def.maxEnergy * mods.energy);
  return {
    player: slot,
    team,
    shipId,
    x: pose.x,
    y: pose.y,
    vx: 0,
    vy: pose.vy,
    angle: pose.angle,
    hp: maxHp,
    maxHp,
    energy: maxEnergy,
    maxEnergy,
    fireCd: 0,
    specialCd: 0,
    alive: true,
    thrustTime: 0,
    omega: 0,
    cloak: 0,
    shield: 0,
    slow: 0,
    invuln: 2.0,
    afterburn: 0,
    limpets: 0,
    tractor: 0,
    cone: 0,
    panic: 0,
    flash: 0,
    trailHeat: 0,
    dmgMult: mods.damage,
    cdMult: mods.cooldown,
    thrustMult: mods.thrust,
    regenMult: mods.regen,
    powerBoost: 0,
    hasteBoost: 0,
    telegraph: 0,
    pendingSpecial: false,
    hitRead: 0,
    lastHitAngle: 0,
  };
}

function spawnShip(
  player: 0 | 1,
  shipId: ShipId,
  ups: PlayerUpgrades = EMPTY_UPGRADES,
): ShipRuntime {
  const left = player === 0;
  return spawnShipAt(
    player,
    shipId,
    player,
    {
      x: left ? getArenaW() * 0.2 : getArenaW() * 0.8,
      y: getArenaH() * 0.5,
      angle: left ? 0 : Math.PI,
      vy: left ? -70 : 70,
    },
    ups,
  );
}

/** Big discrete specials get a readable windup so the foe can react. */
function specialNeedsTelegraph(shipId: ShipId): boolean {
  const def = SHIPS[shipId];
  if (def.specialCooldown < 2.5) return false;
  // Hold-to-use kits skip windup
  if (
    shipId === 'shade' ||
    shipId === 'cinder' ||
    shipId === 'grappler' ||
    shipId === 'nullpoint'
  ) {
    return false;
  }
  return true;
}

function spawnScrapZones(
  seed: number,
  planetR: number,
  scrapHeavy = false,
): ScrapZone[] {
  const rng = mulberry32(seed ^ 0x51feed);
  const zones: ScrapZone[] = [];
  let id = 1;
  const laneCount = scrapHeavy ? 4 : 2;
  const pileCount = scrapHeavy ? 6 : 3;
  // Drag lanes - soft corridors that reward map knowledge
  for (let i = 0; i < laneCount; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = planetR + 180 + rng() * 280;
    zones.push({
      id: id++,
      kind: 'lane',
      x: getPlanetX() + Math.cos(ang) * dist,
      y: getPlanetY() + Math.sin(ang) * dist,
      radius: 42 + rng() * 18,
      angle: ang + Math.PI / 2,
      length: 220 + rng() * 160,
      drag: 1.55 + rng() * 0.35,
      dps: 0,
    });
  }
  // Scrap piles - chip + sticky
  for (let i = 0; i < pileCount; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = planetR + 120 + rng() * 420;
    zones.push({
      id: id++,
      kind: 'pile',
      x: getPlanetX() + Math.cos(ang) * dist,
      y: getPlanetY() + Math.sin(ang) * dist,
      radius: 55 + rng() * 35,
      angle: 0,
      length: 0,
      drag: 1.85 + rng() * 0.4,
      dps: 4 + rng() * 5,
    });
  }
  return zones;
}

function inScrapZone(ship: ShipRuntime, z: ScrapZone): boolean {
  if (z.kind === 'pile') {
    const d = Math.hypot(ship.x - z.x, ship.y - z.y);
    return d < z.radius + SHIPS[ship.shipId].radius * 0.4;
  }
  // Lane: oriented capsule
  const dx = ship.x - z.x;
  const dy = ship.y - z.y;
  const ca = Math.cos(z.angle);
  const sa = Math.sin(z.angle);
  const localX = dx * ca + dy * sa;
  const localY = -dx * sa + dy * ca;
  const half = z.length * 0.5;
  const clamped = clamp(localX, -half, half);
  const dist = Math.hypot(localX - clamped, localY);
  return dist < z.radius;
}

function applyScrapZones(state: SimState, ship: ShipRuntime): void {
  for (const z of state.scrapZones) {
    if (!inScrapZone(ship, z)) continue;
    ship.vx /= Math.pow(z.drag, DT * 8);
    ship.vy /= Math.pow(z.drag, DT * 8);
    if (z.dps > 0 && ship.invuln <= 0 && ship.shield <= 0) {
      damageShip(state, ship, z.dps * DT);
    }
    if (state.tick % 18 === 0 && z.kind === 'pile') {
      addEffect(state, 'spark', ship.x, ship.y, '#c4a574', 14, 0.2);
    }
  }
}

export function createSim(
  ship0: ShipId,
  ship1: ShipId,
  seed = 1,
  opts?: {
    hp0?: number;
    hp1?: number;
    /** If true, ignore hp0 and start at upgraded max */
    fullHeal0?: boolean;
    fullHeal1?: boolean;
    planet?: PlanetConfig;
    upgrades?: [PlayerUpgrades, PlayerUpgrades];
    /** Weekly / mode map override hint */
    mapHint?: string | null;
    map?: MapRules;
  },
): SimState {
  const map = opts?.map ?? mapRulesFromSeed(seed, opts?.mapHint ?? null);
  let planet = opts?.planet ?? planetFromSeed(seed);
  if (map.forceGravity !== undefined) {
    const g = map.forceGravity;
    planet = {
      ...planet,
      gravityTier: g,
      gravity:
        g === 0 ? 2200 : g === 1 ? planet.gravity : Math.max(planet.gravity, 9000),
    };
  }
  setActiveArena(ARENA_W, ARENA_H);
  const ups = opts?.upgrades ?? [EMPTY_UPGRADES, EMPTY_UPGRADES];
  const a = spawnShip(0, ship0, ups[0]);
  const b = spawnShip(1, ship1, ups[1]);
  if (opts?.fullHeal0) a.hp = a.maxHp;
  else if (opts?.hp0 !== undefined) a.hp = clamp(opts.hp0, 1, a.maxHp);
  if (opts?.fullHeal1) b.hp = b.maxHp;
  else if (opts?.hp1 !== undefined) b.hp = clamp(opts.hp1, 1, b.maxHp);
  if (map.startHpFrac < 1) {
    a.hp = Math.max(1, Math.floor(a.maxHp * map.startHpFrac));
    b.hp = Math.max(1, Math.floor(b.maxHp * map.startHpFrac));
  }
  // On heavy worlds, spawn with a bit more orbital speed so you don't freefall in
  const orbitBoost = 55 + planet.gravityTier * 35;
  a.vy = -orbitBoost;
  b.vy = orbitBoost;
  return {
    tick: 0,
    ships: [a, b],
    projectiles: [],
    drones: [],
    effects: [],
    asteroids: [],
    scrapZones: spawnScrapZones(seed, planet.planetR, map.scrapHeavy),
    winner: null,
    winnerTeam: null,
    nextId: 1,
    seed,
    planetR: planet.planetR,
    gravity: planet.gravity,
    gravityTier: planet.gravityTier,
    format: 'duel',
    arenaW: ARENA_W,
    arenaH: ARENA_H,
    map: {
      id: map.id,
      label: map.label,
      asteroidMul: map.asteroidMul,
      cloakFog: map.cloakFog,
      scrapHeavy: map.scrapHeavy,
      forceGravity: map.forceGravity,
      startHpFrac: map.startHpFrac,
    },
  };
}

/** Multi-ship bout (2v2 / FFA20). Arena size is set from format. */
export function createArenaSim(
  format: ArenaFormat,
  slots: ArenaSlot[],
  seed = 1,
  opts?: {
    planet?: PlanetConfig;
    mapHint?: string | null;
    map?: MapRules;
  },
): SimState {
  const size = arenaSizeFor(format);
  setActiveArena(size.w, size.h);
  const map = opts?.map ?? mapRulesFromSeed(seed, opts?.mapHint ?? null);
  let planet = opts?.planet ?? planetFromSeed(seed);
  if (map.forceGravity !== undefined) {
    const g = map.forceGravity;
    planet = {
      ...planet,
      gravityTier: g,
      gravity:
        g === 0 ? 2200 : g === 1 ? planet.gravity : Math.max(planet.gravity, 9000),
    };
  }
  const poses = spawnLayout(format, slots, planet.planetR);
  const orbitBoost = 55 + planet.gravityTier * 35;
  const ships = slots.map((slot, i) => {
    const pose = poses[i] ?? poses[0];
    const ship = spawnShipAt(i, slot.shipId, slot.team, pose);
    if (map.startHpFrac < 1) {
      ship.hp = Math.max(1, Math.floor(ship.maxHp * map.startHpFrac));
    }
    // Keep spawn orbital sense on heavy worlds
    if (Math.abs(ship.vy) < 40) {
      ship.vy = (i % 2 === 0 ? -1 : 1) * orbitBoost * 0.65;
    }
    return ship;
  });
  return {
    tick: 0,
    ships,
    projectiles: [],
    drones: [],
    effects: [],
    asteroids: [],
    scrapZones: spawnScrapZones(seed, planet.planetR, map.scrapHeavy),
    winner: null,
    winnerTeam: null,
    nextId: 1,
    seed,
    planetR: planet.planetR,
    gravity: planet.gravity,
    gravityTier: planet.gravityTier,
    format,
    arenaW: size.w,
    arenaH: size.h,
    map: {
      id: map.id,
      label: map.label,
      asteroidMul: map.asteroidMul,
      cloakFog: map.cloakFog,
      scrapHeavy: map.scrapHeavy,
      forceGravity: map.forceGravity,
      startHpFrac: map.startHpFrac,
    },
  };
}

function allocId(state: SimState): number {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

function addEffect(
  state: SimState,
  kind: Effect['kind'],
  x: number,
  y: number,
  color: string,
  radius: number,
  life: number,
): void {
  state.effects.push({
    id: allocId(state),
    kind,
    x,
    y,
    life,
    maxLife: life,
    color,
    radius,
  });
}

function spawnProjectile(
  state: SimState,
  owner: number,
  kind: ProjectileKind,
  x: number,
  y: number,
  angle: number,
  speed: number,
  life: number,
  damage: number,
  radius: number,
  homing = 0,
  pierce = false,
  trail = false,
): void {
  state.projectiles.push({
    id: allocId(state),
    owner,
    kind,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    damage:
      damage *
      (state.ships[owner]?.dmgMult ?? 1) *
      (state.ships[owner]?.powerBoost > 0 ? 1.4 : 1),
    radius,
    homing,
    pierce,
    trail,
  });
}

function applyGravity(ship: ShipRuntime, state: SimState, thrusting: boolean): void {
  const dx = getPlanetX() - ship.x;
  const dy = getPlanetY() - ship.y;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  if (d < 1) return;

  // SC2-style well: strong pull inside ~3.8x planet radius, then cuts off
  const wellR = state.planetR * 3.8;
  if (d > wellR) {
    ship.trailHeat = Math.max(0, ship.trailHeat - DT * 0.55);
    return;
  }

  const force = state.gravity / d2;
  ship.vx += (dx / d) * force * DT;
  ship.vy += (dy / d) * force * DT;

  // Leyland Gravity Whip: thrust while skimming the well for free overspeed
  if (thrusting && d > state.planetR + 10) {
    const near = 1 - (d - state.planetR) / (wellR - state.planetR);
    const sp = Math.hypot(ship.vx, ship.vy);
    if (sp > 55 && near > 0.12) {
      const boost = near * near * 260 * DT;
      ship.vx += (ship.vx / sp) * boost;
      ship.vy += (ship.vy / sp) * boost;
      ship.trailHeat = Math.min(1, ship.trailHeat + near * DT * 2.4);
    }
  } else {
    ship.trailHeat = Math.max(0, ship.trailHeat - DT * 0.35);
  }
}

function limitSpeed(ship: ShipRuntime): void {
  const def = SHIPS[ship.shipId];
  const sp = Math.hypot(ship.vx, ship.vy);
  // Whip heat lets you exceed engine max - the classic Super Melee skill toy
  const whipMul = 1 + ship.trailHeat * 0.85;
  const lim =
    ((MAX_SPEED * def.speedBias) / Math.max(0.55, Math.sqrt(def.mass))) * whipMul;
  if (sp > lim) {
    ship.vx = (ship.vx / sp) * lim;
    ship.vy = (ship.vy / sp) * lim;
  }
}

function damageShip(
  state: SimState,
  ship: ShipRuntime,
  amount: number,
  fromX?: number,
  fromY?: number,
): void {
  if (!ship.alive || ship.invuln > 0) return;
  if (ship.shield > 0) {
    ship.shield = Math.max(0, ship.shield - amount * 0.6);
    ship.flash = 0.22;
    ship.hitRead = Math.max(ship.hitRead, 0.28);
    if (fromX !== undefined && fromY !== undefined) {
      ship.lastHitAngle = Math.atan2(ship.y - fromY, ship.x - fromX);
      addEffect(state, 'shield_flash', ship.x, ship.y, SHIPS[ship.shipId].accent, 34, 0.28);
      addEffect(state, 'ring', ship.x, ship.y, '#9ad4ff', 26 + amount * 0.4, 0.22);
    }
    return;
  }
  const ambush = ship.cloak > 0 ? 0 : 1;
  // attacker ambush handled at projectile hit
  void ambush;
  ship.hp -= amount;
  ship.flash = Math.max(ship.flash, 0.28 + Math.min(0.25, amount * 0.012));
  ship.hitRead = Math.max(ship.hitRead, 0.35 + Math.min(0.35, amount * 0.015));
  if (fromX !== undefined && fromY !== undefined) {
    ship.lastHitAngle = Math.atan2(ship.y - fromY, ship.x - fromX);
    const hitColor = amount >= 18 ? '#ff6b4a' : amount >= 10 ? '#ffb347' : '#ffe08a';
    addEffect(state, 'spark', ship.x, ship.y, hitColor, 16 + amount * 0.9, 0.35);
    addEffect(
      state,
      'ring',
      ship.x + Math.cos(ship.lastHitAngle) * 8,
      ship.y + Math.sin(ship.lastHitAngle) * 8,
      hitColor,
      18 + amount * 0.55,
      0.28,
    );
    // Readable hit trail streak opposite the impact
    const trailAng = ship.lastHitAngle + Math.PI;
    for (let i = 0; i < 3; i++) {
      const d = 10 + i * 14;
      addEffect(
        state,
        'spark',
        ship.x + Math.cos(trailAng) * d,
        ship.y + Math.sin(trailAng) * d,
        hitColor,
        10 + amount * 0.25 - i * 2,
        0.2 + i * 0.04,
      );
    }
  }
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.alive = false;
    ship.cloak = 0;
    addEffect(state, 'explosion', ship.x, ship.y, SHIPS[ship.shipId].color, 64, 0.75);
    addEffect(state, 'ring', ship.x, ship.y, '#fff0c8', 90, 0.55);
  }
}

function primaryFire(state: SimState, ship: ShipRuntime): void {
  const def = SHIPS[ship.shipId];
  if (ship.fireCd > 0 || ship.energy < Math.ceil(def.fireCost * 1.12)) return;
  if (ship.shipId === 'nullpoint') return; // cone is held fire

  ship.energy -= Math.ceil(def.fireCost * 1.12);
  ship.fireCd = def.fireRate * ship.cdMult;

  const nose = def.radius + 4;
  const ox = ship.x + Math.cos(ship.angle) * nose;
  const oy = ship.y + Math.sin(ship.angle) * nose;
  const ambushMult = ship.cloak > 0.05 ? 1.75 : 1;

  switch (ship.shipId) {
    case 'solhammer':
      spawnProjectile(state, ship.player, 'heavy', ox, oy, ship.angle, 520, 1.4, 14 * ambushMult, 4);
      break;
    case 'zephyr':
      spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle - 0.04, 720, 0.7, 5 * ambushMult, 2.5);
      spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle + 0.04, 700, 0.75, 5 * ambushMult, 2.5);
      break;
    case 'bulwark':
      spawnProjectile(state, ship.player, 'heavy', ox, oy, ship.angle, 480, 1.2, 16 * ambushMult, 5);
      break;
    case 'shade': {
      const dmg = 7 * ambushMult;
      spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle, 620, 0.55, dmg, 3);
      // firing breaks cloak partially
      ship.cloak = Math.max(0, ship.cloak - 0.35);
      break;
    }
    case 'prism': {
      spawnProjectile(state, ship.player, 'crystal', ox, oy, ship.angle - 0.08, 560, 1.6, 9, 3.5, 0, true);
      spawnProjectile(state, ship.player, 'crystal', ox, oy, ship.angle + 0.08, 560, 1.6, 9, 3.5, 0, true);
      break;
    }
    case 'brood':
      spawnProjectile(state, ship.player, 'spore', ox, oy, ship.angle, 280, 3.5, 18, 7, 1.8);
      break;
    case 'cinder':
      spawnProjectile(state, ship.player, 'flame', ox, oy, ship.angle, 420, 0.45, 5, 4, 0, false, true);
      break;
    case 'grappler':
      spawnProjectile(state, ship.player, 'limpet', ox, oy, ship.angle, 300, 4.0, 2, 6, 2.2);
      break;
    case 'scuttle':
      spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle, 580, 0.55, 5, 2.5);
      // coward peashooter - leave a distracting spark
      addEffect(state, 'spark', ox, oy, SHIPS.scuttle.accent, 8, 0.12);
      break;
    case 'stormlance':
      spawnProjectile(
        state,
        ship.player,
        'crystal',
        ox,
        oy,
        ship.angle,
        700,
        0.55,
        8 * ambushMult,
        2.8,
        1.4,
        true,
      );
      break;
    case 'mirage':
      // Phantom darts - soft trail when unveiled, hard ambush from cloak
      spawnProjectile(
        state,
        ship.player,
        'laser',
        ox,
        oy,
        ship.angle,
        660,
        0.65,
        7 * ambushMult,
        2.8,
        0,
        false,
        ship.cloak > 0.05,
      );
      break;
    case 'harrier':
      spawnProjectile(state, ship.player, 'heavy', ox, oy, ship.angle, 500, 1.3, 13 * ambushMult, 4.5);
      break;
    case 'minewright':
      spawnProjectile(state, ship.player, 'spore', ox, oy, ship.angle, 220, 4.5, 12, 6, 0.4);
      break;
    case 'razorwing': {
      for (const off of [-0.18, 0, 0.18]) {
        spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle + off, 600, 0.55, 5 * ambushMult, 2.5);
      }
      break;
    }
    case 'glacier':
      spawnProjectile(state, ship.player, 'crystal', ox, oy, ship.angle, 420, 2.0, 12 * ambushMult, 5, 0, true);
      break;
    case 'swarmlord': {
      // Fire from wing hardpoints - carrier identity
      const wing = 10;
      spawnProjectile(
        state,
        ship.player,
        'drone_shot',
        ox + Math.cos(ship.angle + Math.PI / 2) * wing,
        oy + Math.sin(ship.angle + Math.PI / 2) * wing,
        ship.angle,
        560,
        0.8,
        6 * ambushMult,
        2.5,
      );
      spawnProjectile(
        state,
        ship.player,
        'drone_shot',
        ox + Math.cos(ship.angle - Math.PI / 2) * wing,
        oy + Math.sin(ship.angle - Math.PI / 2) * wing,
        ship.angle,
        560,
        0.8,
        6 * ambushMult,
        2.5,
      );
      break;
    }
    case 'pulsejet': {
      spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle, 540, 0.9, 9 * ambushMult, 3.5);
      // Pulsing shock tip every few shots
      if (state.tick % 3 === 0) {
        addEffect(state, 'ring', ox, oy, SHIPS.pulsejet.accent, 14, 0.15);
      }
      break;
    }
    case 'railfox':
      spawnProjectile(state, ship.player, 'crystal', ox, oy, ship.angle, 720, 1.4, 11 * ambushMult, 3, 0, true);
      break;
    case 'sanguine':
      spawnProjectile(state, ship.player, 'limpet', ox, oy, ship.angle, 340, 3.2, 4, 5, 2.0);
      break;
    default:
      spawnProjectile(state, ship.player, 'laser', ox, oy, ship.angle, 550, 1.0, 10, 3);
  }

  if (ship.cloak > 0 && ship.shipId !== 'shade') ship.cloak = 0;
}

function useSpecial(state: SimState, ship: ShipRuntime, input: PlayerInput, rng: () => number): void {
  const def = SHIPS[ship.shipId];
  const foe = nearestHostile(state, ship);

  let forced = false;
  if (specialNeedsTelegraph(ship.shipId)) {
    if (ship.pendingSpecial && ship.telegraph <= 0) {
      forced = true;
      ship.pendingSpecial = false;
    } else if (
      input.special &&
      ship.specialCd <= 0 &&
      ship.energy >= def.specialCost &&
      !ship.pendingSpecial
    ) {
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      ship.telegraph = 0.42;
      ship.pendingSpecial = true;
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 55, 0.45);
      addEffect(state, 'spark', ship.x, ship.y, def.color, 28, 0.35);
      return;
    } else {
      return;
    }
  }

  const tryPay = (): boolean => {
    if (forced) return true;
    if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return false;
    ship.energy -= def.specialCost;
    ship.specialCd = def.specialCooldown * ship.cdMult;
    return true;
  };

  switch (ship.shipId) {
    case 'solhammer': {
      if (!tryPay()) return;
      const ox = ship.x + Math.cos(ship.angle) * (def.radius + 8);
      const oy = ship.y + Math.sin(ship.angle) * (def.radius + 8);
      spawnProjectile(state, ship.player, 'nuke', ox, oy, ship.angle, 180, 6.0, 55, 10, 1.4);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 40, 0.35);
      addEffect(state, 'spark', ox, oy, '#ff6b2d', 22, 0.3);
      break;
    }
    case 'zephyr': {
      if (!tryPay()) return;
      addEffect(state, 'teleport', ship.x, ship.y, def.color, 36, 0.4);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 50, 0.35);
      const dist = 160;
      ship.x += Math.cos(ship.angle) * dist;
      ship.y += Math.sin(ship.angle) * dist;
      const w = wrapPos(ship.x, ship.y);
      ship.x = w.x;
      ship.y = w.y;
      ship.invuln = Math.max(ship.invuln, 0.25);
      addEffect(state, 'teleport', ship.x, ship.y, def.accent, 36, 0.4);
      addEffect(state, 'spark', ship.x, ship.y, def.color, 28, 0.3);
      break;
    }
    case 'bulwark': {
      if (!tryPay()) return;
      ship.shield = 2.8;
      addEffect(state, 'shield_flash', ship.x, ship.y, def.accent, 48, 0.5);
      addEffect(state, 'ring', ship.x, ship.y, def.color, 55, 0.4);
      break;
    }
    case 'shade': {
      if (input.special && ship.energy >= 6) {
        const was = ship.cloak;
        ship.energy -= 18 * DT;
        ship.cloak = Math.min(1, ship.cloak + DT * 2.5);
        if (was < 0.15 && ship.cloak >= 0.15) {
          addEffect(state, 'cloak_pop', ship.x, ship.y, def.accent, 28, 0.3);
        }
      } else {
        ship.cloak = Math.max(0, ship.cloak - DT * 1.5);
      }
      break;
    }
    case 'prism': {
      if (!tryPay()) return;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 90, 0.55);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 70, 0.45);
      addEffect(state, 'spark', ship.x, ship.y, '#a5f3fc', 40, 0.4);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        spawnProjectile(
          state,
          ship.player,
          'shard',
          ship.x,
          ship.y,
          a,
          340,
          1.2,
          10,
          3.5,
          0,
          true,
        );
      }
      break;
    }
    case 'brood': {
      if (!tryPay()) return;
      addEffect(state, 'hive', ship.x, ship.y, def.color, 48, 0.5);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 36, 0.4);
      for (let i = 0; i < 2; i++) {
        const a = ship.angle + (i === 0 ? 0.6 : -0.6);
        const dx = ship.x + Math.cos(a) * 28;
        const dy = ship.y + Math.sin(a) * 28;
        state.drones.push({
          id: allocId(state),
          owner: ship.player,
          x: dx,
          y: dy,
          vx: Math.cos(a) * 80,
          vy: Math.sin(a) * 80,
          angle: a,
          life: 12,
          hp: 25,
          fireCd: 0.4,
        });
        addEffect(state, 'spark', dx, dy, def.accent, 18, 0.3);
      }
      break;
    }
    case 'cinder': {
      if (input.special && ship.energy >= 4) {
        ship.energy -= 22 * DT;
        ship.afterburn = 1;
        ship.trailHeat = 1;
        const boost = 520;
        ship.vx += Math.cos(ship.angle) * boost * DT;
        ship.vy += Math.sin(ship.angle) * boost * DT;
        // flame trail hazard projectiles
        if (state.tick % 3 === 0) {
          const bx = ship.x - Math.cos(ship.angle) * 18;
          const by = ship.y - Math.sin(ship.angle) * 18;
          addEffect(state, 'wake', bx, by, '#ff7a20', 16 + (state.tick % 5), 0.35);
          spawnProjectile(
            state,
            ship.player,
            'flame',
            bx,
            by,
            ship.angle + Math.PI,
            40,
            0.7,
            6,
            8,
            0,
            false,
            true,
          );
        }
      } else {
        ship.afterburn = Math.max(0, ship.afterburn - DT * 3);
        ship.trailHeat = Math.max(0, ship.trailHeat - DT);
      }
      break;
    }
    case 'grappler': {
      if (input.special && ship.energy >= 3 && foe) {
        ship.energy -= 16 * DT;
        ship.tractor = 1;
        const { dx, dy, dist } = wrapDelta(ship.x, ship.y, foe.x, foe.y);
        if (dist > 20 && dist < 320) {
          const pull = 220 / Math.max(foe.limpets + 1, 1);
          foe.vx -= (dx / dist) * pull * DT;
          foe.vy -= (dy / dist) * pull * DT;
          ship.vx += (dx / dist) * pull * 0.25 * DT;
          ship.vy += (dy / dist) * pull * 0.25 * DT;
        }
      } else {
        ship.tractor = 0;
      }
      break;
    }
    case 'scuttle': {
      if (!tryPay()) return;
      ship.panic = 0.45;
      ship.vx += Math.cos(ship.angle) * 280;
      ship.vy += Math.sin(ship.angle) * 280;
      addEffect(state, 'panic', ship.x, ship.y, def.color, 42, 0.4);
      addEffect(state, 'spark', ship.x, ship.y, def.accent, 28, 0.3);
      const back = ship.angle + Math.PI;
      const ox = ship.x + Math.cos(back) * (def.radius + 6);
      const oy = ship.y + Math.sin(back) * (def.radius + 6);
      spawnProjectile(state, ship.player, 'butt', ox, oy, back, 260, 2.8, 28, 7, 2.5);
      addEffect(state, 'ring', ox, oy, '#fbbf24', 24, 0.25);
      break;
    }
    case 'nullpoint': {
      if (input.fire && ship.energy >= 2) {
        ship.energy -= 28 * DT;
        ship.cone = 1;
        if (foe) {
          const { dx, dy, dist } = wrapDelta(ship.x, ship.y, foe.x, foe.y);
          const ang = Math.atan2(dy, dx);
          const facing = Math.abs(angDiff(ship.angle, ang));
          if (dist < 220 && facing < 0.55) {
            foe.energy = Math.max(0, foe.energy - 35 * DT);
            foe.slow = Math.max(foe.slow, 0.35);
            damageShip(
              state,
              foe,
              18 * DT * ship.dmgMult * (ship.powerBoost > 0 ? 1.4 : 1),
              ship.x,
              ship.y,
            );
            foe.vx *= 0.985;
            foe.vy *= 0.985;
          }
        }
      } else {
        ship.cone = 0;
      }
      if (input.special && ship.specialCd <= 0 && ship.energy >= def.specialCost) {
        ship.energy -= def.specialCost;
        ship.specialCd = def.specialCooldown * ship.cdMult;
        addEffect(state, 'phase', ship.x, ship.y, def.color, 40, 0.45);
        addEffect(state, 'ring', ship.x, ship.y, def.accent, 55, 0.4);
        ship.invuln = 1.1;
        ship.x = 80 + rng() * (getArenaW() - 160);
        ship.y = 80 + rng() * (getArenaH() - 160);
        // avoid planet
        const pd = Math.hypot(ship.x - getPlanetX(), ship.y - getPlanetY());
        if (pd < state.planetR + 60) {
          ship.x = getPlanetX() + ((ship.x - getPlanetX()) / pd) * (state.planetR + 80);
          ship.y = getPlanetY() + ((ship.y - getPlanetY()) / pd) * (state.planetR + 80);
        }
        ship.vx *= 0.3;
        ship.vy *= 0.3;
        addEffect(state, 'phase', ship.x, ship.y, def.accent, 40, 0.45);
        addEffect(state, 'spark', ship.x, ship.y, '#fecdd3', 32, 0.35);
      }
      break;
    }
    case 'stormlance': {
      if (!tryPay()) return;
      addEffect(state, 'spark', ship.x, ship.y, def.accent, 42, 0.45);
      addEffect(state, 'nova', ship.x, ship.y, def.color, 40, 0.3);
      // Chain arc: forking seekers that bounce intent (pierce + strong home)
      const aim = foe
        ? Math.atan2(
            wrapDelta(ship.x, ship.y, foe.x, foe.y).dy,
            wrapDelta(ship.x, ship.y, foe.x, foe.y).dx,
          )
        : ship.angle;
      for (let i = 0; i < 5; i++) {
        const a = aim + (i - 2) * 0.14;
        const ox = ship.x + Math.cos(a) * (def.radius + 6);
        const oy = ship.y + Math.sin(a) * (def.radius + 6);
        spawnProjectile(state, ship.player, 'crystal', ox, oy, a, 640, 1.1, 11, 3, 3.2, true);
      }
      break;
    }
    case 'mirage': {
      if (!tryPay()) return;
      addEffect(state, 'cloak_pop', ship.x, ship.y, def.color, 34, 0.4);
      addEffect(state, 'teleport', ship.x, ship.y, def.accent, 28, 0.35);
      ship.vx *= -1.15;
      ship.vy *= -1.15;
      ship.cloak = Math.max(ship.cloak, 0.7);
      ship.invuln = Math.max(ship.invuln, 0.35);
      break;
    }
    case 'harrier': {
      if (!tryPay()) return;
      ship.afterburn = 0.55;
      ship.panic = 0.35;
      ship.vx += Math.cos(ship.angle) * 320;
      ship.vy += Math.sin(ship.angle) * 320;
      addEffect(state, 'wake', ship.x, ship.y, def.accent, 30, 0.35);
      addEffect(state, 'panic', ship.x, ship.y, def.color, 36, 0.35);
      const ox = ship.x + Math.cos(ship.angle) * (def.radius + 10);
      const oy = ship.y + Math.sin(ship.angle) * (def.radius + 10);
      spawnProjectile(state, ship.player, 'heavy', ox, oy, ship.angle, 380, 1.6, 28, 7, 0.8);
      break;
    }
    case 'minewright': {
      if (!tryPay()) return;
      addEffect(state, 'hive', ship.x, ship.y, def.color, 44, 0.45);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 60, 0.4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const mx = ship.x + Math.cos(a) * 70;
        const my = ship.y + Math.sin(a) * 70;
        spawnProjectile(state, ship.player, 'flame', mx, my, a, 8, 5.5, 16, 8, 0, false, true);
        addEffect(state, 'spark', mx, my, def.accent, 12, 0.25);
      }
      break;
    }
    case 'razorwing': {
      if (!tryPay()) return;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 50, 0.35);
      for (let i = 0; i < 9; i++) {
        const a = ship.angle + (i - 4) * 0.16;
        spawnProjectile(state, ship.player, 'shard', ship.x, ship.y, a, 480, 0.85, 8, 3);
      }
      break;
    }
    case 'glacier': {
      if (!tryPay()) return;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 80, 0.5);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 90, 0.45);
      if (foe) {
        const { dist } = wrapDelta(ship.x, ship.y, foe.x, foe.y);
        if (dist < 200) {
          foe.slow = Math.max(foe.slow, 1.6);
          damageShip(
            state,
            foe,
            22 * ship.dmgMult * (ship.powerBoost > 0 ? 1.4 : 1),
            ship.x,
            ship.y,
          );
          foe.vx *= 0.55;
          foe.vy *= 0.55;
        }
      }
      break;
    }
    case 'swarmlord': {
      if (!tryPay()) return;
      addEffect(state, 'hive', ship.x, ship.y, def.color, 50, 0.5);
      for (let i = 0; i < 4; i++) {
        const a = ship.angle + (i - 1.5) * 0.45;
        const dx = ship.x + Math.cos(a) * 26;
        const dy = ship.y + Math.sin(a) * 26;
        state.drones.push({
          id: allocId(state),
          owner: ship.player,
          x: dx,
          y: dy,
          vx: Math.cos(a) * 100,
          vy: Math.sin(a) * 100,
          angle: a,
          life: 9,
          hp: 16,
          fireCd: 0.25,
        });
        addEffect(state, 'spark', dx, dy, def.accent, 16, 0.25);
      }
      break;
    }
    case 'pulsejet': {
      if (!tryPay()) return;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 85, 0.5);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 95, 0.4);
      if (foe) {
        const { dx, dy, dist } = wrapDelta(ship.x, ship.y, foe.x, foe.y);
        if (dist < 180 && dist > 1) {
          damageShip(
            state,
            foe,
            24 * ship.dmgMult * (ship.powerBoost > 0 ? 1.4 : 1),
            ship.x,
            ship.y,
          );
          const push = 340;
          foe.vx += (dx / dist) * push;
          foe.vy += (dy / dist) * push;
          ship.vx -= (dx / dist) * push * 0.55;
          ship.vy -= (dy / dist) * push * 0.55;
        }
      }
      break;
    }
    case 'railfox': {
      if (!tryPay()) return;
      const ox = ship.x + Math.cos(ship.angle) * (def.radius + 10);
      const oy = ship.y + Math.sin(ship.angle) * (def.radius + 10);
      // Sniper rail: ultra-fast pierce + beam telegraph along the shot
      spawnProjectile(state, ship.player, 'crystal', ox, oy, ship.angle, 1100, 1.35, 48, 3.5, 0, true);
      for (let i = 1; i <= 6; i++) {
        const bx = ox + Math.cos(ship.angle) * i * 55;
        const by = oy + Math.sin(ship.angle) * i * 55;
        addEffect(state, 'spark', bx, by, def.accent, 10, 0.18);
      }
      addEffect(state, 'ring', ship.x, ship.y, def.color, 40, 0.28);
      break;
    }
    case 'sanguine': {
      if (!tryPay()) return;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 55, 0.4);
      addEffect(state, 'spark', ship.x, ship.y, def.accent, 28, 0.35);
      if (foe) {
        const { dist } = wrapDelta(ship.x, ship.y, foe.x, foe.y);
        if (dist < 160) {
          const stolen = 28 * ship.dmgMult * (ship.powerBoost > 0 ? 1.4 : 1);
          damageShip(state, foe, stolen, ship.x, ship.y);
          ship.hp = Math.min(ship.maxHp, ship.hp + stolen * 0.7);
          foe.slow = Math.max(foe.slow, 0.5);
        }
      }
      break;
    }
  }
}

function updateShip(
  state: SimState,
  ship: ShipRuntime,
  input: PlayerInput,
  rng: () => number,
): void {
  if (!ship.alive) return;
  const def = SHIPS[ship.shipId];

  ship.fireCd = Math.max(0, ship.fireCd - DT);
  ship.specialCd = Math.max(0, ship.specialCd - DT);
  ship.invuln = Math.max(0, ship.invuln - DT);
  ship.slow = Math.max(0, ship.slow - DT);
  ship.flash = Math.max(0, ship.flash - DT);
  ship.hitRead = Math.max(0, ship.hitRead - DT);
  ship.panic = Math.max(0, ship.panic - DT);
  ship.powerBoost = Math.max(0, ship.powerBoost - DT);
  ship.hasteBoost = Math.max(0, ship.hasteBoost - DT);
  if (ship.telegraph > 0) {
    ship.telegraph = Math.max(0, ship.telegraph - DT);
    ship.flash = Math.max(ship.flash, 0.12);
  }
  if (ship.shield > 0) ship.shield = Math.max(0, ship.shield - DT);
  if (ship.shipId !== 'shade') ship.cloak = Math.max(0, ship.cloak - DT);

  const limpetDrag = 1 + ship.limpets * 0.18;
  const hasteMul = ship.hasteBoost > 0 ? 1.4 : 1;
  const turnMul = (ship.slow > 0 ? 0.55 : 1) * hasteMul;
  const thrustMul = ((ship.slow > 0 ? 0.55 : 1) / limpetDrag) * hasteMul;

  // Turn inertia: heavy ships spool up/down slowly
  let desire = 0;
  if (input.left) desire -= 1;
  if (input.right) desire += 1;
  const targetOmega = desire * def.turnRate * turnMul;
  const diff = targetOmega - ship.omega;
  const maxDelta = def.turnAccel * turnMul * DT;
  ship.omega += clamp(diff, -maxDelta, maxDelta);
  if (desire === 0) {
    ship.omega *= Math.pow(def.turnDamp, DT * 60);
    if (Math.abs(ship.omega) < 0.02) ship.omega = 0;
  }
  ship.angle = normalizeAngle(ship.angle + ship.omega * DT);

  if (input.thrust) {
    const accel =
      (def.thrust / def.mass) *
      thrustMul *
      ship.thrustMult *
      (ship.panic > 0 ? 1.35 : 1);
    ship.vx += Math.cos(ship.angle) * accel * DT;
    ship.vy += Math.sin(ship.angle) * accel * DT;
    ship.thrustTime += DT;
    ship.energy = Math.max(0, ship.energy - 3.6 * DT);
  } else {
    ship.thrustTime = 0;
  }

  applyGravity(ship, state, input.thrust);
  limitSpeed(ship);
  applyScrapZones(state, ship);

  ship.x += ship.vx * DT;
  ship.y += ship.vy * DT;
  const w = wrapPos(ship.x, ship.y);
  ship.x = w.x;
  ship.y = w.y;

  // planet collision
  const pd = Math.hypot(ship.x - getPlanetX(), ship.y - getPlanetY());
  if (pd < state.planetR + def.radius * 0.55) {
    damageShip(state, ship, 999);
  }

  // Tight batt economy - waiting and baiting matter
  ship.energy = clamp(
    ship.energy + def.energyRegen * 0.72 * ship.regenMult * DT,
    0,
    ship.maxEnergy,
  );

  if (input.fire) primaryFire(state, ship);
  useSpecial(state, ship, input, rng);

  // limpets slowly fall off
  if (ship.limpets > 0 && state.tick % 90 === 0) {
    ship.limpets = Math.max(0, ship.limpets - 1);
  }
}

function updateProjectiles(state: SimState): void {
  const next: Projectile[] = [];
  for (const p of state.projectiles) {
    p.life -= DT;
    if (p.life <= 0) {
      if (p.kind === 'nuke') {
        // explode on timeout
        nukeBlast(state, p);
      }
      continue;
    }

    // homing
    if (p.homing > 0) {
      const owner = state.ships[p.owner];
      const target = owner ? nearestHostile(state, owner) : null;
      if (target && (target.cloak < 0.5 || p.kind === 'nuke')) {
        const { dx, dy } = wrapDelta(p.x, p.y, target.x, target.y);
        const desired = Math.atan2(dy, dx);
        const cur = Math.atan2(p.vy, p.vx);
        const diff = angDiff(cur, desired);
        const turn = clamp(diff, -p.homing * DT * 3, p.homing * DT * 3);
        const spd = Math.hypot(p.vx, p.vy);
        const na = cur + turn;
        p.vx = Math.cos(na) * spd;
        p.vy = Math.sin(na) * spd;
      }
    }

    p.x += p.vx * DT;
    p.y += p.vy * DT;
    const w = wrapPos(p.x, p.y);
    p.x = w.x;
    p.y = w.y;

    // planet
    if (Math.hypot(p.x - getPlanetX(), p.y - getPlanetY()) < state.planetR) {
      if (p.kind === 'nuke') nukeBlast(state, p);
      else if (p.kind === 'crystal' || p.kind === 'shard') {
        // bounce off planet
        const dx = p.x - getPlanetX();
        const dy = p.y - getPlanetY();
        const n = Math.hypot(dx, dy) || 1;
        const nx = dx / n;
        const ny = dy / n;
        const dot = p.vx * nx + p.vy * ny;
        p.vx -= 2 * dot * nx;
        p.vy -= 2 * dot * ny;
        p.x = getPlanetX() + nx * (state.planetR + 2);
        p.y = getPlanetY() + ny * (state.planetR + 2);
        next.push(p);
      }
      continue;
    }

    let absorbed = false;
    const ownerShip = state.ships[p.owner];
    for (const ship of state.ships) {
      if (!ship.alive) continue;
      if (ownerShip) {
        if (!isHostile(ownerShip, ship)) continue;
      } else if (ship.player === p.owner) {
        continue;
      }
      if (ship.cloak > 0.7 && p.kind !== 'nuke' && p.homing <= 0) {
        // cloaked: harder to hit unless close
        const d = wrapDelta(p.x, p.y, ship.x, ship.y).dist;
        if (d > SHIPS[ship.shipId].radius + p.radius) continue;
      }
      const hitR = SHIPS[ship.shipId].radius + p.radius;
      const d = wrapDelta(p.x, p.y, ship.x, ship.y).dist;
      if (d > hitR) continue;

      // shield reflect
      if (ship.shield > 0 && (p.kind === 'laser' || p.kind === 'heavy' || p.kind === 'crystal' || p.kind === 'shard')) {
        p.owner = ship.player;
        p.vx *= -1.05;
        p.vy *= -1.05;
        p.life = Math.min(p.life + 0.4, 2);
        addEffect(state, 'shield_flash', ship.x, ship.y, SHIPS[ship.shipId].accent, 26, 0.15);
        next.push(p);
        absorbed = true;
        break;
      }

      if (p.kind === 'limpet') {
        ship.limpets = Math.min(6, ship.limpets + 1);
        ship.slow = Math.max(ship.slow, 0.8);
        damageShip(state, ship, p.damage, p.x, p.y);
        absorbed = true;
        break;
      }

      if (p.kind === 'nuke') {
        nukeBlast(state, p);
        absorbed = true;
        break;
      }

      damageShip(state, ship, p.damage, p.x, p.y);
      if (p.kind === 'spore') ship.slow = Math.max(ship.slow, 0.5);
      if (!p.pierce) {
        absorbed = true;
        break;
      }
    }

    // drones hit
    if (!absorbed) {
      for (let i = state.drones.length - 1; i >= 0; i--) {
        const dr = state.drones[i];
        if (!hostileBySlots(state, p.owner, dr.owner)) continue;
        if (Math.hypot(p.x - dr.x, p.y - dr.y) < p.radius + 8) {
          dr.hp -= p.damage;
          if (dr.hp <= 0) {
            addEffect(state, 'explosion', dr.x, dr.y, '#84cc16', 16, 0.25);
            state.drones.splice(i, 1);
          }
          if (!p.pierce) {
            absorbed = true;
            break;
          }
        }
      }
    }

    // asteroids hit
    if (!absorbed) {
      for (let i = state.asteroids.length - 1; i >= 0; i--) {
        const a = state.asteroids[i];
        if (Math.hypot(p.x - a.x, p.y - a.y) > p.radius + a.radius) continue;
        a.hp -= p.damage;
        a.vx += p.vx * 0.12;
        a.vy += p.vy * 0.12;
        if (a.hp <= 0) {
          const col = asteroidColor(a.kind);
          addEffect(state, 'explosion', a.x, a.y, col, a.radius * 1.6, 0.28);
          addEffect(state, 'spark', a.x, a.y, col, a.radius, 0.22);
          state.asteroids.splice(i, 1);
        }
        if (!p.pierce) {
          absorbed = true;
          break;
        }
      }
    }

    if (!absorbed) next.push(p);
  }
  state.projectiles = next;
}

const ASTEROID_COLORS: Record<AsteroidKind, string> = {
  rock: '#9a8468',
  heal: '#4ade80',
  energy: '#38bdf8',
  power: '#f97316',
  haste: '#c084fc',
  shield: '#fbbf24',
};

function asteroidColor(kind: AsteroidKind): string {
  return ASTEROID_COLORS[kind];
}

function spawnAsteroid(
  state: SimState,
  rng: () => number,
  forceBonus = false,
): void {
  const mul = state.map?.asteroidMul ?? 1;
  const cap = mul >= 2 ? 3 : 1;
  if (state.asteroids.length >= cap) return;
  const edge = Math.floor(rng() * 4);
  let x = 0;
  let y = 0;
  if (edge === 0) {
    x = rng() * getArenaW();
    y = -14;
  } else if (edge === 1) {
    x = getArenaW() + 14;
    y = rng() * getArenaH();
  } else if (edge === 2) {
    x = rng() * getArenaW();
    y = getArenaH() + 14;
  } else {
    x = -14;
    y = rng() * getArenaH();
  }

  const tx = getArenaW() * (0.22 + rng() * 0.56);
  const ty = getArenaH() * (0.22 + rng() * 0.56);
  const ang = Math.atan2(ty - y, tx - x) + (rng() - 0.5) * 0.7;
  const spd = 75 + rng() * 120;

  const bonus = forceBonus || rng() < 0.34;
  let kind: AsteroidKind = 'rock';
  if (bonus) {
    const picks: AsteroidKind[] = ['heal', 'energy', 'power', 'haste', 'shield'];
    kind = picks[Math.floor(rng() * picks.length)]!;
  }

  const radius = kind === 'rock' ? 12 + rng() * 13 : 9 + rng() * 5;
  state.asteroids.push({
    id: allocId(state),
    kind,
    x,
    y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    radius,
    spin: rng() * Math.PI * 2,
    omega: (rng() - 0.5) * 4.5,
    hp: kind === 'rock' ? 28 + radius * 2.2 : 16,
    life: kind === 'rock' ? 30 : 20,
  });
}

function applyAsteroidBonus(
  state: SimState,
  ship: ShipRuntime,
  kind: Exclude<AsteroidKind, 'rock'>,
): void {
  const color = asteroidColor(kind);
  switch (kind) {
    case 'heal':
      ship.hp = Math.min(ship.maxHp, ship.hp + 40);
      break;
    case 'energy':
      ship.energy = Math.min(ship.maxEnergy, ship.energy + 52);
      break;
    case 'power':
      ship.powerBoost = Math.max(ship.powerBoost, 7.5);
      break;
    case 'haste':
      ship.hasteBoost = Math.max(ship.hasteBoost, 7.5);
      break;
    case 'shield':
      ship.shield = Math.max(ship.shield, 4);
      break;
  }
  addEffect(state, 'pickup', ship.x, ship.y, color, 30, 0.5);
  addEffect(state, 'ring', ship.x, ship.y, color, 40, 0.38);
  addEffect(state, 'spark', ship.x, ship.y, color, 22, 0.32);
}

function updateAsteroids(state: SimState, rng: () => number): void {
  const mul = Math.max(0.5, state.map?.asteroidMul ?? 1);
  const interval = Math.max(48, Math.round(210 / mul));
  const maxRocks = mul >= 2 ? 3 : 1;
  if (state.asteroids.length < maxRocks) {
    if (
      state.tick === 48 ||
      (state.tick > 120 && state.tick % interval === 0)
    ) {
      spawnAsteroid(state, rng, state.tick % (interval * 2) === 0);
    }
  }

  const next: Asteroid[] = [];
  for (const a of state.asteroids) {
    a.life -= DT;
    if (a.life <= 0) continue;

    const dx = getPlanetX() - a.x;
    const dy = getPlanetY() - a.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    if (d > state.planetR + 24) {
      const force = (state.gravity * 0.32) / d2;
      a.vx += (dx / d) * force * DT;
      a.vy += (dy / d) * force * DT;
    }

    const sp = Math.hypot(a.vx, a.vy);
    const maxSp = a.kind === 'rock' ? 230 : 170;
    if (sp > maxSp) {
      a.vx = (a.vx / sp) * maxSp;
      a.vy = (a.vy / sp) * maxSp;
    }

    a.x += a.vx * DT;
    a.y += a.vy * DT;
    a.spin += a.omega * DT;
    const w = wrapPos(a.x, a.y);
    a.x = w.x;
    a.y = w.y;

    if (Math.hypot(a.x - getPlanetX(), a.y - getPlanetY()) < state.planetR + a.radius * 0.45) {
      addEffect(state, 'explosion', a.x, a.y, asteroidColor(a.kind), a.radius * 1.4, 0.22);
      continue;
    }

    let consumed = false;
    for (const ship of state.ships) {
      if (!ship.alive) continue;
      const hitR = SHIPS[ship.shipId].radius + a.radius;
      if (wrapDelta(a.x, a.y, ship.x, ship.y).dist > hitR) continue;
      consumed = true;
      if (a.kind === 'rock') {
        if (ship.invuln <= 0) {
          // Table-tilt: shove hard, scratch lightly
          damageShip(state, ship, 2 + a.radius * 0.12, a.x, a.y);
          const { dx: kx, dy: ky } = wrapDelta(a.x, a.y, ship.x, ship.y);
          const n = Math.hypot(kx, ky) || 1;
          const kick = 210 + a.radius * 4;
          ship.vx += (kx / n) * kick;
          ship.vy += (ky / n) * kick;
          a.vx -= (kx / n) * kick * 0.35;
          a.vy -= (ky / n) * kick * 0.35;
        }
        addEffect(state, 'spark', a.x, a.y, '#c4a882', a.radius * 1.4, 0.22);
        addEffect(state, 'ring', a.x, a.y, '#9a8468', a.radius * 1.2, 0.18);
      } else {
        applyAsteroidBonus(state, ship, a.kind);
      }
      break;
    }
    if (!consumed) next.push(a);
  }
  state.asteroids = next;
}

function nukeBlast(state: SimState, p: Projectile): void {
  addEffect(state, 'nuke_flash', p.x, p.y, '#ff6b2d', 120, 0.7);
  addEffect(state, 'explosion', p.x, p.y, '#ffb347', 90, 0.55);
  addEffect(state, 'ring', p.x, p.y, '#ffe08a', 100, 0.5);
  addEffect(state, 'spark', p.x, p.y, '#fff5e6', 60, 0.4);
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    const d = wrapDelta(p.x, p.y, ship.x, ship.y).dist;
    if (d < 95) {
      const falloff = 1 - d / 95;
      damageShip(state, ship, p.damage * falloff, p.x, p.y);
      const { dx, dy } = wrapDelta(p.x, p.y, ship.x, ship.y);
      const n = Math.hypot(dx, dy) || 1;
      ship.vx += (dx / n) * 200 * falloff;
      ship.vy += (dy / n) * 200 * falloff;
    }
  }
}

function updateDrones(state: SimState): void {
  const next: Drone[] = [];
  for (const dr of state.drones) {
    dr.life -= DT;
    if (dr.life <= 0) continue;
    const owner = state.ships[dr.owner];
    const foe = owner
      ? nearestHostile(state, owner)
      : state.ships.find((s) => s.alive && s.player !== dr.owner) ?? null;
    if (foe) {
      const { dx, dy, dist } = wrapDelta(dr.x, dr.y, foe.x, foe.y);
      const desired = Math.atan2(dy, dx);
      const diff = angDiff(dr.angle, desired);
      dr.angle += clamp(diff, -4 * DT, 4 * DT);
      dr.vx += Math.cos(dr.angle) * 220 * DT;
      dr.vy += Math.sin(dr.angle) * 220 * DT;
      const sp = Math.hypot(dr.vx, dr.vy);
      if (sp > 260) {
        dr.vx = (dr.vx / sp) * 260;
        dr.vy = (dr.vy / sp) * 260;
      }
      dr.fireCd -= DT;
      if (dr.fireCd <= 0 && dist < 280) {
        dr.fireCd = 0.55;
        spawnProjectile(
          state,
          dr.owner,
          'drone_shot',
          dr.x,
          dr.y,
          dr.angle,
          400,
          0.9,
          6,
          3,
        );
      }
    }
    // gravity light
    const gdx = getPlanetX() - dr.x;
    const gdy = getPlanetY() - dr.y;
    const gd = Math.hypot(gdx, gdy) || 1;
    dr.vx += (gdx / gd) * (state.gravity * 0.4) / (gd * gd) * DT;
    dr.vy += (gdy / gd) * (state.gravity * 0.4) / (gd * gd) * DT;

    dr.x += dr.vx * DT;
    dr.y += dr.vy * DT;
    const w = wrapPos(dr.x, dr.y);
    dr.x = w.x;
    dr.y = w.y;
    if (Math.hypot(dr.x - getPlanetX(), dr.y - getPlanetY()) < state.planetR) continue;

    // collide with enemy ship
    for (const ship of state.ships) {
      if (!ship.alive || !hostileBySlots(state, dr.owner, ship.player)) continue;
      if (wrapDelta(dr.x, dr.y, ship.x, ship.y).dist < SHIPS[ship.shipId].radius + 8) {
        damageShip(state, ship, 12, dr.x, dr.y);
        dr.hp -= 15;
      }
    }
    if (dr.hp <= 0) {
      addEffect(state, 'explosion', dr.x, dr.y, '#84cc16', 14, 0.2);
      continue;
    }
    next.push(dr);
  }
  state.drones = next;
}

function updateEffects(state: SimState): void {
  state.effects = state.effects.filter((e) => {
    e.life -= DT;
    return e.life > 0;
  });
}

function shipCollision(state: SimState): void {
  const n = state.ships.length;
  for (let i = 0; i < n; i++) {
    const a = state.ships[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < n; j++) {
      const b = state.ships[j];
      if (!b.alive) continue;
      const { dx, dy, dist } = wrapDelta(a.x, a.y, b.x, b.y);
      const minD = SHIPS[a.shipId].radius + SHIPS[b.shipId].radius;
      if (dist >= minD || dist < 0.01) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minD - dist;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
      const bounce = 120;
      a.vx -= nx * bounce;
      a.vy -= ny * bounce;
      b.vx += nx * bounce;
      b.vy += ny * bounce;
      if (!isHostile(a, b)) continue;
      const impact = Math.abs((b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
      const dmg = 8 + impact * 0.08;
      damageShip(state, a, dmg, b.x, b.y);
      damageShip(state, b, dmg, a.x, a.y);
    }
  }
}

function checkWinner(state: SimState): void {
  if (state.winner !== null) return;

  if (state.format === 'teams2v2') {
    let t0 = 0;
    let t1 = 0;
    let alive0: ShipRuntime | null = null;
    let alive1: ShipRuntime | null = null;
    for (const s of state.ships) {
      if (!s.alive) continue;
      if (s.team === 0) {
        t0++;
        alive0 = alive0 ?? s;
      } else if (s.team === 1) {
        t1++;
        alive1 = alive1 ?? s;
      }
    }
    if (t0 === 0 && t1 === 0) {
      state.winner = -1;
      state.winnerTeam = null;
    } else if (t0 === 0 && alive1) {
      state.winner = alive1.player;
      state.winnerTeam = 1;
    } else if (t1 === 0 && alive0) {
      state.winner = alive0.player;
      state.winnerTeam = 0;
    }
    return;
  }

  if (state.format === 'ffa20' || state.ships.length > 2) {
    const alive = state.ships.filter((s) => s.alive);
    if (alive.length === 0) state.winner = -1;
    else if (alive.length === 1) state.winner = alive[0].player;
    return;
  }

  const [a, b] = state.ships;
  if (!a.alive && !b.alive) state.winner = -1;
  else if (!a.alive) state.winner = 1;
  else if (!b.alive) state.winner = 0;
}

export function stepSim(state: SimState, inputs: PlayerInput[]): void {
  if (state.winner !== null) {
    updateEffects(state);
    return;
  }
  const rng = mulberry32(state.seed + state.tick * 9973);
  for (let i = 0; i < state.ships.length; i++) {
    updateShip(state, state.ships[i], inputs[i] ?? EMPTY_INPUT, rng);
  }
  shipCollision(state);
  updateProjectiles(state);
  updateDrones(state);
  updateAsteroids(state, rng);
  updateEffects(state);
  checkWinner(state);
  state.tick += 1;
}

/** Serialize inputs compactly for net */
export function packInput(i: PlayerInput): number {
  let n = 0;
  if (i.left) n |= 1;
  if (i.right) n |= 2;
  if (i.thrust) n |= 4;
  if (i.fire) n |= 8;
  if (i.special) n |= 16;
  return n;
}

export function unpackInput(n: number): PlayerInput {
  return {
    left: (n & 1) !== 0,
    right: (n & 2) !== 0,
    thrust: (n & 4) !== 0,
    fire: (n & 8) !== 0,
    special: (n & 16) !== 0,
  };
}
