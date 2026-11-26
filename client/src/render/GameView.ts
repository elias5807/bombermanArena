import type { GameStateMessage } from '@shared/protocol/messages';
import type { AppEventBus } from '../core/AppEvents';
import type { GridSize } from './GridLayout';
import { PixiRenderer } from './PixiRenderer';
import { GameScene } from './scenes/GameScene';
import { loadSprites, type SpriteTextures } from './sprites/loadSprites';

/** Dimensions du plateau tant qu'aucun `GAME_STATE` ne les a données : celles du serveur. */
export const DEFAULT_GRID: GridSize = { columns: 15, rows: 13 };

/** Ce que `GameView` demande au moteur de rendu : afficher une scène. */
export type SceneHost = Pick<PixiRenderer, 'setScene'>;

/** Ressources du rendu, remplaçables dans les tests : PixiJS demande WebGL. */
export interface GameViewOptions {
  /** Démarre le moteur de rendu dans `host` : `PixiRenderer.create` par défaut. */
  createRenderer?: (host: HTMLElement) => Promise<SceneHost>;
  /** Charge les textures des sprites : `loadSprites` par défaut. */
  loadSprites?: () => Promise<SpriteTextures>;
}

interface Rendering {
  renderer: SceneHost;
  sprites: SpriteTextures;
}

/**
 * Plateau de la partie : affiche dans `host` une `GameScene` neuve à chaque `showNewGame()`.
 *
 * Le moteur de rendu (PixiJS) et les sprites sont préparés au premier appel, puis réutilisés.
 * Une scène n'entend que les messages publiés après sa création : `GameView` garde donc le
 * dernier `server:GAME_STATE` et le donne une fois à la scène neuve, qui reçoit directement
 * les suivants. Ses dimensions sont celles de cet état, `DEFAULT_GRID` à défaut.
 *
 * Le plateau vit aussi longtemps que la page ; `reset()` oublie la session terminée.
 *
 * @example
 * const board = new GameView(document.querySelector('#canvas-container'), app.bus);
 * // ... l'écran de jeu est affiché :
 * void board.showNewGame();
 */
export class GameView {
  private readonly host: HTMLElement;
  private readonly bus: AppEventBus;
  private readonly createRenderer: (host: HTMLElement) => Promise<SceneHost>;
  private readonly loadSprites: () => Promise<SpriteTextures>;
  /** Démarrage du rendu, lancé au premier `showNewGame()` ; `null` avant, ou après un échec. */
  private rendering: Promise<Rendering> | null = null;
  private latestState: GameStateMessage | null = null;

  /**
   * @param host Élément qui reçoit le canvas, et dont le canvas suit la taille.
   * @param bus Bus de l'application : les scènes y lisent l'état du serveur.
   */
  constructor(host: HTMLElement, bus: AppEventBus, options: GameViewOptions = {}) {
    this.host = host;
    this.bus = bus;
    this.createRenderer = options.createRenderer ?? ((element) => PixiRenderer.create(element));
    this.loadSprites = options.loadSprites ?? loadSprites;
    bus.on('server:GAME_STATE', (message) => {
      this.latestState = message;
    });
  }

  /**
   * Affiche une partie neuve : une `GameScene` neuve remplace la précédente dès que le rendu
   * est prêt. `host` doit être visible : PixiJS mesure sa taille au démarrage.
   *
   * @returns une promesse tenue une fois la scène affichée. Elle n'est jamais rejetée : un
   *   échec du rendu est écrit dans la console, et l'appel suivant réessaie.
   */
  showNewGame(): Promise<void> {
    this.rendering ??= this.startRendering().catch((error: unknown) => {
      this.rendering = null; // nouvel essai à la partie suivante
      throw error;
    });
    return this.rendering
      .then(({ renderer, sprites }) => {
        // `setScene` détruit la scène précédente, ses sprites et ses bombes.
        const scene = new GameScene(this.latestState?.grid ?? DEFAULT_GRID, sprites, this.bus);
        renderer.setScene(scene);
        if (this.latestState) {
          scene.handleGameState(this.latestState);
        }
      })
      .catch((error: unknown) => {
        console.error("Impossible d'initialiser le rendu :", error);
      });
  }

  /** Oublie l'état reçu pendant la session terminée. */
  reset(): void {
    this.latestState = null;
  }

  private async startRendering(): Promise<Rendering> {
    const renderer = await this.createRenderer(this.host);
    return { renderer, sprites: await this.loadSprites() };
  }
}
