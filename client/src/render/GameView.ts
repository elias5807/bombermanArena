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
 * Plateau de la partie : affiche dans `host` une `GameScene` neuve à chaque
 * `server:GAME_STARTED`, même si la partie précédente est encore à l'écran. Rien ne passe
 * d'une partie à l'autre : bombes, explosions et joueurs disparaissent avec l'ancienne scène.
 *
 * Le moteur de rendu (PixiJS) et les sprites sont préparés à la première partie, puis
 * réutilisés. Une scène n'entend que les messages publiés après sa création : `GameView`
 * garde donc le dernier `server:GAME_STATE` de la partie et le donne une fois à la scène
 * neuve, qui reçoit directement les suivants. L'état reçu avant le `GAME_STARTED` (fin de la
 * partie précédente, salon) n'est pas repris, sauf les dimensions du plateau : `DEFAULT_GRID`
 * tant qu'aucun état ne les a données. Tout est oublié quand la connexion se ferme ou se coupe.
 *
 * `host` doit être visible quand `server:GAME_STARTED` parvient au plateau : PixiJS mesure sa
 * taille au démarrage. Le plateau vit aussi longtemps que la page.
 *
 * @example
 * // Après ScreenNavigator, qui affiche l'écran de jeu sur le même GAME_STARTED :
 * new GameView(document.querySelector('#canvas-container'), app.bus);
 */
export class GameView {
  private readonly host: HTMLElement;
  private readonly bus: AppEventBus;
  private readonly createRenderer: (host: HTMLElement) => Promise<SceneHost>;
  private readonly loadSprites: () => Promise<SpriteTextures>;
  /** Démarrage du rendu, lancé à la première partie ; `null` avant, ou après un échec. */
  private rendering: Promise<Rendering> | null = null;
  /** Dernier état de la partie en cours, `null` tant qu'elle n'en a reçu aucun. */
  private latestState: GameStateMessage | null = null;
  /** Dimensions du plateau, d'après le dernier état qui les donne. */
  private grid: GridSize = DEFAULT_GRID;

  /**
   * @param host Élément qui reçoit le canvas, et dont le canvas suit la taille.
   * @param bus Bus de l'application : le plateau et ses scènes y lisent l'état du serveur.
   */
  constructor(host: HTMLElement, bus: AppEventBus, options: GameViewOptions = {}) {
    this.host = host;
    this.bus = bus;
    this.createRenderer = options.createRenderer ?? ((element) => PixiRenderer.create(element));
    this.loadSprites = options.loadSprites ?? loadSprites;

    bus.on('server:GAME_STARTED', () => this.showNewGame());
    bus.on('server:GAME_STATE', (message) => {
      this.latestState = message;
      this.grid = message.grid ?? this.grid;
    });
    // Le serveur a retiré le joueur : la session suivante repart de rien.
    bus.on('connection:closed', () => this.forget());
    bus.on('connection:lost', () => this.forget());
  }

  /**
   * Remplace la scène par une neuve dès que le rendu est prêt. Un échec du rendu est écrit
   * dans la console, et la partie suivante réessaie.
   */
  private showNewGame(): void {
    // Carte et joueurs de la partie précédente ne sont pas ceux de la nouvelle, que le serveur
    // décrit dans le GAME_STATE qui suit. Les dimensions du plateau, elles, ne changent pas.
    this.latestState = null;
    this.rendering ??= this.startRendering().catch((error: unknown) => {
      this.rendering = null; // nouvel essai à la partie suivante
      throw error;
    });
    this.rendering
      .then(({ renderer, sprites }) => {
        // `setScene` détruit la scène précédente, ses sprites et ses bombes.
        const scene = new GameScene(this.grid, sprites, this.bus);
        renderer.setScene(scene);
        if (this.latestState) {
          scene.handleGameState(this.latestState);
        }
      })
      .catch((error: unknown) => {
        console.error("Impossible d'initialiser le rendu :", error);
      });
  }

  private forget(): void {
    this.latestState = null;
    this.grid = DEFAULT_GRID;
  }

  private async startRendering(): Promise<Rendering> {
    const renderer = await this.createRenderer(this.host);
    return { renderer, sprites: await this.loadSprites() };
  }
}
