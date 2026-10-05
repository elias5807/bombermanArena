/** Dimensions d'une grille, en cases. */
export interface GridSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * Une case de la grille, repérée par sa colonne et sa ligne à partir de 0. La case
 * (0, 0) est en haut à gauche : les colonnes croissent vers la droite, les lignes
 * vers le bas.
 */
export interface Cell {
  readonly column: number;
  readonly row: number;
}

/** Un point de la zone d'affichage, en pixels, mesuré depuis son coin supérieur gauche. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Taille de la zone d'affichage, en pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Où et à quelle taille une grille est dessinée dans la zone d'affichage : fait le
 * lien entre les cases (colonne, ligne) et les pixels.
 *
 * C'est de la géométrie pure, sans PixiJS : elle se teste sans navigateur. Une
 * disposition ne change pas ; quand la zone d'affichage change de taille, on en
 * calcule une nouvelle avec `GridLayout.fit`.
 *
 * @example
 * const layout = GridLayout.fit({ columns: 13, rows: 11 }, { width: 800, height: 600 }, 16);
 * layout.cellOrigin({ column: 2, row: 3 }); // où dessiner la case (2, 3)
 * layout.cellAt({ x: 120, y: 90 }); // quelle case est sous ce point
 */
export class GridLayout {
  readonly columns: number;
  readonly rows: number;
  /** Côté d'une case, en pixels. */
  readonly cellSize: number;
  /** Position du coin supérieur gauche de la grille, en pixels. */
  readonly originX: number;
  readonly originY: number;

  /**
   * @param grid Dimensions de la grille.
   * @param cellSize Côté d'une case, en pixels.
   * @param origin Position du coin supérieur gauche de la grille, en pixels.
   * @throws RangeError si la grille n'a pas au moins une colonne et une ligne entières,
   *   ou si `cellSize` n'est pas un nombre positif.
   */
  constructor(grid: GridSize, cellSize: number, origin: Point) {
    if (!isWholeCount(grid.columns) || !isWholeCount(grid.rows)) {
      throw new RangeError(
        'GridLayout : la grille doit avoir au moins une colonne et une ligne, en nombres entiers.',
      );
    }
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError("GridLayout : le côté d'une case doit être un nombre positif.");
    }

    this.columns = grid.columns;
    this.rows = grid.rows;
    this.cellSize = cellSize;
    this.originX = origin.x;
    this.originY = origin.y;
  }

  /**
   * Plus grande disposition de `grid` qui tient dans `viewport` en laissant `margin`
   * pixels de chaque côté, centrée dans la zone.
   *
   * Le côté d'une case est un nombre entier de pixels, pour que les traits restent
   * nets, et vaut au moins 1 : dans une zone trop petite, la grille déborde au lieu
   * de disparaître.
   */
  static fit(grid: GridSize, viewport: Viewport, margin = 0): GridLayout {
    const room = Math.min(
      (viewport.width - 2 * margin) / grid.columns,
      (viewport.height - 2 * margin) / grid.rows,
    );
    const cellSize = Math.max(1, Math.floor(room));

    return new GridLayout(grid, cellSize, {
      x: Math.floor((viewport.width - grid.columns * cellSize) / 2),
      y: Math.floor((viewport.height - grid.rows * cellSize) / 2),
    });
  }

  /** Largeur de la grille, en pixels. */
  get width(): number {
    return this.columns * this.cellSize;
  }

  /** Hauteur de la grille, en pixels. */
  get height(): number {
    return this.rows * this.cellSize;
  }

  /** Vrai si `cell` est une case de la grille (indices entiers, bords compris). */
  contains(cell: Cell): boolean {
    return (
      Number.isInteger(cell.column) &&
      Number.isInteger(cell.row) &&
      cell.column >= 0 &&
      cell.column < this.columns &&
      cell.row >= 0 &&
      cell.row < this.rows
    );
  }

  /** Coin supérieur gauche de `cell`, en pixels. Défini aussi pour une case hors de la grille. */
  cellOrigin(cell: Cell): Point {
    return {
      x: this.originX + cell.column * this.cellSize,
      y: this.originY + cell.row * this.cellSize,
    };
  }

  /**
   * Case qui contient `point`, ou `undefined` si le point est hors de la grille. Le
   * bord haut et gauche d'une case lui appartient, pas le bas ni la droite.
   */
  cellAt(point: Point): Cell | undefined {
    const cell = {
      column: Math.floor((point.x - this.originX) / this.cellSize),
      row: Math.floor((point.y - this.originY) / this.cellSize),
    };
    return this.contains(cell) ? cell : undefined;
  }
}

function isWholeCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}
