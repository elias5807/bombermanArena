import { Sprite, type Container, type Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BombExplodedMessage,
  BombPlacedMessage,
  GameStateMessage,
  PlayerStateDTO,
} from '@shared/protocol/messages';
import type { Cell, GridLayout } from '../../src/render/GridLayout';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import {
  BOMB_TICKING_DELAY_MS,
  EXPLOSION_DURATION_MS,
  GameScene,
} from '../../src/render/scenes/GameScene';
import type { SpriteTextures } from '../../src/render/sprites/loadSprites';
import { blankTextures } from '../helpers/blankTextures';

/**
 * Ces tests utilisent les vrais objets PixiJS (conteneurs, sprites, tracés) : ils n'ont pas
 * besoin de navigateur tant qu'on ne les rend pas à l'écran. Les images, elles, ne se
 * chargent que dans un navigateur : la scène reçoit ici des textures vides. L'aspect
 * (couleurs, netteté) se contrôle à l'œil avec `npm run dev`.
 */
const grid = { columns: 5, rows: 5 };

/** Carte au format de `GAME_STATE.map` : 0 sol, 1 mur, 2 brique. */
const MAP = [
  [1, 1, 1, 1, 1],
  [1, 0, 2, 0, 1],
  [1, 0, 1, 2, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
];

const ALICE: PlayerStateDTO = { playerId: 'p1', name: 'Alice', col: 1, row: 1, alive: true };
const BOB: PlayerStateDTO = { playerId: 'p2', name: 'Bob', col: 3, row: 3, alive: true };

function gameState(players: PlayerStateDTO[], map = MAP): GameStateMessage {
  return { type: 'GAME_STATE', players, grid, map };
}

function layoutOf(scene: GameScene): GridLayout {
  const { layout } = scene;
  if (!layout) {
    throw new Error("la scène n'a pas de disposition");
  }
  return layout;
}

/** Les couches de la scène, de bas en haut. */
function layersOf(scene: GameScene) {
  const [floor, walls, entities, frame] = scene.view.children;
  const [effects, players] = entities.children;
  return { floor, walls, effects, players, frame };
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

/**
 * Case « colonne,ligne » de chaque sprite de `layer` (qui porte `texture`, si elle est
 * donnée), repérée par le bas du sprite : les joueurs y ont les pieds, les bombes et les
 * explosions y sont centrées.
 */
function cellsOf(scene: GameScene, layer: Container, texture?: Texture): string[] {
  const layout = layoutOf(scene);
  return layer.children
    .filter((child): child is Sprite => child instanceof Sprite)
    .filter((sprite) => texture === undefined || sprite.texture === texture)
    .map((sprite) => {
      const cell = layout.cellAt({
        x: sprite.x + sprite.width / 2,
        y: sprite.y + sprite.height - 0.5,
      });
      return cell ? `${cell.column},${cell.row}` : 'hors grille';
    })
    .sort();
}

describe('GameScene', () => {
  let textures: SpriteTextures;
  let bus: EventBus<AppEvents>;
  let scene: GameScene;

  beforeEach(() => {
    // Les bombes et les explosions ont des minuteries : aucune ne doit tourner pour de vrai.
    vi.useFakeTimers();

    textures = blankTextures();
    // Un abonné qui échoue fait échouer le test, au lieu d'être signalé dans la console.
    bus = new EventBus<AppEvents>((error) => {
      throw error;
    });
    scene = new GameScene(grid, textures, bus);
  });

  afterEach(() => {
    scene.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('grille', () => {
    it("ne dessine rien et n'a pas de disposition avant d'être affichée", () => {
      expect(scene.layout).toBeUndefined();
      expect(scene.view.getLocalBounds()).toMatchObject({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });

    it('dessine la grille exactement là où sa disposition la place', () => {
      scene.resize({ width: 800, height: 600 });

      expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(layoutOf(scene)));
    });

    it('ne colle pas la grille aux bords de la zone', () => {
      // 200 × 200 = 5 × 5 cases de 40 px : sans marge, la grille toucherait les quatre bords.
      scene.resize({ width: 200, height: 200 });
      const layout = layoutOf(scene);

      expect(layout.originX).toBeGreaterThan(0);
      expect(layout.originY).toBeGreaterThan(0);
      expect(200 - (layout.originX + layout.width)).toBeGreaterThan(0);
      expect(200 - (layout.originY + layout.height)).toBeGreaterThan(0);
    });

    it('pose un sprite de sol sur chaque case, à sa place et à sa taille, dans un cadre', () => {
      scene.resize({ width: 800, height: 600 });

      const layout = layoutOf(scene);
      const { floor, frame } = layersOf(scene);

      expect(floor.children).toHaveLength(grid.columns * grid.rows);
      expect(boxesOf(floor, textures.floor)).toEqual(cellBoxes(layout));
      expect(frame.getLocalBounds()).toMatchObject(gridBounds(layout));
    });

    it("tant qu'aucun GAME_STATE n'est arrivé, la grille est vide : ni mur, ni brique, ni joueur", () => {
      scene.resize({ width: 800, height: 600 });

      const { walls, effects, players } = layersOf(scene);
      expect(walls.children).toHaveLength(0);
      expect(effects.children).toHaveLength(0);
      expect(players.children).toHaveLength(0);
    });

    it('refuse une grille invalide quand elle est affichée', () => {
      const invalid = new GameScene({ columns: 0, rows: 11 }, textures, bus);

      expect(() => invalid.resize({ width: 800, height: 600 })).toThrow(RangeError);
      expect(invalid.layout).toBeUndefined();
      invalid.destroy();
    });
  });

  describe('server:GAME_STATE', () => {
    it('dessine les murs et les briques de la carte reçue, par-dessus le sol', () => {
      scene.resize({ width: 800, height: 600 });

      bus.emit('server:GAME_STATE', gameState([]));

      const layout = layoutOf(scene);
      const { walls } = layersOf(scene);
      const cellIs = (value: number) => (cell: Cell) => MAP[cell.row][cell.column] === value;
      expect(boxesOf(walls, textures.wall)).toEqual(cellBoxes(layout, cellIs(1)));
      expect(boxesOf(walls, textures.brick)).toEqual(cellBoxes(layout, cellIs(2)));
      expect(walls.children).toHaveLength(cellBoxes(layout, (cell) => !cellIs(0)(cell)).length);
    });

    it('place chaque joueur vivant sur sa case', () => {
      scene.resize({ width: 800, height: 600 });

      bus.emit(
        'server:GAME_STATE',
        gameState([ALICE, BOB, { ...BOB, playerId: 'p3', alive: false }]),
      );

      const { players } = layersOf(scene);
      expect(cellsOf(scene, players)).toEqual(['1,1', '3,3']);
    });

    it("garde l'état reçu avant d'être affichée, et le dessine à son affichage", () => {
      bus.emit('server:GAME_STATE', gameState([ALICE]));

      scene.resize({ width: 800, height: 600 });

      const { walls, players } = layersOf(scene);
      expect(walls.children.length).toBeGreaterThan(0);
      expect(cellsOf(scene, players)).toEqual(['1,1']);
    });

    it('applique chaque GAME_STATE une seule fois, et plus aucun une fois détruite', () => {
      const applied = vi.spyOn(GameScene.prototype, 'handleGameState');
      const listening = new GameScene(grid, textures, bus);

      bus.emit('server:GAME_STATE', gameState([ALICE]));
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB]));
      listening.destroy();
      bus.emit('server:GAME_STATE', gameState([BOB]));

      // `scene`, créée avant l'espion, appelle la méthode d'origine : seule `listening` compte.
      expect(applied.mock.contexts.filter((context) => context === listening)).toHaveLength(2);
    });

    it('retire de l’écran les joueurs absents du message', () => {
      scene.resize({ width: 800, height: 600 });
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB]));
      const [, bobSprite] = layersOf(scene).players.children;

      bus.emit('server:GAME_STATE', gameState([ALICE]));

      const { players } = layersOf(scene);
      expect(cellsOf(scene, players)).toEqual(['1,1']);
      expect(bobSprite.destroyed).toBe(true);
    });

    it('garde le sprite et la couleur d’un joueur d’un état à l’autre', () => {
      scene.resize({ width: 800, height: 600 });
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB]));
      const [, bobSprite] = layersOf(scene).players.children;

      // Alice est partie : Bob devient le premier de la liste, mais reste le joueur 2.
      bus.emit('server:GAME_STATE', gameState([{ ...BOB, col: 1, row: 3 }]));

      const { players } = layersOf(scene);
      expect(players.children).toEqual([bobSprite]);
      expect((bobSprite as Sprite).texture).toBe(textures.player2);
      expect(cellsOf(scene, players)).toEqual(['1,3']);
    });

    it("redessine joueurs et carte à la nouvelle taille sans garder l'ancien dessin", () => {
      scene.resize({ width: 800, height: 600 });
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB]));
      const before = layoutOf(scene);

      scene.resize({ width: 400, height: 300 });
      const after = layoutOf(scene);

      const { floor, walls, players } = layersOf(scene);
      expect(after.cellSize).toBeLessThan(before.cellSize);
      expect(scene.view.getLocalBounds()).toMatchObject(gridBounds(after));
      expect(floor.children).toHaveLength(grid.columns * grid.rows);
      expect(boxesOf(walls, textures.wall)).toEqual(
        cellBoxes(after, (cell) => MAP[cell.row][cell.column] === 1),
      );
      expect(cellsOf(scene, players)).toEqual(['1,1', '3,3']);
    });
  });

  describe('server:POSITION_UPDATED', () => {
    beforeEach(() => {
      scene.resize({ width: 800, height: 600 });
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB]));
    });

    it('déplace le sprite du joueur sur la case validée par le serveur', () => {
      bus.emit('server:POSITION_UPDATED', {
        type: 'POSITION_UPDATED',
        playerId: 'p2',
        col: 3,
        row: 2,
        direction: 'up',
      });

      expect(cellsOf(scene, layersOf(scene).players)).toEqual(['1,1', '3,2']);
    });

    it("ignore un joueur que le dernier GAME_STATE n'a pas annoncé", () => {
      bus.emit('server:POSITION_UPDATED', {
        type: 'POSITION_UPDATED',
        playerId: 'inconnu',
        col: 2,
        row: 3,
      });

      expect(cellsOf(scene, layersOf(scene).players)).toEqual(['1,1', '3,3']);
    });
  });

  describe('bombes et explosions', () => {
    const bombPlaced: BombPlacedMessage = {
      type: 'BOMB_PLACED',
      bombId: 'b1',
      playerId: 'p1',
      col: 1,
      row: 1,
    };
    const bombExploded: BombExplodedMessage = {
      type: 'BOMB_EXPLODED',
      bombId: 'b1',
      col: 1,
      row: 1,
      affectedCells: [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 1 },
      ],
      destroyedBricks: [{ col: 2, row: 1 }],
      eliminatedPlayers: [],
    };

    beforeEach(() => {
      scene.resize({ width: 800, height: 600 });
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB]));
    });

    it('affiche la bombe, puis la fait clignoter, puis affiche le souffle et l’efface', () => {
      const effects = () => layersOf(scene).effects;

      bus.emit('server:BOMB_PLACED', bombPlaced);
      expect(cellsOf(scene, effects(), textures.bomb)).toEqual(['1,1']);

      vi.advanceTimersByTime(BOMB_TICKING_DELAY_MS - 1);
      expect(cellsOf(scene, effects(), textures.bomb_ticking)).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(cellsOf(scene, effects(), textures.bomb)).toEqual([]);
      expect(cellsOf(scene, effects(), textures.bomb_ticking)).toEqual(['1,1']);

      bus.emit('server:BOMB_EXPLODED', bombExploded);
      expect(
        effects().children.every((child) => (child as Sprite).texture === textures.explosion),
      ).toBe(true);
      expect(cellsOf(scene, effects())).toEqual(['1,1', '1,2', '1,3', '2,1']);

      vi.advanceTimersByTime(EXPLOSION_DURATION_MS);
      expect(effects().children).toHaveLength(0);
    });

    it("ne pose qu'une bombe par bombId, et n'efface que celle qui explose", () => {
      bus.emit('server:BOMB_PLACED', bombPlaced);
      bus.emit('server:BOMB_PLACED', bombPlaced);
      bus.emit('server:BOMB_PLACED', {
        ...bombPlaced,
        bombId: 'b2',
        playerId: 'p2',
        col: 3,
        row: 3,
      });
      expect(cellsOf(scene, layersOf(scene).effects, textures.bomb)).toEqual(['1,1', '3,3']);

      bus.emit('server:BOMB_EXPLODED', bombExploded);

      expect(cellsOf(scene, layersOf(scene).effects, textures.bomb)).toEqual(['3,3']);
    });

    it('une bombe qui explose avant de clignoter ne réapparaît pas', () => {
      bus.emit('server:BOMB_PLACED', bombPlaced);
      bus.emit('server:BOMB_EXPLODED', bombExploded);

      vi.runAllTimers();

      expect(layersOf(scene).effects.children).toHaveLength(0);
    });

    it('retire les briques détruites, et seulement elles', () => {
      const bricks = () => cellsOf(scene, layersOf(scene).walls, textures.brick);
      expect(bricks()).toEqual(['2,1', '3,2']);

      bus.emit('server:BOMB_EXPLODED', bombExploded);

      expect(bricks()).toEqual(['3,2']);
    });

    it('retire le joueur éliminé ; le survivant reste affiché et bouge encore', () => {
      const { players } = layersOf(scene);
      const [aliceSprite] = players.children;

      bus.emit('server:BOMB_EXPLODED', { ...bombExploded, eliminatedPlayers: ['p1'] });
      expect(aliceSprite.destroyed).toBe(true);
      expect(cellsOf(scene, players)).toEqual(['3,3']);

      bus.emit('server:POSITION_UPDATED', {
        type: 'POSITION_UPDATED',
        playerId: 'p2',
        col: 2,
        row: 3,
      });
      expect(cellsOf(scene, players)).toEqual(['2,3']);

      // Le déplacement d'un joueur éliminé ne le fait pas réapparaître.
      bus.emit('server:POSITION_UPDATED', {
        type: 'POSITION_UPDATED',
        playerId: 'p1',
        col: 1,
        row: 2,
      });
      expect(cellsOf(scene, players)).toEqual(['2,3']);
    });

    it('destroy() annule les minuteries en cours : bombe qui clignote et souffle à effacer', () => {
      bus.emit('server:BOMB_PLACED', { ...bombPlaced, bombId: 'b2', col: 3, row: 3 });
      bus.emit('server:BOMB_EXPLODED', bombExploded);
      expect(vi.getTimerCount()).toBe(2);

      scene.destroy();

      expect(vi.getTimerCount()).toBe(0);
      expect(() => vi.runAllTimers()).not.toThrow();
    });
  });

  it('libère sa vue et ce qu’elle dessine quand elle est détruite, même deux fois', () => {
    scene.resize({ width: 800, height: 600 });
    bus.emit('server:GAME_STATE', gameState([ALICE]));
    const { floor, players } = layersOf(scene);
    const [aliceSprite] = players.children;

    scene.destroy();

    expect(scene.view.destroyed).toBe(true);
    expect(floor.destroyed).toBe(true);
    expect(aliceSprite.destroyed).toBe(true);
    expect(() => scene.destroy()).not.toThrow();
    expect(() => bus.emit('server:GAME_STATE', gameState([ALICE, BOB]))).not.toThrow();
  });
});
