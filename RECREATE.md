# Recreate Prompt: Super Melee Arena

Copy everything below the line into a new chat or project brief to rebuild this game from scratch.

---

## Mission

Build a browser Super Melee game inspired by Star Control 2 Melee.

It is a 1v1 spaceship duel arena with a fleet ladder, 20 distinct ships, specials, procedural AdLib-style FM audio, Three.js 3D combat, and a simple online lockstep mode.

Prefer quality, juice, and clear ship identity over a huge feature list.

Do not use the em dash character anywhere in UI copy.

---

## Tech Stack

- Vite + TypeScript (ES modules)
- Three.js for the 3D arena
- Vanilla DOM UI (no React)
- Web Audio API for procedural FM music and SFX
- Node `ws` server for online matchmaking and input relay only
- Client: `http://localhost:5173`
- Server: WebSocket on port `3080` (or `PORT` / `VITE_WS_URL`)

Scripts:

- `dev` runs Vite client and WS server together
- `build` runs `tsc && vite build`

Architecture rule: the simulation is deterministic and client-authoritative for online.
The server never runs physics.
Both peers step the same sim when both inputs for a tick are present.

---

## Product Feel

Make it addictive.

Every bout should feel like a highlight reel: camera shake, callouts, damage floats, style/combo meter, countdown, short intermission, and escalating win fanfares.

Ships must feel radically different to pilot (mass and turn inertia matter more than raw speed numbers).

Draft and pick screens need a live 3D ship preview plus a controls/moves panel.

---

## Game Modes

1. Vs Computer
2. Local two players (same keyboard)
3. Online (create/join room code)

### Series rules (Super Melee ladder)

- Each side drafts a fleet of **6 unique ships**
- Before each bout, a side that needs a ship picks from remaining living ships
- **Winner stays wounded** (no heal; keep current HP into the next bout)
- Loser’s ship is eliminated
- Double KO eliminates both active ships; both sides pick again
- Series ends when one fleet has zero ships left
- Between bouts: short intermission, then pick UI + upgrade shop, then 3-2-1-FIGHT countdown

---

## Arena and Physics

- Arena size: 1280 x 720
- Tick rate: 60 Hz (`DT = 1/60`)
- Toroidal wrap with a small margin
- Planet at center with per-series random radius and gravity tier
- Gravity tiers: LOW / STANDARD / CRUSHING (bias toward milder worlds)
- Inverse-square gravity
- Touching the planet kills the ship
- Some projectiles can bounce off the planet
- Movement uses thrust/mass acceleration
- Turning uses angular velocity with turnAccel and turnDamp (heavy ships spool slowly)
- Status effects: slow, limpets (drag stacks), cloak, shield, invuln, afterburn, panic, tractor, drain cone

### Controls

P1: `W` thrust, `A`/`D` turn, `F` fire, `G` special

P2: `↑` thrust, `←`/`→` turn, `/` fire, `.` special

Esc returns to title.
Enter rematches after a local series ends.

---

## Economy and Upgrades

- Start each series with **$45**
- During live combat only, earn about **$12/sec** into a bout purse (style can slightly increase the rate)
- Win the bout to **bank** the purse (streak bonus allowed)
- Lose and the purse is lost
- Double KO can split a reduced purse
- Between bouts, buy series-long upgrades (max level 5 each):
  - Hull Plating: +12% max HP
  - Capacitor: +12% energy and regen
  - Thrusters: +10% thrust
  - Hot Loads: +10% damage
  - Coolant: -8% fire/special cooldowns (floor around 0.6x)
- Cost for next level = `baseCost * (currentLevel + 1)`

---

## Ships (exactly 20)

Each ship needs unique colors, 3D mesh silhouette, lore card (role, weapon, special, tip), AI usage hints, and its own battle music theme.

