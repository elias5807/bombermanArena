import type { Viewport } from '../../src/render/GridLayout';
import type { GameScene } from '../../src/render/scenes/GameScene';
import type { Scene } from '../../src/render/scenes/Scene';

/** Taille de la zone d'affichage simulée. */
const VIEWPORT: Viewport = { width: 800, height: 600 };

/**
 * Faux moteur de rendu, à donner à `GameView` : il fait comme `PixiRenderer.setScene`
 * (détruit la scène précédente, dimensionne la nouvelle) sans PixiJS ni WebGL, et garde
 * les scènes affichées. `GameView` ne lui donne que des `GameScene`.
 */
export class FakeRenderer {
  /** Les scènes affichées, dans l'ordre ; la dernière est à l'écran. */
  readonly scenes: GameScene[] = [];

  /** La scène à l'écran. */
  get current(): GameScene {
    const scene = this.scenes.at(-1);
    if (!scene) {
      throw new Error('aucune scène affichée');
    }
    return scene;
  }

  setScene(scene: Scene): void {
    this.scenes.at(-1)?.destroy();
    this.scenes.push(scene as GameScene);
    scene.resize(VIEWPORT);
  }
}

/** Ce que dessine une `GameScene` : joueurs à l'écran, bombes et explosions. */
export function sceneContent(scene: GameScene): { players: number; effects: number } {
  const [, , entities] = scene.view.children;
  const [effects, players] = entities.children;
  return { players: players.children.length, effects: effects.children.length };
}
