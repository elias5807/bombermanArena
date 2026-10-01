import { Application } from 'pixi.js';
import type { Scene } from './scenes/Scene';

/** Fond de la zone d'affichage, identique à celui d'`index.html` : pas de flash au démarrage. */
const BACKGROUND_COLOR = 0x1a1a1f;

/**
 * Moteur de rendu : possède l'application PixiJS, affiche une scène à la fois et la
 * prévient quand la zone d'affichage change de taille.
 *
 * Il ne connaît ni le réseau ni les règles du jeu : chaque scène dessine ce qu'on lui
 * donne. Le canvas suit la taille de l'élément qui l'accueille, qui doit donc avoir
 * une taille propre (par exemple toute la fenêtre).
 *
 * @example
 * const renderer = await PixiRenderer.create(document.querySelector('#app'));
 * renderer.setScene(new GameScene({ columns: 13, rows: 11 }));
 * // ... à la fermeture :
 * renderer.destroy();
 */
export class PixiRenderer {
  private readonly app: Application;
  private scene: Scene | undefined;
  private destroyed = false;

  // Un moteur n'existe qu'une fois PixiJS démarré : voir `create`.
  private constructor(app: Application) {
    this.app = app;
    app.renderer.on('resize', this.handleResize);
  }

  /**
   * Démarre PixiJS, puis ajoute son canvas à `host` et suit la taille de `host`.
   *
   * @throws si PixiJS ne peut pas démarrer (WebGL indisponible, par exemple).
   */
  static async create(host: HTMLElement): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: BACKGROUND_COLOR,
      antialias: true,
      // Net sur les écrans à forte densité de pixels (mise à l'échelle de Windows, par exemple).
      resolution: globalThis.devicePixelRatio || 1,
      autoDensity: true,
    });
    host.appendChild(app.canvas);
    return new PixiRenderer(app);
  }

  /**
   * Affiche `scene` à la place de la scène courante, qui est détruite. Redonner la
   * scène déjà affichée ne fait rien.
   *
   * @throws Error si le moteur est détruit.
   */
  setScene(scene: Scene): void {
    if (this.destroyed) {
      throw new Error('PixiRenderer : le moteur de rendu est détruit.');
    }
    if (scene === this.scene) {
      return;
    }

    this.scene?.destroy();
    this.scene = scene;
    this.app.stage.addChild(scene.view);
    scene.resize(this.app.screen);
  }

  /** Libère la scène, PixiJS et le canvas. Sans effet si le moteur est déjà détruit. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    this.scene?.destroy();
    this.scene = undefined;
    this.app.renderer.off('resize', this.handleResize);
    this.app.destroy(true, { children: true });
  }

  private readonly handleResize = (width: number, height: number): void => {
    this.scene?.resize({ width, height });
  };
}
