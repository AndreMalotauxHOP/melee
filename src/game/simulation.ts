import { SHIPS } from './ships';
import { combatMods, EMPTY_UPGRADES, type PlayerUpgrades } from './upgrades';
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
  MAX_SPEED,
  PLANET_X,
  PLANET_Y,
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

function spawnShip(
  player: 0 | 1,
  shipId: ShipId,
  ups: PlayerUpgrades = EMPTY_UPGRADES,
): ShipRuntime {
  const def = SHIPS[shipId];
  const mods = combatMods(ups);
  const left = player === 0;
  const x = left ? ARENA_W * 0.2 : ARENA_W * 0.8;
  const y = ARENA_H * 0.5;
  // mild orbital drift so ships do not freefall into the planet
  const orbit = left ? -70 : 70;
  const maxHp = Math.round(def.maxHp * mods.hp);
  const maxEnergy = Math.round(def.maxEnergy * mods.energy);
  return {
    player,
    shipId,
    x,
    y,
    vx: 0,
    vy: orbit,
    angle: left ? 0 : Math.PI,
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
  };
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
  },
): SimState {
  const planet = opts?.planet ?? planetFromSeed(seed);
  const ups = opts?.upgrades ?? [EMPTY_UPGRADES, EMPTY_UPGRADES];
  const a = spawnShip(0, ship0, ups[0]);
  const b = spawnShip(1, ship1, ups[1]);
  if (opts?.fullHeal0) a.hp = a.maxHp;
  else if (opts?.hp0 !== undefined) a.hp = clamp(opts.hp0, 1, a.maxHp);
  if (opts?.fullHeal1) b.hp = b.maxHp;
  else if (opts?.hp1 !== undefined) b.hp = clamp(opts.hp1, 1, b.maxHp);
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
    winner: null,
    nextId: 1,
    seed,
    planetR: planet.planetR,
    gravity: planet.gravity,
    gravityTier: planet.gravityTier,
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
  owner: 0 | 1,
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
  const dx = PLANET_X - ship.x;
  const dy = PLANET_Y - ship.y;
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
    ship.flash = 0.15;
    if (fromX !== undefined && fromY !== undefined) {
      addEffect(state, 'shield_flash', ship.x, ship.y, SHIPS[ship.shipId].accent, 28, 0.2);
    }
    return;
  }
  const ambush = ship.cloak > 0 ? 0 : 1;
  // attacker ambush handled at projectile hit
  void ambush;
  ship.hp -= amount;
  ship.flash = 0.2;
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.alive = false;
    ship.cloak = 0;
    addEffect(state, 'explosion', ship.x, ship.y, SHIPS[ship.shipId].color, 50, 0.6);
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
  const foe = state.ships[ship.player === 0 ? 1 : 0];

  switch (ship.shipId) {
    case 'solhammer': {
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      const ox = ship.x + Math.cos(ship.angle) * (def.radius + 8);
      const oy = ship.y + Math.sin(ship.angle) * (def.radius + 8);
      spawnProjectile(state, ship.player, 'nuke', ox, oy, ship.angle, 180, 6.0, 55, 10, 1.4);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 40, 0.35);
      addEffect(state, 'spark', ox, oy, '#ff6b2d', 22, 0.3);
      break;
    }
    case 'zephyr': {
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (input.special && ship.energy >= 3 && foe.alive) {
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
        if (foe.alive) {
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
        ship.x = 80 + rng() * (ARENA_W - 160);
        ship.y = 80 + rng() * (ARENA_H - 160);
        // avoid planet
        const pd = Math.hypot(ship.x - PLANET_X, ship.y - PLANET_Y);
        if (pd < state.planetR + 60) {
          ship.x = PLANET_X + ((ship.x - PLANET_X) / pd) * (state.planetR + 80);
          ship.y = PLANET_Y + ((ship.y - PLANET_Y) / pd) * (state.planetR + 80);
        }
        ship.vx *= 0.3;
        ship.vy *= 0.3;
        addEffect(state, 'phase', ship.x, ship.y, def.accent, 40, 0.45);
        addEffect(state, 'spark', ship.x, ship.y, '#fecdd3', 32, 0.35);
      }
      break;
    }
    case 'stormlance': {
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'spark', ship.x, ship.y, def.accent, 42, 0.45);
      addEffect(state, 'nova', ship.x, ship.y, def.color, 40, 0.3);
      // Chain arc: forking seekers that bounce intent (pierce + strong home)
      const aim = foe.alive
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'cloak_pop', ship.x, ship.y, def.color, 34, 0.4);
      addEffect(state, 'teleport', ship.x, ship.y, def.accent, 28, 0.35);
      ship.vx *= -1.15;
      ship.vy *= -1.15;
      ship.cloak = Math.max(ship.cloak, 0.7);
      ship.invuln = Math.max(ship.invuln, 0.35);
      break;
    }
    case 'harrier': {
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 50, 0.35);
      for (let i = 0; i < 9; i++) {
        const a = ship.angle + (i - 4) * 0.16;
        spawnProjectile(state, ship.player, 'shard', ship.x, ship.y, a, 480, 0.85, 8, 3);
      }
      break;
    }
    case 'glacier': {
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 80, 0.5);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 90, 0.45);
      if (foe.alive) {
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'hive', ship.x, ship.y, def.color, 50, 0.5);
      for (let i = 0; i < 3; i++) {
        const a = ship.angle + (i - 1) * 0.55;
        const dx = ship.x + Math.cos(a) * 26;
        const dy = ship.y + Math.sin(a) * 26;
        state.drones.push({
          id: allocId(state),
          owner: ship.player,
          x: dx,
          y: dy,
          vx: Math.cos(a) * 90,
          vy: Math.sin(a) * 90,
          angle: a,
          life: 8,
          hp: 18,
          fireCd: 0.3,
        });
        addEffect(state, 'spark', dx, dy, def.accent, 16, 0.25);
      }
      break;
    }
    case 'pulsejet': {
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 85, 0.5);
      addEffect(state, 'ring', ship.x, ship.y, def.accent, 95, 0.4);
      if (foe.alive) {
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
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
      if (!input.special || ship.specialCd > 0 || ship.energy < def.specialCost) return;
      ship.energy -= def.specialCost;
      ship.specialCd = def.specialCooldown * ship.cdMult;
      addEffect(state, 'nova', ship.x, ship.y, def.color, 55, 0.4);
      addEffect(state, 'spark', ship.x, ship.y, def.accent, 28, 0.35);
      if (foe.alive) {
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
  ship.panic = Math.max(0, ship.panic - DT);
  ship.powerBoost = Math.max(0, ship.powerBoost - DT);
  ship.hasteBoost = Math.max(0, ship.hasteBoost - DT);
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

  ship.x += ship.vx * DT;
  ship.y += ship.vy * DT;
  const w = wrapPos(ship.x, ship.y);
  ship.x = w.x;
  ship.y = w.y;

  // planet collision
  const pd = Math.hypot(ship.x - PLANET_X, ship.y - PLANET_Y);
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
      const target = state.ships[p.owner === 0 ? 1 : 0];
      if (target.alive && (target.cloak < 0.5 || p.kind === 'nuke')) {
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
    if (Math.hypot(p.x - PLANET_X, p.y - PLANET_Y) < state.planetR) {
      if (p.kind === 'nuke') nukeBlast(state, p);
      else if (p.kind === 'crystal' || p.kind === 'shard') {
        // bounce off planet
        const dx = p.x - PLANET_X;
        const dy = p.y - PLANET_Y;
        const n = Math.hypot(dx, dy) || 1;
        const nx = dx / n;
        const ny = dy / n;
        const dot = p.vx * nx + p.vy * ny;
        p.vx -= 2 * dot * nx;
        p.vy -= 2 * dot * ny;
        p.x = PLANET_X + nx * (state.planetR + 2);
        p.y = PLANET_Y + ny * (state.planetR + 2);
        next.push(p);
      }
      continue;
    }

    let absorbed = false;
    for (const ship of state.ships) {
      if (!ship.alive || ship.player === p.owner) continue;
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
        if (dr.owner === p.owner) continue;
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
  if (state.asteroids.length > 0) return;
  const edge = Math.floor(rng() * 4);
  let x = 0;
  let y = 0;
  if (edge === 0) {
    x = rng() * ARENA_W;
    y = -14;
  } else if (edge === 1) {
    x = ARENA_W + 14;
    y = rng() * ARENA_H;
  } else if (edge === 2) {
    x = rng() * ARENA_W;
    y = ARENA_H + 14;
  } else {
    x = -14;
    y = rng() * ARENA_H;
  }

  const tx = ARENA_W * (0.22 + rng() * 0.56);
  const ty = ARENA_H * (0.22 + rng() * 0.56);
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
  if (state.asteroids.length === 0) {
    if (state.tick === 48 || (state.tick > 180 && state.tick % 210 === 0)) {
      spawnAsteroid(state, rng, state.tick % 420 === 0);
    }
  }

  const next: Asteroid[] = [];
  for (const a of state.asteroids) {
    a.life -= DT;
    if (a.life <= 0) continue;

    const dx = PLANET_X - a.x;
    const dy = PLANET_Y - a.y;
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

    if (Math.hypot(a.x - PLANET_X, a.y - PLANET_Y) < state.planetR + a.radius * 0.45) {
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
    const foe = state.ships[dr.owner === 0 ? 1 : 0];
    if (foe.alive) {
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
    const gdx = PLANET_X - dr.x;
    const gdy = PLANET_Y - dr.y;
    const gd = Math.hypot(gdx, gdy) || 1;
    dr.vx += (gdx / gd) * (state.gravity * 0.4) / (gd * gd) * DT;
    dr.vy += (gdy / gd) * (state.gravity * 0.4) / (gd * gd) * DT;

    dr.x += dr.vx * DT;
    dr.y += dr.vy * DT;
    const w = wrapPos(dr.x, dr.y);
    dr.x = w.x;
    dr.y = w.y;
    if (Math.hypot(dr.x - PLANET_X, dr.y - PLANET_Y) < state.planetR) continue;

    // collide with enemy ship
    for (const ship of state.ships) {
      if (!ship.alive || ship.player === dr.owner) continue;
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
  const [a, b] = state.ships;
  if (!a.alive || !b.alive) return;
  const { dx, dy, dist } = wrapDelta(a.x, a.y, b.x, b.y);
  const minD = SHIPS[a.shipId].radius + SHIPS[b.shipId].radius;
  if (dist >= minD || dist < 0.01) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minD - dist;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
  const impact = Math.abs((b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
  const dmg = 8 + impact * 0.08;
  damageShip(state, a, dmg, b.x, b.y);
  damageShip(state, b, dmg, a.x, a.y);
  const bounce = 120;
  a.vx -= nx * bounce;
  a.vy -= ny * bounce;
  b.vx += nx * bounce;
  b.vy += ny * bounce;
}

function checkWinner(state: SimState): void {
  if (state.winner !== null) return;
  const [a, b] = state.ships;
  if (!a.alive && !b.alive) state.winner = -1;
  else if (!a.alive) state.winner = 1;
  else if (!b.alive) state.winner = 0;
}

export function stepSim(
  state: SimState,
  inputs: [PlayerInput, PlayerInput],
): void {
  if (state.winner !== null) {
    updateEffects(state);
    return;
  }
  const rng = mulberry32(state.seed + state.tick * 9973);
  updateShip(state, state.ships[0], inputs[0], rng);
  updateShip(state, state.ships[1], inputs[1], rng);
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
