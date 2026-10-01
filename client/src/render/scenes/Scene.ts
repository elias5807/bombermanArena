import type { Container } from 'pixi.js';
import type { Viewport } from '../GridLayout';

/**
 * Un écran du jeu (la partie, le lobby...) que `PixiRenderer` affiche. Le moteur ne
 * connaît que cette interface : ajouter un écran ne le modifie pas.
 */
export interface Scene {
  /** Ce que la scène dessine ; le moteur l'ajoute à la scène PixiJS. */
  readonly view: Container;

  /**
   * Appelée quand la scène est affichée, puis à chaque changement de taille de la
   * zone d'affichage : la scène redessine ce qui dépend de cette taille.
   */
  resize(viewport: Viewport): void;

  /** Libère la scène et tout ce qu'elle dessine. */
  destroy(): void;
}
