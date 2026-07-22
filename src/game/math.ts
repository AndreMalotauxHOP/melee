import { ARENA_H, ARENA_W, WRAP_MARGIN } from './types';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function wrapPos(x: number, y: number): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (nx < -WRAP_MARGIN) nx += ARENA_W + WRAP_MARGIN * 2;
  if (nx > ARENA_W + WRAP_MARGIN) nx -= ARENA_W + WRAP_MARGIN * 2;
  if (ny < -WRAP_MARGIN) ny += ARENA_H + WRAP_MARGIN * 2;
  if (ny > ARENA_H + WRAP_MARGIN) ny -= ARENA_H + WRAP_MARGIN * 2;
  return { x: nx, y: ny };
}

/** Shortest-path midpoint between two wrapped points */
export function wrapMid(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const { dx, dy } = wrapDelta(ax, ay, bx, by);
  return wrapPos(ax + dx * 0.5, ay + dy * 0.5);
}

/**
 * Place (x,y) at the torus image nearest to (refX, refY).
 * Used so the chase camera can stay continuous across wrap edges
 * (classic Super Melee: ships exit one side and stay framed, no view snap).
 */
export function nearestImage(
  refX: number,
  refY: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const { dx, dy } = wrapDelta(refX, refY, x, y);
  return { x: refX + dx, y: refY + dy };
}

/**
 * Same as nearestImage, but prefers staying on the previous draw image until the
 * camera is clearly closer to another tile. Stops seam flip-flop / ghost pops.
 * Hard-snaps to the camera-nearest image if the sticky tile would leave the frame.
 */
export function nearestImageSticky(
  refX: number,
  refY: number,
  x: number,
  y: number,
  stickX: number,
  stickY: number,
  bias = 140,
  /** If sticky image is farther from camera than this, force primary (keep on-screen). */
  maxStickDist = 420,
): { x: number; y: number } {
  const primary = nearestImage(refX, refY, x, y);
  const stick = nearestImage(stickX, stickY, x, y);
  const dStickCam = Math.hypot(stick.x - refX, stick.y - refY);
  if (dStickCam > maxStickDist) return primary;
  const dPrimary = Math.hypot(primary.x - refX, primary.y - refY);
  const dStick = Math.hypot(stick.x - refX, stick.y - refY);
  if (dStick <= dPrimary + bias) return stick;
  return primary;
}

/** Shortest wrapped delta from a to b */
export function wrapDelta(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dx: number; dy: number; dist: number } {
  let dx = bx - ax;
  let dy = by - ay;
  const w = ARENA_W + WRAP_MARGIN * 2;
  const h = ARENA_H + WRAP_MARGIN * 2;
  if (dx > w / 2) dx -= w;
  if (dx < -w / 2) dx += w;
  if (dy > h / 2) dy -= h;
  if (dy < -h / 2) dy += h;
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

export function angDiff(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function normalizeAngle(a: number): number {
  let n = a;
  while (n > Math.PI) n -= Math.PI * 2;
  while (n < -Math.PI) n += Math.PI * 2;
  return n;
}

export function pointInCircle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Deterministic mulberry32 PRNG for online lockstep */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
