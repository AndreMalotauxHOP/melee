import type { ShipId } from './types';
import { SHIPS } from './ships';

/** One-word win condition - how this scrapheap wants to win. */
export const SHIP_VERB: Record<ShipId, string> = {
  solhammer: 'BULLY',
  zephyr: 'BLINK',
  bulwark: 'RAM',
  shade: 'STAB',
  prism: 'BANK',
  brood: 'SWARM',
  cinder: 'TRAIL',
  grappler: 'YOINK',
  scuttle: 'FLEE',
  nullpoint: 'DRAIN',
  stormlance: 'CHAIN',
  mirage: 'SWAP',
  harrier: 'DIVE',
  minewright: 'TRAP',
  razorwing: 'SHRED',
  glacier: 'FREEZE',
  swarmlord: 'FLOOD',
  pulsejet: 'SLAP',
  railfox: 'SNIPE',
  sanguine: 'LEECH',
};

/** Motif tip for draft UI - reinforces fantasy in one line. */
export const SHIP_MOTIF: Record<ShipId, string> = {
  solhammer: 'Win by tanking drama, then one rude boom.',
  zephyr: 'Win by never being where the shot is.',
  bulwark: 'Win by walking through their spray.',
  shade: 'Win by nose-range clips from cloak.',
  prism: 'Win by banking shots off the world.',
  brood: 'Win by letting roommates do the dishes.',
  cinder: 'Win by painting their path with fire.',
  grappler: 'Win by deleting their personal space.',
  scuttle: 'Win by running away professionally.',
  nullpoint: 'Win by drinking their battery dry.',
  stormlance: 'Win by mid-range gossip arcs.',
  mirage: 'Win by swapping through their commit.',
  harrier: 'Win by screaming dives and bombs.',
  minewright: 'Win by decorating chokepoints.',
  razorwing: 'Win by melting noses up close.',
  glacier: 'Win by freezing, then walking them down.',
  swarmlord: 'Win by unpaid bee intern pressure.',
  pulsejet: 'Win by hugging-range resets.',
  railfox: 'Win by one held angle, one ruin.',
  sanguine: 'Win by healing through the trade.',
};

export function shipVerb(id: ShipId): string {
  return SHIP_VERB[id] ?? 'CHAOS';
}

export function shipMotif(id: ShipId): string {
  return SHIP_MOTIF[id] ?? SHIPS[id].tagline;
}
