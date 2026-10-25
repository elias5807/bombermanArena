import type { AppEventBus, Direction } from '../core/AppEvents';

/**
 * Intervalle minimal entre deux déplacements quand une flèche reste enfoncée, en
 * millisecondes. Le serveur déplace le joueur d'une case par `MOVE`, sans limite de
 * cadence : sans ce délai, la répétition automatique du clavier (une trentaine de
 * `keydown` par seconde) ferait traverser le plateau en un instant.
 */
export const MOVE_REPEAT_INTERVAL_MS = 150;

const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const BOMB_KEY = ' ';

/** Ce que `KeyboardInput` lit d'un `KeyboardEvent`. */
export type KeyPress = Pick<KeyboardEvent, 'key' | 'repeat' | 'preventDefault'>;

/** Ce qui émet les `keydown` : `window` dans l'application, une fausse cible dans les tests. */
export interface KeyboardSource {
  addEventListener(type: 'keydown', listener: (event: KeyPress) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyPress) => void): void;
}

/**
 * Traduit le clavier en demandes du joueur : les flèches en `input:move`, la barre
 * d'espace en `input:bomb`. Les touches traitées n'ont pas leur effet par défaut
 * (défilement de la page) ; les autres sont laissées au navigateur.
 *
 * Tant que `isActive()` est faux (autre écran que la partie, joueur éliminé), aucune
 * touche n'est traitée : un pseudo se tape normalement dans le champ de connexion.
 *
 * Flèche maintenue : un déplacement au plus toutes les `MOVE_REPEAT_INTERVAL_MS`. Une
 * nouvelle frappe part aussitôt. Barre d'espace maintenue : une seule bombe.
 *
 * @example
 * const keyboard = new KeyboardInput(bus, () => partieEnCours);
 * // ...
 * keyboard.destroy();
 */
export class KeyboardInput {
  private readonly bus: AppEventBus;
  private readonly isActive: () => boolean;
  private readonly source: KeyboardSource;
  private readonly listener = (event: KeyPress) => this.handleKeyDown(event);
  /** Instant du dernier déplacement publié, `null` avant le premier. */
  private lastMoveAt: number | null = null;

  /**
   * @param bus Bus de l'application, où partent les demandes du joueur.
   * @param isActive Dit, à chaque touche, si le clavier pilote la partie.
   * @param source Émetteur des `keydown`, `window` par défaut.
   */
  constructor(bus: AppEventBus, isActive: () => boolean, source: KeyboardSource = window) {
    this.bus = bus;
    this.isActive = isActive;
    this.source = source;
    source.addEventListener('keydown', this.listener);
  }

  /** Retire l'écouteur clavier. */
  destroy(): void {
    this.source.removeEventListener('keydown', this.listener);
  }

  private handleKeyDown(event: KeyPress): void {
    const direction = KEY_TO_DIRECTION[event.key];
    if ((direction === undefined && event.key !== BOMB_KEY) || !this.isActive()) {
      return;
    }
    event.preventDefault();

    if (direction === undefined) {
      if (!event.repeat) {
        this.bus.emit('input:bomb');
      }
      return;
    }

    const now = performance.now();
    if (
      event.repeat &&
      this.lastMoveAt !== null &&
      now - this.lastMoveAt < MOVE_REPEAT_INTERVAL_MS
    ) {
      return;
    }
    this.lastMoveAt = now;
    this.bus.emit('input:move', { direction });
  }
}
