import { createServer } from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

type ShipId = string;

type Slot = {
  ws: WebSocket;
  fleet: ShipId[];
  ready: boolean;
  rematch: boolean;
  slot: 0 | 1;
};

type Room = {
  code: string;
  players: [Slot | null, Slot | null];
  seed: number;
  started: boolean;
};

type PlayerRow = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  bestStreak: number;
  seriesStreak: number;
  bestSeriesStreak: number;
  updatedAt: number;
};

const rooms = new Map<string, Room>();
const PORT = Number(process.env.PORT || 3080);
const FLEET_SIZE = 6;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Shared Yard Hall - every pilot who has synced. */
const players = new Map<string, PlayerRow>();

function loadPlayersFromDisk(): void {
  try {
    if (!existsSync(PLAYERS_FILE)) return;
    const raw = JSON.parse(readFileSync(PLAYERS_FILE, 'utf8')) as {
      players?: PlayerRow[];
    };
    if (!Array.isArray(raw.players)) return;
    for (const p of raw.players) {
      if (p && typeof p.playerId === 'string') players.set(p.playerId, p);
    }
    console.log(`Loaded ${players.size} player career(s) from disk`);
  } catch (err) {
    console.warn('Could not load player stats', err);
  }
}

function savePlayersToDisk(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const list = [...players.values()];
    writeFileSync(PLAYERS_FILE, JSON.stringify({ players: list }, null, 2));
  } catch (err) {
    console.warn('Could not save player stats', err);
  }
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Scrap Pilot';
  const cleaned = raw.replace(/[^\w\s\-'.]/g, '').trim().slice(0, 18);
  return cleaned || 'Scrap Pilot';
}

function asNonNegInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(1_000_000, Math.floor(n));
}

function upsertPlayer(body: Record<string, unknown>): PlayerRow | null {
  const playerId =
    typeof body.playerId === 'string' ? body.playerId.slice(0, 64) : '';
  if (!playerId || !/^[\w\-]+$/.test(playerId)) return null;
  const prev = players.get(playerId);
  const row: PlayerRow = {
    playerId,
    name: sanitizeName(body.name),
    played: asNonNegInt(body.played, prev?.played ?? 0),
    wins: asNonNegInt(body.wins, prev?.wins ?? 0),
    losses: asNonNegInt(body.losses, prev?.losses ?? 0),
    bestStreak: asNonNegInt(body.bestStreak, prev?.bestStreak ?? 0),
    seriesStreak: asNonNegInt(body.seriesStreak, prev?.seriesStreak ?? 0),
    bestSeriesStreak: asNonNegInt(
      body.bestSeriesStreak,
      prev?.bestSeriesStreak ?? 0,
    ),
    updatedAt: Date.now(),
  };
  // Keep the stronger career if a stale client posts older totals
  if (prev) {
    row.played = Math.max(prev.played, row.played);
    row.wins = Math.max(prev.wins, row.wins);
    row.losses = Math.max(prev.losses, row.losses);
    row.bestStreak = Math.max(prev.bestStreak, row.bestStreak);
    row.bestSeriesStreak = Math.max(prev.bestSeriesStreak, row.bestSeriesStreak);
    row.seriesStreak = Math.max(prev.seriesStreak, row.seriesStreak);
    if (row.name === 'Scrap Pilot' && prev.name !== 'Scrap Pilot') {
      row.name = prev.name;
    }
  }
  players.set(playerId, row);
  savePlayersToDisk();
  return row;
}

function rankedPlayers(): PlayerRow[] {
  return [...players.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
    return b.played - a.played;
  });
}

function cors(res: import('node:http').ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => {
      chunks.push(c);
      if (chunks.reduce((n, b) => n + b.length, 0) > 32_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  urlPath: string,
): Promise<boolean> {
  if (!urlPath.startsWith('/api/')) return false;
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }

  if (urlPath === '/api/players' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ players: rankedPlayers() }));
    return true;
  }

  if (urlPath === '/api/players' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as Record<string, unknown>;
      const row = upsertPlayer(body);
      if (!row) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad player payload' }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, player: row }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid json' }));
    }
    return true;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
  return true;
}

