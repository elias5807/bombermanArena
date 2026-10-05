import { PixiRenderer } from './render/PixiRenderer';
import { GameScene } from './render/scenes/GameScene';

/**
 * Point d'entrée de l'application.
 *
 * Affiche pour l'instant une grille de jeu vide, ce qui vérifie la chaîne de rendu
 * PixiJS. L'assemblage des couches (App.ts, injection Mock vs WebSocket) arrive dans
 * une PR dédiée.
 */

/** Provisoire : les dimensions de la grille viendront du serveur, à valider avec le Backend. */
const DEMO_GRID = { columns: 13, rows: 11 };

const host = document.querySelector<HTMLDivElement>('#app');

if (host) {
  PixiRenderer.create(host)
    .then((renderer) => renderer.setScene(new GameScene(DEMO_GRID)))
    .catch((error: unknown) => {
      console.error("Impossible d'initialiser le rendu :", error);
      host.textContent = "Impossible d'afficher le jeu : l'initialisation du rendu a échoué.";
    });
}
