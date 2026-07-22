/** Client <-> server protocol for online melee (lockstep inputs). */

import type { ShipId } from '../game/types';

export type Fleet = [ShipId, ShipId, ShipId, ShipId, ShipId, ShipId];

export type ClientMsg =
  | { type: 'create'; fleet: ShipId[]; name?: string }
  | { type: 'join'; code: string; fleet: ShipId[]; name?: string }
  | { type: 'ready' }
  | { type: 'input'; tick: number; bits: number }
  | { type: 'pick'; index: number }
  | { type: 'ping'; t: number };

export type ServerMsg =
  | { type: 'error'; message: string }
  | { type: 'room'; code: string; slot: 0 | 1 }
  | {
      type: 'start';
      code: string;
      seed: number;
      fleets: [ShipId[], ShipId[]];
      you: 0 | 1;
    }
  | { type: 'peer_input'; tick: number; bits: number }
  | { type: 'peer_pick'; index: number }
  | { type: 'peer_left' }
  | { type: 'pong'; t: number };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

export function decodeClient(raw: string): ClientMsg | null {
  try {
    return JSON.parse(raw) as ClientMsg;
  } catch {
    return null;
  }
}

export function decodeServer(raw: string): ServerMsg | null {
  try {
    return JSON.parse(raw) as ServerMsg;
  } catch {
    return null;
  }
}