function codeGen(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += alphabet[(Math.random() * alphabet.length) | 0];
  return c;
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function other(room: Room, slot: 0 | 1): Slot | null {
  return room.players[slot === 0 ? 1 : 0];
}

function findRoomOf(ws: WebSocket): { room: Room; slot: 0 | 1 } | null {
  for (const room of rooms.values()) {
    for (let i = 0; i < 2; i++) {
      const p = room.players[i];
      if (p && p.ws === ws) return { room, slot: i as 0 | 1 };
    }
  }
  return null;
}

function validFleet(fleet: unknown): fleet is ShipId[] {
  if (!Array.isArray(fleet) || fleet.length !== FLEET_SIZE) return false;
  const set = new Set(fleet);
  return set.size === FLEET_SIZE && fleet.every((id) => typeof id === 'string');
}

function tryStart(room: Room): void {
  const a = room.players[0];
  const b = room.players[1];
  if (!a || !b || !a.ready || !b.ready || room.started) return;
  room.started = true;
  a.rematch = false;
  b.rematch = false;
  room.seed = (Math.random() * 0xffffffff) | 0;
  const fleets: [ShipId[], ShipId[]] = [a.fleet, b.fleet];
  send(a.ws, { type: 'start', code: room.code, seed: room.seed, fleets, you: 0 });
  send(b.ws, { type: 'start', code: room.code, seed: room.seed, fleets, you: 1 });
  console.log(`Match start ${room.code} seed=${room.seed}`);
}

function tryRematch(room: Room): void {
  const a = room.players[0];
  const b = room.players[1];
  if (!a || !b || !a.rematch || !b.rematch) return;
  a.rematch = false;
  b.rematch = false;
  a.ready = true;
  b.ready = true;
  room.started = true;
  room.seed = (Math.random() * 0xffffffff) | 0;
  send(a.ws, { type: 'rematch_start', seed: room.seed });
  send(b.ws, { type: 'rematch_start', seed: room.seed });
  console.log(`Rematch ${room.code} seed=${room.seed}`);
}

function safeJoin(root: string, reqPath: string): string | null {
  const decoded = decodeURIComponent(reqPath.split('?')[0] || '/');
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

async function serveStatic(
  reqUrl: string,
  res: import('node:http').ServerResponse,
): Promise<void> {
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build missing. Run npm run build before npm start.\n');
    return;
  }

  let filePath = safeJoin(DIST, reqUrl === '/' ? '/index.html' : reqUrl);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800',
  });
  createReadStream(filePath).pipe(res);
}

loadPlayersFromDisk();

const server = createServer((req, res) => {
  const url = req.url || '/';
  const urlPath = url.split('?')[0] || '/';
  if (urlPath === '/health' || urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }
  void (async () => {
    if (await handleApi(req, res, urlPath)) return;
    await serveStatic(urlPath, res);
  })().catch((err) => {
    console.error(err);
    res.writeHead(500).end('Server error');
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg: {
      type: string;
      fleet?: ShipId[];
      code?: string;
      tick?: number;
      bits?: number;
      index?: number;
    };
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (msg.type === 'create' && validFleet(msg.fleet)) {
      let code = codeGen();
      while (rooms.has(code)) code = codeGen();
      const room: Room = {
        code,
        players: [null, null],
        seed: 0,
        started: false,
      };
      room.players[0] = { ws, fleet: msg.fleet, ready: false, rematch: false, slot: 0 };
      rooms.set(code, room);
      send(ws, { type: 'room', code, slot: 0 });
      console.log(`Room ${code} created`);
      return;
    }

    if (msg.type === 'join' && msg.code && validFleet(msg.fleet)) {
      const room = rooms.get(msg.code.toUpperCase());
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (room.players[1]) {
        send(ws, { type: 'error', message: 'Room full' });
        return;
      }
      room.players[1] = { ws, fleet: msg.fleet, ready: false, rematch: false, slot: 1 };
      send(ws, { type: 'room', code: room.code, slot: 1 });
      console.log(`Joined room ${room.code}`);
      return;
    }

    if (msg.type === 'create' || msg.type === 'join') {
      send(ws, { type: 'error', message: 'Fleet must be 6 unique ships' });
      return;
    }

    if (msg.type === 'ready') {
      const found = findRoomOf(ws);
      if (!found) return;
      const slot = found.room.players[found.slot];
      if (slot) slot.ready = true;
      tryStart(found.room);
      return;
    }

    if (msg.type === 'rematch') {
      const found = findRoomOf(ws);
      if (!found) return;
      const slot = found.room.players[found.slot];
      if (slot) slot.rematch = true;
      tryRematch(found.room);
      return;
    }

    if (
      msg.type === 'input' &&
      typeof msg.tick === 'number' &&
      typeof msg.bits === 'number'
    ) {
      const found = findRoomOf(ws);
      if (!found) return;
      const peer = other(found.room, found.slot);
      if (peer) {
        send(peer.ws, { type: 'peer_input', tick: msg.tick, bits: msg.bits });
      }
      return;
    }

    if (msg.type === 'pick' && typeof msg.index === 'number') {
      const found = findRoomOf(ws);
      if (!found) return;
      const peer = other(found.room, found.slot);
      if (peer) {
        send(peer.ws, { type: 'peer_pick', index: msg.index });
      }
      return;
    }
  });

  ws.on('close', () => {
    const found = findRoomOf(ws);
    if (!found) return;
    const peer = other(found.room, found.slot);
    if (peer) send(peer.ws, { type: 'peer_left' });
    rooms.delete(found.room.code);
    console.log(`Room ${found.room.code} closed`);
  });
});

server.listen(PORT, () => {
  const hasDist = existsSync(DIST);
  console.log(`Scrap Rumble listening on :${PORT}`);
  console.log(`  HTTP  ${hasDist ? DIST : '(no dist yet - run npm run build)'}`);
  console.log(`  WS    ws://localhost:${PORT}`);
  console.log(`  Stats ${PLAYERS_FILE}`);
});