1. **Solhammer** - heavy capital; slow turn; heavy guns; special seeking nuke
2. **Zephyr** - feather interceptor; blink teleport
3. **Bulwark** - fortress tank; glacial turn; temporary reflecting aegis shield
4. **Shade** - assassin; hold-cloak veil; ambush damage bonus when cloaked
5. **Prism** - balanced; twin bouncing crystals; shatter nova shards
6. **Brood** - sluggish carrier; homing spores; spawn attack drones
7. **Cinder** - hot rod; flame spray; hold hellwake afterburner + damaging trail
8. **Grappler** - midweight controller; limpets; hold tractor beam
9. **Scuttle** - twitchy coward; panic boost forward + rear butt missile
10. **Nullpoint** - disruptor; hold-fire drain cone (no tap primary); phase shift invuln blink
11. **Stormlance** - glass artillery; arc needles; chain lightning fork
12. **Mirage** - trickster; mirror step velocity flip + brief veil
13. **Harrier** - dive bomber; screaming dive afterburn + bomb
14. **Minewright** - area denial; sticky seeds; mine ring
15. **Razorwing** - shotgun; spread needles; blade fan shards
16. **Glacier** - ice barge; freeze pulse slow nova
17. **Swarmlord** - light carrier; locust cloud drones
18. **Pulsejet** - brawler; shockwave knockback
19. **Railfox** - sniper; piercing crystals; piercing rail special
20. **Sanguine** - vampire; fang limpets; blood siphon lifesteal

Ship handling must read clearly from mass/turnAccel/turnRate alone.

---

## Juice Checklist (ship with the game)

- Floating damage numbers and KO pops
- Style meter + combo counter with escalating callouts (FIRST BLOOD, COMBO xN, CLUTCH, UNSTOPPABLE, GODLIKE)
- Bout streak callouts (SHIP DOWN, STREAK, HAT TRICK, ON FIRE)
- Pre-fight countdown with beeps
- Post-bout intermission text
- Camera shake and brief hit-stop on big hits
- Low-HP vignette, heartbeat SFX, slight camera zoom
- Per-ship FM battle themes; music intensity rises with danger and style
- Spectacular special VFX (rings, sparks, pillars, nuke flash, wake trails)
- Series end stats: kills, damage, best combo, streak

Avoid a constant low audio hum/drone.
High-pass music and keep thrust whooshes quiet and airy.

---

## UI Flow

```
Title
  -> Fleet Draft (with 3D preview + moves/controls panel)
  -> Online lobby (if online)
  -> Battle
       Pick ship + Upgrade Bay
       -> Countdown
       -> Fight
       -> Intermission
       -> (repeat until series over)
```

Draft cards should show HP, energy, mass, turn, thrust, weapon, special, and a short tip.

Pick overlay shows remaining ships, wounded foe HP when relevant, preview, and shop.

Battle view: Three.js world canvas under a transparent 2D HUD canvas (HP/energy, fleet pips, gravity label, credits/purse, style, callouts).

---

## Online Protocol (minimal)

JSON WebSocket messages:

Client: `create`, `join`, `ready`, `input { tick, bits }`, `pick { index }`

Server: `room`, `start { seed, fleets, you }`, `peer_input`, `peer_pick`, `peer_left`, `error`

Pack inputs into bits: left=1, right=2, thrust=4, fire=8, special=16.

Fleet must be 6 unique ship IDs.

Room codes are short.
Disconnect cleans up the room.

---

## Suggested File Layout

```
src/
  main.ts                 # screens, loop, economy, juice, pick/shop
  style.css
  game/
    types.ts
    ships.ts
    simulation.ts
    fleet.ts
    upgrades.ts
    math.ts
    ai.ts
    renderer.ts           # HUD overlay
  render/
    World3D.ts
    shipMeshes.ts
  ui/
    shipInfo.ts
    ShipPreview.ts
  input/controls.ts
  audio/sound.ts
  net/protocol.ts
  net/onlineClient.ts
server/index.ts
```

---

## Implementation Order

1. Sim + 2 ships + local controls + wrap/planet
2. HUD + basic 3D world
3. All 20 ships (stats, weapons, specials, meshes)
4. Fleet ladder + pick flow
5. Audio (SFX first, then per-ship themes)
6. Juice (callouts, style, countdown, intermission)
7. Economy + upgrade shop
8. Draft/preview UI polish
9. Online lockstep
10. Tune AI to be beatable and imperfect

---

## Acceptance Criteria

- All three modes work end-to-end
- Fleet of 6, winner stays wounded, loser swaps ships
- All 20 ships are playable and visually distinct
- Specials have clear VFX and SFX
- Money accrues in battle, banks on win, spends on upgrades between bouts
- Draft/pick show 3D preview and move info
- Online two-player bout can complete without desync under normal latency
- No constant low buzz in the audio mix

---

## Tone and Design Constraints

- One clear composition for menus; avoid generic AI purple/cream dashboard looks
- Use expressive fonts (for example Orbitron + Share Tech Mono)
- Keep the arena readable: planet as visual anchor, ships readable at a glance
- Push handling differences hard so Solhammer never feels like Zephyr
