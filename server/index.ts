import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

type ShipId = string;

type Slot = {
  ws: WebSocket;
  fleet: ShipId[];
  ready: boolean;
  slot: 0 | 1;
};

type Room = {
  code: string;
  players: [Slot | null, Slot | null];
  seed: number;
  started: boolean;
};

const rooms = new Map<string, Room>();
const PORT = Number(process.env.PORT || 3080);
const FLEET_SIZE = 6;

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
  room.seed = (Math.random() * 0xffffffff) | 0;
  const fleets: [ShipId[], ShipId[]] = [a.fleet, b.fleet];
  send(a.ws, { type: 'start', code: room.code, seed: room.seed, fleets, you: 0 });
  send(b.ws, { type: 'start', code: room.code, seed: room.seed, fleets, you: 1 });
  console.log(`Match start ${room.code} seed=${room.seed}`);
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Melee Arena WS server OK\n');
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
      room.players[0] = { ws, fleet: msg.fleet, ready: false, slot: 0 };
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
      room.players[1] = { ws, fleet: msg.fleet, ready: false, slot: 1 };
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

    if (msg.type === 'input' && typeof msg.tick === 'number' && typeof msg.bits === 'number') {
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
  console.log(`Melee Arena server on ws://localhost:${PORT}`);
});
