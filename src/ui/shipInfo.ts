import type { ShipId } from '../game/types';
import { SHIPS, type ShipDef } from '../game/ships';

export interface ShipLore {
  role: string;
  weapon: string;
  weaponDesc: string;
  tip: string;
  /** Short rock-paper-scissors tags for draft */
  beats: string;
  weakTo: string;
}

export const SHIP_LORE: Record<ShipId, ShipLore> = {
  solhammer: {
    role: 'Big mean brick',
    weapon: 'Chunky bolts',
    weaponDesc: 'Slow dual thumps. Sounds expensive.',
    tip: 'Face-tank, then hit the Big Red Button when they cannot dodge the drama.',
    beats: 'Tanks, bug buses',
    weakTo: 'Blinkers, juice thieves',
  },
  zephyr: {
    role: 'Caffeine gnat',
    weapon: 'Pea spitters',
    weaponDesc: 'Tiny twin needles. Death by papercut.',
    tip: 'Nope Blink past shots. Never trade broadsides with a fridge.',
    beats: 'Snipers, sparky',
    weakTo: 'Blenders, confetti',
  },
  bulwark: {
    role: 'Flying fridge',
    weapon: 'Armor burps',
    weaponDesc: 'Chunky shells that arrive fashionably late.',
    tip: 'Nope Shield into their spray, then ram like a vending machine.',
    beats: 'Peashooters, divebros',
    weakTo: 'Grabby, juice cone',
  },
  shade: {
    role: 'Petty assassin',
    weapon: 'Stilettos',
    weaponDesc: 'Rapid needles. Cloak makes them meaner.',
    tip: 'Invisible Mode in, dump a clip at nose range, leave mid-sentence.',
    beats: 'Snipers, artillery',
    weakTo: 'Confetti, blender',
  },
  prism: {
    role: 'Party fouler',
    weapon: 'Disco shards',
    weaponDesc: 'Paired crystals that bank off the planet like pool.',
    tip: 'Bank shots off the world, then Confetti Bomb the scrum.',
    beats: 'Orbit campers',
    weakTo: 'Sneaky Pete',
  },
  brood: {
    role: 'Roommate simulator',
    weapon: 'Gross spores',
    weaponDesc: 'Slow homing blobs that also make you sticky.',
    tip: 'Release the Roommates early. Kite. Let them do the dishes (violence).',
    beats: 'Slow tanks',
    weakTo: 'AoE, whip speed',
  },
  cinder: {
    role: 'Arson hobbyist',
    weapon: 'Spicy spit',
    weaponDesc: 'Short-range flame bolts. Smells like regret.',
    tip: 'Floor Is Lava through their path and let the trail finish the argument.',
    beats: 'Huggers',
    weakTo: 'Long poke',
  },
  grappler: {
    role: 'Consent optional',
    weapon: 'Limpet kisses',
    weaponDesc: 'Homing parasites that stack drag. Awkward.',
    tip: 'Yoink Beam to close, limpet to cripple, never let them stretch their legs.',
    beats: 'Heavies, bricks',
    weakTo: 'Blink, scream boost',
  },
  scuttle: {
    role: 'Professional coward',
    weapon: 'Forward sting',
    weaponDesc: 'Light forward lasers. The rear missile is the real villain.',
    tip: 'Scream Boost away and let the butt missile do murder.',
    beats: 'Chasers',
    weakTo: 'Homing swarms',
  },
  nullpoint: {
    role: 'Battery vampire',
    weapon: 'Juice cone',
    weaponDesc: 'Hold fire to siphon energy and HP. Rude.',
    tip: 'Cone them dry, Ghost Sip when cornered, reappear behind like a rumor.',
    beats: 'Energy hogs',
    weakTo: 'Burst alpha',
  },
  stormlance: {
    role: 'Weather tantrum',
    weapon: 'Gossip bolts',
    weaponDesc: 'Seeking pierce crystals. Chain hops like drama.',
    tip: 'Keep mid range, then Chain Tantrum when they line up for photos.',
    beats: 'Bug buses, clusters',
    weakTo: 'Blink, cloak',
  },
  mirage: {
    role: 'Gaslighter',
    weapon: 'Phantom darts',
    weaponDesc: 'Trail-shot darts. Ambush from cloak.',
    tip: 'Swap Places through their shot, then stab from the reverse vector.',
    beats: 'Predictable straights',
    weakTo: 'Wide AoE',
  },
  harrier: {
    role: 'Gravity influencer',
    weapon: 'Bomb racks',
    weaponDesc: 'Chunky forward shells. Very "look at me".',
    tip: 'Kamikaze Lite on approach, release, climb past like you meant that.',
    beats: 'Slow turns',
    weakTo: 'Point defense, shield',
  },
  minewright: {
    role: 'Space litterer',
    weapon: 'Sticky seeds',
    weaponDesc: 'Slow mines that linger and judge you.',
    tip: 'Party Poppers on chokepoints. Force them through the bad vibes.',
    beats: 'Whip lanes, chasers',
    weakTo: 'Long poke',
  },
  razorwing: {
    role: 'Barber of doom',
    weapon: 'Spread needles',
    weaponDesc: 'Three-way peashooter. Face Fan melts noses.',
    tip: 'Close hard, Face Fan their face, peel out smelling victorious.',
    beats: 'Assassins, zippy',
    weakTo: 'Keep-away artillery',
  },
  glacier: {
    role: 'Cold shoulder',
    weapon: 'Ice lances',
    weaponDesc: 'Heavy crystals that chill on hit. Mood killer.',
    tip: 'Chill Out when they overcommit, then walk them down.',
    beats: 'Speed ships',
    weakTo: 'Outrange poke',
  },
  swarmlord: {
    role: 'Bee HR dept',
    weapon: 'Wing stingers',
    weaponDesc: 'Dual hardpoints. Angry Cloud multiplies pressure.',
    tip: 'Drop Angry Cloud early and kite behind the unpaid interns.',
    beats: 'Lone heavies',
    weakTo: 'Nova, freeze',
  },
  pulsejet: {
    role: 'Bar-fight pilot',
    weapon: 'Pulse bolts',
    weaponDesc: 'Mid-damage lasers with a shock tip.',
    tip: 'Whoosh Slap at hugging range to reset the scramble.',
    beats: 'Grabby',
    weakTo: 'Snipers',
  },
  railfox: {
    role: 'One-trick pony',
    weapon: 'Needle rails',
    weaponDesc: 'Piercing crystals. Red Dot is a kill line.',
    tip: 'Hold angle. Red Dot of Doom through planet or ship. Bow.',
    beats: 'Carriers, straight flyers',
    weakTo: 'Cloak, whip dodge',
  },
  sanguine: {
    role: 'Gross healer',
    weapon: 'Fang ticks',
    weaponDesc: 'Homing ticks that soften the prey. Ew.',
    tip: 'Blood Juice Box at point-blank to heal through trades.',
    beats: 'Attrition fights',
    weakTo: 'Burst before heal',
  },
};

