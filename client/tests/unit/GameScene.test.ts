import { Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridLayout } from '../../src/render/GridLayout';
import { GameScene } from '../../src/render/scenes/GameScene';

/**
 * Ces tests utilisent les vrais objets PixiJS (conteneurs, tracés) : ils n'ont pas
 * besoin de navigateur tant qu'on ne les rend pas à l'écran. L'aspect (couleurs,
 * netteté) se contrôle à l'œil avec `npm run dev`.
 */
const grid = { columns: 13, rows: 11 };

function layoutOf(scene: GameScene): GridLayout {
  const { layout } = scene;
  if (!layout) {
    throw new Error("la scène n'a pas de disposition");
  }
  return layout;
}

/** Rectangle couvert par la grille, tel que la disposition le calcule. */
function gridBounds(layout: GridLayout) {
  return {
    minX: layout.originX,
    minY: layout.originY,
    maxX: layout.originX + layout.width,
    maxY: layout.originY + layout.height,
  };
}

describe('GameScene', () => {
  let scene: GameScene;

  beforeEach(() => {
    scene = new GameScene(grid);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    scene.destroy();
  });

  it("ne dessine rien et n'a pas de disposition avant d'être affichée", () => {
    expect(scene.layout).toBeUndefined();
    expect(scene.view.getLocalBounds()).toMatchObject({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('dessine la grille exactement là où sa disposition la place', () => {
    scene.resize({ width: 800, height: 600 });

    expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(layoutOf(scene)));
  });

  it('ne colle pas la grille aux bords de la zone', () => {
    // 520 × 440 = 13 × 11 cases de 40 px : sans marge, la grille toucherait les quatre bords.
    scene.resize({ width: 520, height: 440 });
    const layout = layoutOf(scene);

    expect(layout.originX).toBeGreaterThan(0);
    expect(layout.originY).toBeGreaterThan(0);
    expect(520 - (layout.originX + layout.width)).toBeGreaterThan(0);
    expect(440 - (layout.originY + layout.height)).toBeGreaterThan(0);
  });

  it('dessine chaque case une fois, à sa place, puis le cadre', () => {
    const rect = vi.spyOn(Graphics.prototype, 'rect');

    scene.resize({ width: 800, height: 600 });

    const layout = layoutOf(scene);
    const drawn = rect.mock.calls.map(([x, y, width, height]) => [x, y, width, height]);
    const cells = Array.from({ length: grid.rows }, (_, row) =>
      Array.from({ length: grid.columns }, (_, column) => {
        const { x, y } = layout.cellOrigin({ column, row });
        return [x, y, layout.cellSize, layout.cellSize];
      }),
    ).flat();
    const frame = [layout.originX, layout.originY, layout.width, layout.height];

    expect(drawn).toHaveLength(grid.columns * grid.rows + 1);
    expect(new Set(drawn.map((r) => r.join()))).toEqual(
      new Set([...cells, frame].map((r) => r.join())),
    );
  });

  it('alterne deux couleurs en damier, pour que les cases se distinguent', () => {
    const rect = vi.spyOn(Graphics.prototype, 'rect');
    const fill = vi.spyOn(Graphics.prototype, 'fill');

    scene.resize({ width: 800, height: 600 });

    // PixiJS remplit les rectangles accumulés par `rect` au `fill` qui suit. Le dernier
    // rectangle est le cadre : il est tracé, pas rempli.
    const layout = layoutOf(scene);
    const colorOf = new Map<string, unknown>();
    rect.mock.calls.slice(0, -1).forEach(([x, y], index) => {
      const drawnAt = rect.mock.invocationCallOrder[index];
      const fillIndex = fill.mock.invocationCallOrder.findIndex((order) => order > drawnAt);
      const cell = layout.cellAt({ x, y });
      colorOf.set(`${cell?.column},${cell?.row}`, fill.mock.calls[fillIndex][0]);
    });

    expect(colorOf.size).toBe(grid.columns * grid.rows);
    expect(new Set(colorOf.values()).size).toBe(2);
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const color = colorOf.get(`${column},${row}`);
        expect(color).not.toBe(colorOf.get(`${column + 1},${row}`));
        expect(color).not.toBe(colorOf.get(`${column},${row + 1}`));
      }
    }
  });

  it("redessine à la nouvelle taille sans garder l'ancien dessin", () => {
    scene.resize({ width: 800, height: 600 });
    const before = layoutOf(scene);

    scene.resize({ width: 400, height: 300 });
    const after = layoutOf(scene);

    expect(after.cellSize).toBeLessThan(before.cellSize);
    expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(after));
  });

  it("dessine une grille d'une seule case", () => {
    scene.destroy();
    scene = new GameScene({ columns: 1, rows: 1 });

    scene.resize({ width: 800, height: 600 });

    expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(layoutOf(scene)));
  });

  it('refuse une grille invalide quand elle est affichée', () => {
    const invalid = new GameScene({ columns: 0, rows: 11 });

    expect(() => invalid.resize({ width: 800, height: 600 })).toThrow(RangeError);
    expect(invalid.layout).toBeUndefined();
    invalid.destroy();
  });

  it('libère sa vue et ce qu’elle dessine quand elle est détruite, même deux fois', () => {
    scene.resize({ width: 800, height: 600 });
    const [floor] = scene.view.children;

    scene.destroy();

    expect(scene.view.destroyed).toBe(true);
    expect(floor.destroyed).toBe(true);
    expect(() => scene.destroy()).not.toThrow();
  });
});
