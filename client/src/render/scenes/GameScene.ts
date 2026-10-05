import { Container, Graphics } from 'pixi.js';
import { GridLayout, type GridSize, type Viewport } from '../GridLayout';
import type { Scene } from './Scene';

/** Espace laissé autour de la grille, en pixels. */
const MARGIN = 16;

/** Couleurs du sol, en damier. Provisoires : les sprites les remplaceront. */
const FLOOR_COLORS = [0x3a7d44, 0x33703c] as const;
const BORDER_COLOR = 0x0b1f10;
const BORDER_WIDTH = 2;

/**
 * Scène de la partie : dessine la grille de jeu, vide pour l'instant (un sol en
 * damier dans un cadre).
 *
 * La grille est recalculée et redessinée à chaque changement de taille de la zone
 * d'affichage, pour garder des cases entières et des traits nets. Les dimensions
 * viennent de l'appelant : elles seront fixées avec le Backend.
 *
 * @example
 * const scene = new GameScene({ columns: 13, rows: 11 });
 * renderer.setScene(scene);
 * scene.layout?.cellOrigin({ column: 0, row: 0 }); // où placer un sprite sur la case (0, 0)
 */
export class GameScene implements Scene {
  readonly view = new Container();

  private readonly grid: GridSize;
  private readonly floor = new Graphics();
  private currentLayout: GridLayout | undefined;

  constructor(grid: GridSize) {
    this.grid = grid;
    this.view.addChild(this.floor);
  }

  /**
   * Disposition actuelle de la grille, utile pour placer des éléments sur ses cases.
   * Absente tant que la scène n'a pas été affichée.
   */
  get layout(): GridLayout | undefined {
    return this.currentLayout;
  }

  /** @throws RangeError si les dimensions de la grille sont invalides. */
  resize(viewport: Viewport): void {
    this.currentLayout = GridLayout.fit(this.grid, viewport, MARGIN);
    this.drawFloor(this.currentLayout);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private drawFloor(layout: GridLayout): void {
    this.floor.clear();

    // Un seul remplissage par couleur : toutes les cases d'une même teinte forment un tracé.
    FLOOR_COLORS.forEach((color, parity) => {
      for (let row = 0; row < layout.rows; row += 1) {
        for (let column = 0; column < layout.columns; column += 1) {
          if ((column + row) % 2 === parity) {
            const { x, y } = layout.cellOrigin({ column, row });
            this.floor.rect(x, y, layout.cellSize, layout.cellSize);
          }
        }
      }
      this.floor.fill(color);
    });

    // Cadre tracé vers l'intérieur : il ne dépasse pas de la grille.
    this.floor
      .rect(layout.originX, layout.originY, layout.width, layout.height)
      .stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, alignment: 1 });
  }
}
