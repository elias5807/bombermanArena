import type { AppEventBus } from '../core/AppEvents';

/** Intervalle de rafraîchissement : assez court pour que la seconde change à l'heure. */
const TICK_MS = 250;

/** `mm:ss` pour une durée en millisecondes. */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Chronomètre du temps de jeu : repart de `00:00` à chaque `server:GAME_STARTED`,
 * avance chaque seconde, puis se fige à `state:gameOver`, sa minuterie arrêtée.
 *
 * Le temps est mesuré depuis le début de la partie (`Date.now()`), pas en comptant
 * les ticks : un onglet en arrière-plan, où les minuteries ralentissent, reste à l'heure.
 */
export class GameTimer {
  private readonly display: HTMLElement;
  private startedAt = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly unsubscribers: (() => void)[];

  constructor(display: HTMLElement, bus: AppEventBus) {
    this.display = display;
    this.unsubscribers = [
      bus.on('server:GAME_STARTED', () => this.start()),
      bus.on('state:gameOver', () => this.freeze()),
    ];
    this.display.textContent = formatElapsed(0);
  }

  /** Arrête la minuterie et se désabonne du bus. */
  dispose(): void {
    this.stopInterval();
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  private start(): void {
    this.stopInterval();
    this.startedAt = Date.now();
    this.display.textContent = formatElapsed(0);
    this.interval = setInterval(() => this.update(), TICK_MS);
  }

  private freeze(): void {
    if (this.interval === null) {
      return;
    }
    this.update();
    this.stopInterval();
  }

  private update(): void {
    this.display.textContent = formatElapsed(Date.now() - this.startedAt);
  }

  private stopInterval(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
