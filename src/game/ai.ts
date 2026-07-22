import { angDiff, wrapDelta } from './math';
import {
  type PlayerInput,
  type ShipRuntime,
  type SimState,
  isHostile,
} from './types';
import { EMPTY_INPUT } from './types';
import { getPlanetX, getPlanetY } from './arena';

export type AiStyle = 'standard' | 'teach' | 'aggressive' | 'ranked';

export type AiOpts = {
  /** 0 = soft teaching bot, 1 = normal, 1.35 = ranked tryhard */
  skill?: number;
  style?: AiStyle;
  /** Player mistakes observed this fight - teach mode eases pressure */
  playerPressure?: number;
};

function nearestFoe(
  state: SimState,
  me: ShipRuntime,
  preferred?: ShipRuntime | null,
): ShipRuntime | null {
  if (preferred && isHostile(me, preferred)) return preferred;
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

/**
 * Intentionally imperfect AI - aim is loose, fires late, hesitates.
 * Skill / style knobs support tutorial teaching and ranked climb.
 * `foe` is optional; when omitted (or dead), picks nearest hostile.
 */
export function thinkAI(
  state: SimState,
  me: ShipRuntime,
  foe?: ShipRuntime | null,
  opts: AiOpts = {},
): PlayerInput {
  if (!me.alive) return { ...EMPTY_INPUT };
  const input: PlayerInput = { ...EMPTY_INPUT };
  const target = nearestFoe(state, me, foe ?? null);
  if (!target) {
    input.thrust = true;
    return input;
  }

  const style = opts.style ?? 'standard';
  let skill = opts.skill ?? (style === 'teach' ? 0.55 : style === 'ranked' ? 1.2 : 1);
  if (style === 'teach') {
    const pressure = opts.playerPressure ?? 0;
    skill = Math.max(0.35, skill - pressure * 0.12);
  }
  if (style === 'aggressive') skill = Math.min(1.4, skill + 0.15);

  const stutterEvery = skill < 0.7 ? 4 : skill > 1.1 ? 2 : 3;
  if (state.tick % stutterEvery === 0) {
    // hold previous-ish by doing less this tick
  }

  const { dx, dy, dist } = wrapDelta(me.x, me.y, target.x, target.y);
  const absFace = Math.abs(angDiff(me.angle, Math.atan2(dy, dx)));

  const lead = (dist / 520) * (0.7 + skill * 0.45);
  const jitterAmp = Math.max(8, 48 - skill * 28);
  const jitter = ((state.tick * 17 + me.player * 91) % 11) / 11 - 0.5;
  const predX = target.x + target.vx * lead + jitter * jitterAmp;
  const predY = target.y + target.vy * lead + jitter * jitterAmp;
  const { dx: pdx, dy: pdy } = wrapDelta(me.x, me.y, predX, predY);
  const aimDiff = angDiff(me.angle, Math.atan2(pdy, pdx));

  const turnDead = Math.max(0.1, 0.28 - skill * 0.1);
  if (aimDiff > turnDead) input.right = true;
  else if (aimDiff < -turnDead) input.left = true;

  const myHpRatio = me.hp / me.maxHp;
  const foeHpRatio = target.hp / Math.max(1, target.maxHp);
  const ideal =
    me.shipId === 'shade' || me.shipId === 'cinder'
      ? 110
      : me.shipId === 'solhammer' || me.shipId === 'bulwark'
        ? 240
        : 180;

  let rangeBias = 0;
  if (style === 'teach') {
    if (foeHpRatio < 0.35) rangeBias = 70;
    else if (foeHpRatio > 0.75) rangeBias = -35;
  }

  const wantDist = ideal + rangeBias;
  if (dist > wantDist + 40) input.thrust = absFace < 0.9;
  else if (dist < wantDist - 50) {
    if (state.tick % 7 < 4) {
      input.left = !input.right;
      input.right = !input.left;
    }
    input.thrust = absFace > 1.2 || myHpRatio < 0.4;
  } else {
    input.thrust = absFace < 0.55 && state.tick % 5 !== 0;
  }

  const fireGate = skill < 0.7 ? 0.55 : skill > 1.1 ? 0.28 : 0.4;
  input.fire = absFace < fireGate && dist < 420 + skill * 80;

  switch (me.shipId) {
    case 'solhammer':
      input.special = dist < 260 && absFace < 0.35 && me.energy > 40;
      break;
    case 'zephyr':
      input.special = (dist > 280 || myHpRatio < 0.35) && me.energy > 25;
      break;
    case 'bulwark':
      input.special = (myHpRatio < 0.55 || dist < 120) && me.energy > 30;
      break;
    case 'shade':
      input.special = dist < 200 || myHpRatio < 0.45;
      break;
    case 'prism':
      input.special = dist < 180 && me.energy > 35;
      break;
    case 'brood':
    case 'swarmlord':
      input.special = dist < 240 && me.energy > 30;
      break;
    case 'cinder':
      input.special = dist < 160 && absFace < 0.5;
      break;
    case 'grappler':
      input.special = dist < 280 && dist > 60;
      break;
    case 'scuttle':
      input.special = dist < 140 || myHpRatio < 0.3;
      break;
    case 'nullpoint':
      input.special = myHpRatio < 0.4 && me.energy > 40;
      break;
    case 'stormlance':
      input.special = dist < 300 && absFace < 0.4 && me.energy > 35;
      break;
    case 'mirage':
      input.special = dist < 150 || myHpRatio < 0.35;
      break;
    case 'harrier':
      input.special = dist < 200 && absFace < 0.45;
      break;
    case 'minewright':
      input.special = dist < 220 && me.energy > 30;
      break;
    case 'razorwing':
      input.special = dist < 200 && absFace < 0.5;
      break;
    case 'glacier':
      input.special = dist < 180 && me.energy > 35;
      break;
    case 'pulsejet':
      input.special = dist < 160 && me.energy > 30;
      break;
    case 'railfox':
      input.special = dist > 180 && dist < 420 && absFace < 0.2 && me.energy > 40;
      break;
    case 'sanguine':
      input.special = dist < 140 && myHpRatio < 0.7 && me.energy > 45;
      break;
  }

  const pdx2 = me.x - getPlanetX();
  const pdy2 = me.y - getPlanetY();
  const pd = Math.hypot(pdx2, pdy2);
  const danger = state.planetR + 90 + state.gravityTier * 30;
  if (
    pd < danger ||
    (pd < danger + 80 && (-pdx2 / pd) * me.vx + (-pdy2 / pd) * me.vy > 30)
  ) {
    const away = Math.atan2(pdy2, pdx2);
    const ad = angDiff(me.angle, away);
    input.left = ad < -0.04;
    input.right = ad > 0.04;
    input.thrust = Math.abs(ad) < 1.3;
    input.fire = false;
    if (pd < state.planetR + 70) {
      input.special = me.shipId === 'zephyr' || me.shipId === 'nullpoint' || me.shipId === 'scuttle';
    }
  }

  return input;
}