export function handlingLabel(def: ShipDef): string {
  if (def.mass >= 2.4) return 'Heavy - turns like a couch';
  if (def.mass <= 0.55) return 'Feather - twitchy little gremlin';
  if (def.turnAccel >= 18) return 'Agile - snaps on like gossip';
  return 'Balanced - honest midweight chaos';
}

/** Compact hangar tile - looks like a ship; details live in the hover preview. */
export function shipCardHtml(def: ShipDef, opts?: { ord?: number }): string {
  const lore = SHIP_LORE[def.id];
  const ord =
    opts?.ord !== undefined ? `<div class="ord">#${opts.ord}</div>` : '';
  return `
    ${ord}
    <div class="ship-bay" style="--ship:${def.color};--accent:${def.accent}">
      <div class="ship-silhouette" aria-hidden="true"></div>
      <div class="ship-bay-glow"></div>
    </div>
    <div class="name" style="color:${def.color}">${def.name}</div>
    <div class="role">${lore.role}</div>
  `;
}

/** Between-bout pick tile - same visual language, denser. */
export function pickCardHtml(def: ShipDef): string {
  const lore = SHIP_LORE[def.id];
  return `
    <div class="ship-bay mini" style="--ship:${def.color};--accent:${def.accent}">
      <div class="ship-silhouette" aria-hidden="true"></div>
      <div class="ship-bay-glow"></div>
    </div>
    <span class="nm" style="color:${def.color}">${def.name}</span>
    <span class="role">${lore.role}</span>
  `;
}

/** Full dossier shown beside the 3D preview on hover. */
export function shipDossierHtml(def: ShipDef): string {
  const lore = SHIP_LORE[def.id];
  return `
    <div class="dossier">
      <div class="counter"><b>Bullies</b> ${lore.beats}</div>
      <div class="counter weak"><b>Cries vs</b> ${lore.weakTo}</div>
      <div class="spec-grid">
        <div><span>Hull</span>${def.maxHp}</div>
        <div><span>Juice</span>${def.maxEnergy}</div>
        <div><span>Mass</span>${def.mass.toFixed(1)}</div>
        <div><span>Turn</span>${def.turnRate.toFixed(1)}</div>
        <div><span>Snap</span>${def.turnAccel.toFixed(0)}</div>
        <div><span>Zoom</span>${Math.round(def.thrust / def.mass)}</div>
      </div>
      <div class="handling">${handlingLabel(def)}</div>
      <div class="weapon"><b>${lore.weapon}</b> - ${lore.weaponDesc}</div>
      <div class="special"><b>${def.specialName}</b> - ${def.specialDesc}</div>
      <div class="tip">${lore.tip}</div>
    </div>
  `;
}

export function movesPanelHtml(def: ShipDef, player: 0 | 1): string {
  const lore = SHIP_LORE[def.id];
  const isP1 = player === 0;
  const turn = isP1
    ? `<kbd>A</kbd> / <kbd>D</kbd>`
    : `<kbd>←</kbd> / <kbd>→</kbd>`;
  const thrust = isP1 ? `<kbd>W</kbd>` : `<kbd>↑</kbd>`;
  const fire = isP1 ? `<kbd>F</kbd>` : `<kbd>/</kbd>`;
  const special = isP1 ? `<kbd>G</kbd>` : `<kbd>.</kbd>`;
  return `
    ${shipDossierHtml(def)}
    <div class="moves-title">Buttons · P${player + 1}</div>
    <div class="moves-row"><span>${turn}</span><em>Wiggle</em></div>
    <div class="moves-row"><span>${thrust}</span><em>Go · whip near planet for free speed</em></div>
    <div class="moves-row"><span>${fire}</span><em>Pew · ${lore.weapon}</em></div>
    <div class="moves-row"><span>${special}</span><em>Big move · ${def.specialName}</em></div>
    <div class="moves-cost">Juice ${def.specialCost} · CD ${def.specialCooldown.toFixed(1)}s · Pew ${def.fireCost}</div>
  `;
}

/** Convenience for theme color */
export function shipColor(id: ShipId): string {
  return SHIPS[id].color;
}
