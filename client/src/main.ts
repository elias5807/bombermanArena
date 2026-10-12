import { PixiRenderer } from './render/PixiRenderer';
import { GameScene } from './render/scenes/GameScene';

/**
 * Point d'entrée de l'application (branche feature/sprites).
 * Affiche la grille de jeu avec les sprites PixiJS et permet de tester
 * le déplacement du personnage et la pose de bombes via le clavier.
 */
const DEMO_GRID = { columns: 15, rows: 13 };

const host = document.querySelector<HTMLDivElement>('#app');

if (host) {
  PixiRenderer.create(host)
    .then((renderer) => {
      const scene = new GameScene(DEMO_GRID);
      renderer.setScene(scene);

      // Gestion des contrôles clavier pour tester les sprites en jeu
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
          e.preventDefault();
          scene.handleInput(e.key);
        }
      });
    })
    .catch((error: unknown) => {
      console.error("Impossible d'initialiser le rendu :", error);
      host.textContent = "Impossible d'afficher le jeu : l'initialisation du rendu a échoué.";
    });
}
