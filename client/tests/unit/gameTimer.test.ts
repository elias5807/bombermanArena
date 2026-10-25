// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { GameTimer, formatElapsed } from '../../src/ui/gameTimer';

describe('formatElapsed', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1000, '00:01'],
    [59_999, '00:59'],
    [60_000, '01:00'],
    [605_000, '10:05'],
    [100 * 60_000, '100:00'],
    [-500, '00:00'],
  ])('%i ms → %s', (elapsedMs, expected) => {
    expect(formatElapsed(elapsedMs)).toBe(expected);
  });
});

describe('GameTimer', () => {
  let bus: EventBus<AppEvents>;
  let display: HTMLElement;
  let timer: GameTimer;

  const start = () => bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players: ['p1'] });
  const gameOver = () => bus.emit('state:gameOver', { winnerId: null, outcome: 'draw' });

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus<AppEvents>((error) => {
      throw error;
    });
    display = document.createElement('div');
    display.textContent = '02:45';
    timer = new GameTimer(display, bus);
  });

  afterEach(() => {
    timer.dispose();
    vi.useRealTimers();
  });

  it('affiche 00:00 avant la partie, sans avancer', () => {
    expect(display.textContent).toBe('00:00');

    vi.advanceTimersByTime(5000);

    expect(display.textContent).toBe('00:00');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('compte le temps écoulé depuis GAME_STARTED', () => {
    vi.advanceTimersByTime(3000);
    start();

    expect(display.textContent).toBe('00:00');
    vi.advanceTimersByTime(999);
    expect(display.textContent).toBe('00:00');
    vi.advanceTimersByTime(1);
    expect(display.textContent).toBe('00:01');
    vi.advanceTimersByTime(64_000);
    expect(display.textContent).toBe('01:05');
  });

  it('se fige à la fin de partie et arrête sa minuterie', () => {
    start();
    vi.advanceTimersByTime(12_100);
    gameOver();

    expect(display.textContent).toBe('00:12');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(display.textContent).toBe('00:12');
  });

  it('affiche le temps exact au moment de la fin, même entre deux rafraîchissements', () => {
    start();
    vi.advanceTimersByTime(1900);
    vi.setSystemTime(Date.now() + 100);
    gameOver();

    expect(display.textContent).toBe('00:02');
  });

  it('repart de zéro à la partie suivante', () => {
    start();
    vi.advanceTimersByTime(30_000);
    gameOver();
    vi.advanceTimersByTime(5000);
    start();

    expect(display.textContent).toBe('00:00');
    vi.advanceTimersByTime(2000);
    expect(display.textContent).toBe('00:02');
  });

  it('repart de zéro sur un nouveau GAME_STARTED sans fin de partie, avec une seule minuterie', () => {
    start();
    vi.advanceTimersByTime(30_000);
    start();

    expect(display.textContent).toBe('00:00');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('ignore une fin de partie hors partie', () => {
    gameOver();

    expect(display.textContent).toBe('00:00');
  });

  it('dispose() arrête la minuterie et le suivi du bus', () => {
    start();
    vi.advanceTimersByTime(2000);
    timer.dispose();

    expect(vi.getTimerCount()).toBe(0);
    start();
    expect(vi.getTimerCount()).toBe(0);
    expect(display.textContent).toBe('00:02');
  });
});
