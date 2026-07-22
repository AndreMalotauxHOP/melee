import { angDiff, wrapDelta } from './math';
import {
  PLANET_X,
  PLANET_Y,
  type PlayerInput,
  type ShipRuntime,
  type SimState,
} from './types';
import { EMPTY_INPUT } from './types';

/**
 * Intentionally imperfect AI - aim is loose, fires late, hesitates.
 */
export function thinkAI(state: SimState, me: ShipRuntime, foe: ShipRuntime): PlayerInput {
  if (!me.alive) return { ...EMPTY_INPUT };
  const input: PlayerInput = { ...EMPTY_INPUT };
  if (!foe.alive) {
    input.thrust = true;
    return input;
  }

  // Stutter: skip decisions some frames so humans can outplay
  if (state.tick % 3 === 0) {
    // hold previous-ish by doing less this tick
  }

  const { dx, dy, dist } = wrapDelta(me.x, me.y, foe.x, foe.y);
  const absFace = Math.abs(angDiff(me.angle, Math.atan2(dy, dx)));

  // Loose lead + aim jitter
  const lead = dist / 520;
  const jitter = ((state.tick * 17 + me.player * 91) % 11) / 11 - 0.5;
  const predX = foe.x + foe.vx * lead + jitter * 40;
  const predY = foe.y + foe.vy * lead + jitter * 40;
  const { dx: pdx, dy: pdy } = wrapDelta(me.x, me.y, predX, predY);
  const aimDiff = angDiff(me.angle, Math.atan2(pdy, pdx));

  // Slower, less precise turning
  if (aimDiff > 0.22) input.right = true;
  else if (aimDiff < -0.22) input.left = true;

  const myHpRatio = me.hp / me.maxHp;
  const ideal =
    me.shipId === 'shade' || me.shipId === 'cinder'
      ? 110
      : me.shipId === 'solhammer' || me.shipId === 'bulwark'
        ? 240
        : 180;

  const closing = me.vx * (dx / (dist || 1)) + me.vy * (dy / (dist || 1));

  if (myHpRatio < 0.35 && dist < 220) {
    const flee = Math.atan2(-dy, -dx);
    const fleeDiff = angDiff(me.angle, flee);
    input.left = false;
    input.right = false;
    if (fleeDiff > 0.15) input.right = true;
    else if (fleeDiff < -0.15) input.left = true;
    input.thrust = Math.abs(fleeDiff) < 0.85;
    if (me.shipId === 'scuttle' || me.shipId === 'zephyr' || me.shipId === 'mirage') {
      input.special = true;
    }
  } else if (dist > ideal + 50) {
    input.thrust = absFace < 0.85 && state.tick % 5 !== 0;
  } else if (dist < ideal - 60) {
    input.thrust = absFace < 0.55 && closing < 60;
  } else {
    input.thrust = absFace < 0.45 && state.tick % 50 < 22;
  }

  // Fire only when fairly lined up, and not every frame
  if (absFace < 0.55 && dist < 380 && state.tick % 4 < 2) {
    input.fire = true;
  }
  if (me.shipId === 'nullpoint' && dist < 180 && absFace < 0.65) {
    input.fire = true;
  }

  // Specials used less aggressively
  switch (me.shipId) {
    case 'solhammer':
      input.special = dist < 300 && absFace < 0.35 && me.energy > 70 && state.tick % 20 === 0;
      break;
    case 'zephyr':
      input.special = myHpRatio < 0.35 && dist < 140;
      break;
    case 'bulwark':
      input.special =
        state.projectiles.some(
          (p) => p.owner !== me.player && wrapDelta(p.x, p.y, me.x, me.y).dist < 70,
        ) && me.energy > 40;
      break;
    case 'shade':
      input.special = dist > 120;
      if (dist < 90 && absFace < 0.35) input.special = false;
      break;
    case 'prism':
      input.special = dist < 120 && me.energy > 60;
      break;
    case 'brood':
      input.special =
        dist < 260 &&
        me.specialCd <= 0 &&
        state.drones.filter((d) => d.owner === me.player).length < 1;
      break;
    case 'cinder':
      input.special = absFace < 0.4 && dist > 80 && dist < 240 && state.tick % 3 === 0;
      break;
    case 'grappler':
      input.special = dist < 240 && dist > 80 && state.tick % 2 === 0;
      break;
    case 'scuttle':
      input.special = myHpRatio < 0.4 && dist < 160;
      break;
    case 'nullpoint':
      input.special = myHpRatio < 0.28;
      break;
    case 'stormlance':
      input.special = dist < 280 && absFace < 0.4 && me.energy > 50;
      break;
    case 'mirage':
      input.special = myHpRatio < 0.45 && dist < 180;
      break;
    case 'harrier':
      input.special = dist > 100 && dist < 260 && absFace < 0.35 && me.energy > 40;
      break;
    case 'minewright':
      input.special = dist < 160 && me.specialCd <= 0 && me.energy > 50;
      break;
    case 'razorwing':
      input.special = dist < 130 && absFace < 0.45 && me.energy > 45;
      break;
    case 'glacier':
      input.special = dist < 170 && me.energy > 55;
      break;
    case 'swarmlord':
      input.special =
        dist < 280 &&
        me.specialCd <= 0 &&
        state.drones.filter((d) => d.owner === me.player).length < 2;
      break;
    case 'pulsejet':
      input.special = dist < 140 && absFace < 0.6;
      break;
    case 'railfox':
      input.special = dist > 160 && dist < 360 && absFace < 0.2 && me.energy > 60;
      break;
    case 'sanguine':
      input.special = dist < 140 && myHpRatio < 0.7 && me.energy > 45;
      break;
  }

  // Avoid planet - use match planet radius
  const pdx2 = me.x - PLANET_X;
  const pdy2 = me.y - PLANET_Y;
  const pd = Math.hypot(pdx2, pdy2);
  const danger = state.planetR + 90 + state.gravityTier * 30;
  if (pd < danger || (pd < danger + 80 && 
      (-pdx2 / pd) * me.vx + (-pdy2 / pd) * me.vy > 30)) {
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
