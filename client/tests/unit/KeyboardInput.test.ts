import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import {
  KeyboardInput,
  MOVE_REPEAT_INTERVAL_MS,
  type KeyboardSource,
  type KeyPress,
} from '../../src/input/KeyboardInput';
import { recordEvents } from '../helpers/recordEvents';

/** Fausse cible : retient l'écouteur `keydown`, que `press` appelle. */
function fakeSource() {
  const listeners = new Set<(event: KeyPress) => void>();
  const source: KeyboardSource = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  /** Simule un `keydown` ; `repeat` quand la touche est maintenue. */
  const press = (key: string, repeat = false) => {
    const event = { key, repeat, preventDefault: vi.fn() };
    for (const listener of listeners) {
      listener(event);
    }
    return event;
  };
  return { source, press, listeners };
}

describe('KeyboardInput', () => {
  let bus: EventBus<AppEvents>;
  let keyboard: ReturnType<typeof fakeSource>;
  let active: boolean;
  let input: KeyboardInput;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus<AppEvents>();
    keyboard = fakeSource();
    active = true;
    input = new KeyboardInput(bus, () => active, keyboard.source);
  });

  afterEach(() => {
    input.destroy();
    vi.useRealTimers();
  });

  it('publie input:move pour chaque flèche et input:bomb pour la barre d’espace', () => {
    const events = recordEvents(bus);

    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']) {
      keyboard.press(key);
    }

    expect(events).toEqual([
      ['input:move', { direction: 'up' }],
      ['input:move', { direction: 'down' }],
      ['input:move', { direction: 'left' }],
      ['input:move', { direction: 'right' }],
      ['input:bomb', undefined],
    ]);
  });

  it('ignore les autres touches et les laisse au navigateur', () => {
    const events = recordEvents(bus);

    for (const key of ['a', 'Enter', 'Spacebar', 'arrowup', 'z', 'Escape']) {
      expect(keyboard.press(key).preventDefault).not.toHaveBeenCalled();
    }

    expect(events).toEqual([]);
  });

  it('bloque l’effet par défaut des touches qu’il traite', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']) {
      expect(keyboard.press(key).preventDefault).toHaveBeenCalledOnce();
    }
  });

  it('ne publie rien et laisse les touches au navigateur quand il est inactif', () => {
    const events = recordEvents(bus);
    active = false;

    for (const key of ['ArrowUp', ' ']) {
      expect(keyboard.press(key).preventDefault).not.toHaveBeenCalled();
    }
    expect(events).toEqual([]);

    active = true;
    keyboard.press('ArrowUp');
    expect(events).toEqual([['input:move', { direction: 'up' }]]);
  });

  it('lit isActive à chaque touche', () => {
    const isActive = vi.fn(() => true);
    input.destroy();
    input = new KeyboardInput(bus, isActive, keyboard.source);
    expect(isActive).not.toHaveBeenCalled();

    keyboard.press('ArrowUp');
    keyboard.press('ArrowUp');

    expect(isActive).toHaveBeenCalledTimes(2);
  });

  describe('touche maintenue', () => {
    it('publie au plus un déplacement par intervalle', () => {
      const events = recordEvents(bus);

      keyboard.press('ArrowRight');
      vi.advanceTimersByTime(MOVE_REPEAT_INTERVAL_MS - 1);
      const repeated = keyboard.press('ArrowRight', true);
      expect(events).toHaveLength(1);
      // Ignorée, la répétition ne fait pas défiler la page pour autant.
      expect(repeated.preventDefault).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(1);
      keyboard.press('ArrowRight', true);
      expect(events).toHaveLength(2);

      for (let i = 0; i < 10; i += 1) {
        vi.advanceTimersByTime(30);
        keyboard.press('ArrowRight', true);
      }
      // 300 ms de répétition : deux déplacements de plus.
      expect(events).toEqual(Array(4).fill(['input:move', { direction: 'right' }]));
    });

    it('compte l’intervalle depuis le dernier déplacement publié', () => {
      const events = recordEvents(bus);

      keyboard.press('ArrowLeft');
      vi.advanceTimersByTime(100);
      keyboard.press('ArrowLeft', true);
      vi.advanceTimersByTime(MOVE_REPEAT_INTERVAL_MS - 100);
      keyboard.press('ArrowLeft', true);
      vi.advanceTimersByTime(100);
      keyboard.press('ArrowLeft', true);

      expect(events).toHaveLength(2);
    });

    it('laisse partir une nouvelle frappe aussitôt', () => {
      const events = recordEvents(bus);

      keyboard.press('ArrowUp');
      keyboard.press('ArrowUp');
      vi.advanceTimersByTime(10);
      keyboard.press('ArrowLeft');

      expect(events).toEqual([
        ['input:move', { direction: 'up' }],
        ['input:move', { direction: 'up' }],
        ['input:move', { direction: 'left' }],
      ]);
    });

    it('fait repartir l’intervalle après une nouvelle frappe', () => {
      const events = recordEvents(bus);

      keyboard.press('ArrowUp');
      vi.advanceTimersByTime(MOVE_REPEAT_INTERVAL_MS);
      keyboard.press('ArrowLeft');
      keyboard.press('ArrowLeft', true);

      expect(events).toEqual([
        ['input:move', { direction: 'up' }],
        ['input:move', { direction: 'left' }],
      ]);
    });

    it('publie une répétition qui arrive sans frappe initiale', () => {
      // Flèche enfoncée avant l'arrivée sur l'écran de jeu : le premier keydown vu est répété.
      const events = recordEvents(bus);

      keyboard.press('ArrowDown', true);

      expect(events).toEqual([['input:move', { direction: 'down' }]]);
    });

    it('ne pose qu’une bombe tant que la barre d’espace reste enfoncée', () => {
      const events = recordEvents(bus);

      keyboard.press(' ');
      for (let i = 0; i < 5; i += 1) {
        vi.advanceTimersByTime(MOVE_REPEAT_INTERVAL_MS);
        expect(keyboard.press(' ', true).preventDefault).toHaveBeenCalledOnce();
      }
      keyboard.press(' ');

      expect(events).toEqual([
        ['input:bomb', undefined],
        ['input:bomb', undefined],
      ]);
    });

    it('ne limite pas la bombe par la cadence des déplacements', () => {
      const events = recordEvents(bus);

      keyboard.press('ArrowUp');
      keyboard.press(' ');
      keyboard.press('ArrowUp', true);

      expect(events).toEqual([
        ['input:move', { direction: 'up' }],
        ['input:bomb', undefined],
      ]);
    });
  });

  it('retire son écouteur quand il est détruit', () => {
    const events = recordEvents(bus);
    expect(keyboard.listeners.size).toBe(1);

    input.destroy();
    keyboard.press('ArrowUp');

    expect(keyboard.listeners.size).toBe(0);
    expect(events).toEqual([]);
  });
});
