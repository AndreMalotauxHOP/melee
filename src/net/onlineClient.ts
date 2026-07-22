import type { ShipId } from '../game/types';
import {
  decodeServer,
  encode,
  type ClientMsg,
  type ServerMsg,
} from './protocol';

export type OnlineEvents = {
  onRoom?: (code: string, slot: 0 | 1) => void;
  onStart?: (info: {
    code: string;
    seed: number;
    fleets: [ShipId[], ShipId[]];
    you: 0 | 1;
  }) => void;
  onPeerInput?: (tick: number, bits: number) => void;
  onPeerPick?: (index: number) => void;
  onPeerLeft?: () => void;
  onError?: (message: string) => void;
  onStatus?: (status: string) => void;
};

function defaultWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.hostname || 'localhost';
  return `${proto}://${host}:3080`;
}

/**
 * Thin WebSocket client for lockstep melee.
 * Simulation stays on both peers; server relays inputs + matchmaking.
 */
export class OnlineClient {
  private ws: WebSocket | null = null;
  private handlers: OnlineEvents = {};
  private pending: ClientMsg[] = [];

  connect(handlers: OnlineEvents): void {
    this.handlers = handlers;
    this.handlers.onStatus?.('Connecting…');
    const url = defaultWsUrl();
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.handlers.onStatus?.('Connected');
      for (const msg of this.pending) ws.send(encode(msg));
      this.pending = [];
    };
    ws.onclose = () => this.handlers.onStatus?.('Disconnected');
    ws.onerror = () =>
      this.handlers.onError?.('WebSocket error - is the server running? (npm run dev)');
    ws.onmessage = (ev) => {
      const msg = decodeServer(String(ev.data));
      if (!msg) return;
      this.dispatch(msg);
    };
  }

  private dispatch(msg: ServerMsg): void {
    switch (msg.type) {
      case 'room':
        this.handlers.onRoom?.(msg.code, msg.slot);
        break;
      case 'start':
        this.handlers.onStart?.({
          code: msg.code,
          seed: msg.seed,
          fleets: msg.fleets,
          you: msg.you,
        });
        break;
      case 'peer_input':
        this.handlers.onPeerInput?.(msg.tick, msg.bits);
        break;
      case 'peer_pick':
        this.handlers.onPeerPick?.(msg.index);
        break;
      case 'peer_left':
        this.handlers.onPeerLeft?.();
        break;
      case 'error':
        this.handlers.onError?.(msg.message);
        break;
      default:
        break;
    }
  }

  private send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encode(msg));
    } else {
      this.pending.push(msg);
    }
  }

  create(fleet: ShipId[]): void {
    this.send({ type: 'create', fleet });
  }

  join(code: string, fleet: ShipId[]): void {
    this.send({ type: 'join', code: code.toUpperCase(), fleet });
  }

  ready(): void {
    this.send({ type: 'ready' });
  }

  sendInput(tick: number, bits: number): void {
    this.send({ type: 'input', tick, bits });
  }

  sendPick(index: number): void {
    this.send({ type: 'pick', index });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.pending = [];
  }
}
