import type { PlayerInput } from '../game/types';
import { EMPTY_INPUT } from '../game/types';

export interface KeyBindings {
  left: string;
  right: string;
  thrust: string;
  fire: string;
  special: string;
}

export const P1_KEYS: KeyBindings = {
  left: 'KeyA',
  right: 'KeyD',
  thrust: 'KeyW',
  fire: 'KeyF',
  special: 'KeyG',
};

export const P2_KEYS: KeyBindings = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  thrust: 'ArrowUp',
  fire: 'Slash',
  special: 'Period',
};

/** Alternate P1 for one-hand comfort near arrows when vs AI uses only P1 */
export const P1_ALT: KeyBindings = {
  left: 'KeyJ',
  right: 'KeyL',
  thrust: 'KeyI',
  fire: 'KeyK',
  special: 'Space',
};

export class InputManager {
  private pressed = new Set<string>();
  private blocked = false;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  setBlocked(v: boolean): void {
    this.blocked = v;
    if (v) this.pressed.clear();
  }

  private onDown = (e: KeyboardEvent): void => {
    if (this.blocked) return;
    // prevent page scroll with arrows / space
    if (
      e.code.startsWith('Arrow') ||
      e.code === 'Space' ||
      e.code === 'Slash'
    ) {
      e.preventDefault();
    }
    this.pressed.add(e.code);
  };

  private onUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private onBlur = (): void => {
    this.pressed.clear();
  };

  read(bindings: KeyBindings): PlayerInput {
    if (this.blocked) return { ...EMPTY_INPUT };
    return {
      left: this.pressed.has(bindings.left),
      right: this.pressed.has(bindings.right),
      thrust: this.pressed.has(bindings.thrust),
      fire: this.pressed.has(bindings.fire),
      special: this.pressed.has(bindings.special),
    };
  }

  /** Merge two binding sets (OR) so players can use either layout */
  readMerged(a: KeyBindings, b: KeyBindings): PlayerInput {
    const ia = this.read(a);
    const ib = this.read(b);
    return {
      left: ia.left || ib.left,
      right: ia.right || ib.right,
      thrust: ia.thrust || ib.thrust,
      fire: ia.fire || ib.fire,
      special: ia.special || ib.special,
    };
  }
}
