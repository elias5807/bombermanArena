import { describe, expect, it } from 'vitest';
import { GridLayout, type Cell } from '../../src/render/GridLayout';

const grid = { columns: 13, rows: 11 };

/** Grille de 4 colonnes sur 3 lignes, cases de 10 px, dont le coin haut gauche est en (100, 50). */
const small = new GridLayout({ columns: 4, rows: 3 }, 10, { x: 100, y: 50 });

describe('GridLayout', () => {
  describe('construction', () => {
    it.each([
      ['aucune colonne', { columns: 0, rows: 3 }],
      ['aucune ligne', { columns: 4, rows: 0 }],
      ['un nombre négatif de colonnes', { columns: -1, rows: 3 }],
      ['un nombre de lignes non entier', { columns: 4, rows: 2.5 }],
      ['un nombre de colonnes indéfini', { columns: Number.NaN, rows: 3 }],
      ['un nombre de lignes infini', { columns: 4, rows: Infinity }],
    ])('refuse une grille avec %s', (_name, size) => {
      expect(() => new GridLayout(size, 10, { x: 0, y: 0 })).toThrow(RangeError);
    });

    it.each([0, -5, Number.NaN, Infinity])('refuse un côté de case de %s', (cellSize) => {
      expect(() => new GridLayout({ columns: 4, rows: 3 }, cellSize, { x: 0, y: 0 })).toThrow(
        RangeError,
      );
    });

    it('donne les dimensions de la grille en pixels', () => {
      expect(small.width).toBe(40);
      expect(small.height).toBe(30);
    });
  });

  describe('fit', () => {
    it('centre la grille dans la zone et agrandit les cases au maximum', () => {
      const layout = GridLayout.fit(grid, { width: 800, height: 600 });

      // La hauteur limite : 600 / 11 = 54,5 px par case, soit 54 en entier.
      expect(layout.cellSize).toBe(54);
      expect(layout.originX).toBe(49); // (800 - 13 × 54) / 2
      expect(layout.originY).toBe(3); // (600 - 11 × 54) / 2
    });

    it('laisse la marge demandée de chaque côté', () => {
      const layout = GridLayout.fit(grid, { width: 800, height: 600 }, 16);

      expect(layout.cellSize).toBe(51); // (600 - 2 × 16) / 11 = 51,6
      expect(layout.originX).toBe(68);
      expect(layout.originY).toBe(19);
    });

    it('est limitée par la largeur quand la zone est haute et étroite', () => {
      const layout = GridLayout.fit(grid, { width: 400, height: 900 });

      expect(layout.cellSize).toBe(30); // 400 / 13 = 30,8
      expect(layout.originX).toBe(5);
      expect(layout.originY).toBe(285);
    });

    it('garde des valeurs entières même si la zone ne l’est pas', () => {
      const layout = GridLayout.fit(grid, { width: 801.7, height: 600.2 });

      expect(layout.cellSize).toBe(54);
      expect(layout.originX).toBe(49);
      expect(layout.originY).toBe(3);
    });

    it.each([
      [800, 600],
      [1024, 768],
      [375, 812],
      [1920, 1080],
    ])('tient dans une zone de %i × %i avec sa marge, sans pouvoir être plus grande', (w, h) => {
      const margin = 16;
      const layout = GridLayout.fit(grid, { width: w, height: h }, margin);

      expect(Number.isInteger(layout.cellSize)).toBe(true);
      expect(layout.originX).toBeGreaterThanOrEqual(margin);
      expect(layout.originY).toBeGreaterThanOrEqual(margin);
      expect(w - (layout.originX + layout.width)).toBeGreaterThanOrEqual(margin);
      expect(h - (layout.originY + layout.height)).toBeGreaterThanOrEqual(margin);

      // Une case de plus par côté ne tiendrait plus.
      const bigger = layout.cellSize + 1;
      expect(bigger * grid.columns > w - 2 * margin || bigger * grid.rows > h - 2 * margin).toBe(
        true,
      );
    });

    it.each([
      [
        'une zone qui déborde (la grille dépasse des deux côtés)',
        { width: 5, height: 5 },
        0,
        -4,
        -3,
      ],
      ['une zone plus petite que ses marges', { width: 20, height: 20 }, 16, 3, 4],
    ])('garde des cases d’au moins 1 pixel dans %s', (_name, viewport, margin, x, y) => {
      const layout = GridLayout.fit(grid, viewport, margin);

      expect(layout.cellSize).toBe(1);
      expect(layout.originX).toBe(x);
      expect(layout.originY).toBe(y);
    });

    it('refuse une grille vide', () => {
      expect(() => GridLayout.fit({ columns: 0, rows: 11 }, { width: 800, height: 600 })).toThrow(
        RangeError,
      );
    });
  });

  describe('contains', () => {
    it.each<[string, Cell]>([
      ['la première case', { column: 0, row: 0 }],
      ['la dernière case', { column: 3, row: 2 }],
      ['une case du milieu', { column: 2, row: 1 }],
    ])('accepte %s', (_name, cell) => {
      expect(small.contains(cell)).toBe(true);
    });

    it.each<[string, Cell]>([
      ['une colonne après la dernière', { column: 4, row: 0 }],
      ['une ligne après la dernière', { column: 0, row: 3 }],
      ['une colonne négative', { column: -1, row: 0 }],
      ['une ligne négative', { column: 0, row: -1 }],
      ['une colonne non entière', { column: 1.5, row: 1 }],
      ['une ligne indéfinie', { column: 1, row: Number.NaN }],
    ])('refuse %s', (_name, cell) => {
      expect(small.contains(cell)).toBe(false);
    });
  });

  describe('cellOrigin', () => {
    it('place la première case sur l’origine de la grille', () => {
      expect(small.cellOrigin({ column: 0, row: 0 })).toEqual({ x: 100, y: 50 });
    });

    it('avance d’un côté de case par colonne et par ligne', () => {
      expect(small.cellOrigin({ column: 2, row: 1 })).toEqual({ x: 120, y: 60 });
    });

    it('reste défini pour une case hors de la grille', () => {
      expect(small.cellOrigin({ column: -1, row: -1 })).toEqual({ x: 90, y: 40 });
      expect(small.cellOrigin({ column: 4, row: 3 })).toEqual({ x: 140, y: 80 });
    });
  });

  describe('cellAt', () => {
    it.each<[string, number, number, Cell]>([
      ['le coin haut gauche de la grille', 100, 50, { column: 0, row: 0 }],
      ['le dernier pixel de la première case', 109.999, 59.999, { column: 0, row: 0 }],
      ['le premier pixel de la case suivante', 110, 60, { column: 1, row: 1 }],
      ['le dernier pixel de la grille', 139.999, 79.999, { column: 3, row: 2 }],
    ])('trouve la case sous %s', (_name, x, y, expected) => {
      expect(small.cellAt({ x, y })).toEqual(expected);
    });

    it.each<[string, number, number]>([
      ['à gauche de la grille', 99.999, 55],
      ['au-dessus de la grille', 105, 49.999],
      ['sur le bord droit, qui n’appartient pas à la dernière colonne', 140, 55],
      ['sur le bord bas, qui n’appartient pas à la dernière ligne', 105, 80],
      ['loin de la grille', 5000, -5000],
    ])('ne trouve aucune case %s', (_name, x, y) => {
      expect(small.cellAt({ x, y })).toBeUndefined();
    });

    it('retrouve chaque case depuis son coin et depuis son centre', () => {
      for (let row = 0; row < small.rows; row += 1) {
        for (let column = 0; column < small.columns; column += 1) {
          const cell = { column, row };
          const { x, y } = small.cellOrigin(cell);

          expect(small.cellAt({ x, y })).toEqual(cell);
          expect(small.cellAt({ x: x + small.cellSize / 2, y: y + small.cellSize / 2 })).toEqual(
            cell,
          );
        }
      }
    });
  });
});
