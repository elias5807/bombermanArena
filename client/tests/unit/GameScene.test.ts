import { Sprite, Texture, TextureSource, type Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cell, GridLayout } from '../../src/render/GridLayout';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { GameScene } from '../../src/render/scenes/GameScene';
import type { SpriteTextures } from '../../src/render/sprites/loadSprites';

/**
 * Ces tests utilisent les vrais objets PixiJS (conteneurs, sprites, tracés) : ils n'ont pas
 * besoin de navigateur tant qu'on ne les rend pas à l'écran. Les images, elles, ne se
 * chargent que dans un navigateur : la scène reçoit ici des textures vides. L'aspect
 * (couleurs, netteté) se contrôle à l'œil avec `npm run dev`.
 */
const grid = { columns: 13, rows: 11 };

/** Textures vides, aux dimensions des images de `public/assets/sprites/`. */
function createTextures(): SpriteTextures {
  const blank = (width: number, height: number) =>
    new Texture({ source: new TextureSource({ width, height }) });

  return {
    floor: blank(16, 16),
    wall: blank(16, 16),
    brick: blank(16, 16),
    bomb: blank(15, 15),
    bomb_ticking: blank(14, 15),
    explosion: blank(14, 13),
    player1: blank(15, 23),
    player2: blank(15, 23),
    player3: blank(15, 23),
    player4: blank(15, 23),
  };
}

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

/** Rectangle « x,y,largeur,hauteur » de chaque sprite de `layer` qui porte `texture`. */
function boxesOf(layer: Container, texture: Texture): string[] {
  return layer.children
    .filter((child): child is Sprite => child instanceof Sprite && child.texture === texture)
    .map((sprite) => [sprite.x, sprite.y, sprite.width, sprite.height].join())
    .sort();
}

/** Rectangle « x,y,largeur,hauteur » de chaque case de la grille que `keep` retient. */
function cellBoxes(layout: GridLayout, keep: (cell: Cell) => boolean = () => true): string[] {
  const boxes: string[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let column = 0; column < layout.columns; column += 1) {
      if (keep({ column, row })) {
        const { x, y } = layout.cellOrigin({ column, row });
        boxes.push([x, y, layout.cellSize, layout.cellSize].join());
      }
    }
  }
  return boxes.sort();
}

describe('GameScene', () => {
  let textures: SpriteTextures;
  let scene: GameScene;

  beforeEach(() => {
    // La scène anime ses rivaux avec un minuteur : aucun ne doit tourner pour de vrai.
    vi.useFakeTimers();
    // Carte toujours identique : toutes les cases qui peuvent porter un bloc cassable en ont un.
    vi.spyOn(Math, 'random').mockReturnValue(0);

    textures = createTextures();
    scene = new GameScene(grid, textures);
  });

  afterEach(() => {
    scene.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it('pose un sprite de sol sur chaque case, à sa place et à sa taille, dans un cadre', () => {
    scene.resize({ width: 800, height: 600 });

    const layout = layoutOf(scene);
    const [floor, , , frame] = scene.view.children;

    expect(floor.children).toHaveLength(grid.columns * grid.rows);
    expect(boxesOf(floor, textures.floor)).toEqual(cellBoxes(layout));
    expect(frame.getLocalBounds()).toMatchObject(gridBounds(layout));
  });

  it('dessine par-dessus le sol un mur sur le pourtour et un pilier une case sur deux', () => {
    const isWall = ({ column, row }: Cell) =>
      column === 0 ||
      row === 0 ||
      column === grid.columns - 1 ||
      row === grid.rows - 1 ||
      (column % 2 === 0 && row % 2 === 0);

    scene.resize({ width: 800, height: 600 });

    const layout = layoutOf(scene);
    const [, walls] = scene.view.children;
    const wallBoxes = boxesOf(walls, textures.wall);
    const brickBoxes = boxesOf(walls, textures.brick);

    expect(wallBoxes).toEqual(cellBoxes(layout, isWall));
    // Le reste de la couche : des blocs cassables, jamais sur un mur.
    expect(brickBoxes.length).toBeGreaterThan(0);
    expect(wallBoxes.length + brickBoxes.length).toBe(walls.children.length);
    expect(cellBoxes(layout, (cell) => !isWall(cell))).toEqual(expect.arrayContaining(brickBoxes));
  });

  it("redessine à la nouvelle taille sans garder l'ancien dessin", () => {
    scene.resize({ width: 800, height: 600 });
    const before = layoutOf(scene);

    scene.resize({ width: 400, height: 300 });
    const after = layoutOf(scene);

    expect(after.cellSize).toBeLessThan(before.cellSize);
    expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(after));
  });

  it('dessine la plus petite grille où les joueurs tiennent', () => {
    // Les joueurs partent à une case de chaque coin : en dessous de 3 × 3, ils sont hors grille.
    scene.destroy();
    scene = new GameScene({ columns: 3, rows: 3 }, textures);

    scene.resize({ width: 800, height: 600 });

    expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(layoutOf(scene)));
  });

  it('refuse une grille invalide quand elle est affichée', () => {
    const invalid = new GameScene({ columns: 0, rows: 11 }, textures);

    expect(() => invalid.resize({ width: 800, height: 600 })).toThrow(RangeError);
    expect(invalid.layout).toBeUndefined();
    invalid.destroy();
  });

  it('met à jour la position des joueurs sur réception de network:playerMoved, et plus une fois détruite', () => {
    const bus = new EventBus<AppEvents>();
    scene.bindEventBus(bus);
    scene.resize({ width: 800, height: 600 });

    const rival = scene.players[1];
    bus.emit('network:playerMoved', { playerId: rival.id, col: 4, row: 3 });

    expect(rival.c).toBe(4);
    expect(rival.r).toBe(3);

    scene.destroy();
    bus.emit('network:playerMoved', { playerId: rival.id, col: 5, row: 6 });

    expect(rival.c).toBe(4);
    expect(rival.r).toBe(3);
  });

  it("synchronise l'état et les sprites des joueurs sur réception de network:gameState", () => {
    const bus = new EventBus<AppEvents>();
    scene.bindEventBus(bus);
    scene.resize({ width: 800, height: 600 });

    bus.emit('network:gameState', {
      type: 'GAME_STATE',
      players: [
        { playerId: 'p1', name: 'Alice', col: 2, row: 2, alive: true },
        { playerId: 'p2', name: 'Bob', col: 8, row: 8, alive: true },
      ],
    });

    expect(scene.players).toHaveLength(2);
    expect(scene.players[0]).toMatchObject({ id: 'p1', c: 2, r: 2 });
    expect(scene.players[1]).toMatchObject({ id: 'p2', c: 8, r: 8 });
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
