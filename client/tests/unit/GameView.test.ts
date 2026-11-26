import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameStateMessage, PlayerStateDTO } from '@shared/protocol/messages';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { DEFAULT_GRID, GameView } from '../../src/render/GameView';
import type { GridSize } from '../../src/render/GridLayout';
import { GameScene } from '../../src/render/scenes/GameScene';
import type { SpriteTextures } from '../../src/render/sprites/loadSprites';
import { blankTextures } from '../helpers/blankTextures';
import { FakeRenderer, sceneContent } from '../helpers/FakeRenderer';

/** Le conteneur du plateau : seul le faux moteur le reçoit, il ne s'en sert pas. */
const HOST = {} as HTMLElement;

const ALICE: PlayerStateDTO = { playerId: 'p1', name: 'Alice', col: 1, row: 1, alive: true };
const BOB: PlayerStateDTO = { playerId: 'p2', name: 'Bob', col: 3, row: 3, alive: true };

function gameState(players: PlayerStateDTO[], grid?: GridSize): GameStateMessage {
  return { type: 'GAME_STATE', players, grid };
}

/** Un plateau branché sur un bus neuf, avec un faux moteur de rendu et des textures vides. */
function setup() {
  const bus = new EventBus<AppEvents>((error) => {
    throw error;
  });
  const renderer = new FakeRenderer();
  const createRenderer = vi.fn<(host: HTMLElement) => Promise<FakeRenderer>>(() =>
    Promise.resolve(renderer),
  );
  const loadSprites = vi.fn<() => Promise<SpriteTextures>>(() => Promise.resolve(blankTextures()));
  const board = new GameView(HOST, bus, { createRenderer, loadSprites });

  return { bus, renderer, createRenderer, loadSprites, board };
}

/** Une promesse que le test tient quand il le décide. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

describe('GameView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('moteur de rendu', () => {
    it('démarre le rendu dans son conteneur et charge les sprites à la première partie', async () => {
      const { renderer, createRenderer, loadSprites, board } = setup();

      expect(createRenderer).not.toHaveBeenCalled();
      await board.showNewGame();

      expect(createRenderer).toHaveBeenCalledTimes(1);
      expect(createRenderer).toHaveBeenCalledWith(HOST);
      expect(loadSprites).toHaveBeenCalledTimes(1);
      expect(renderer.scenes).toHaveLength(1);
      expect(renderer.current).toBeInstanceOf(GameScene);
    });

    it('réutilise moteur et sprites : chaque partie a sa scène neuve', async () => {
      const { renderer, createRenderer, loadSprites, board } = setup();

      await board.showNewGame();
      await board.showNewGame();

      expect(createRenderer).toHaveBeenCalledTimes(1);
      expect(loadSprites).toHaveBeenCalledTimes(1);
      const [first, second] = renderer.scenes;
      expect(second).not.toBe(first);
    });

    it('deux parties demandées pendant le démarrage ne le lancent qu’une fois', async () => {
      const { renderer, createRenderer, board } = setup();

      await Promise.all([board.showNewGame(), board.showNewGame()]);

      expect(createRenderer).toHaveBeenCalledTimes(1);
      expect(renderer.scenes).toHaveLength(2);
    });

    it.each(['createRenderer', 'loadSprites'] as const)(
      'un échec de %s est écrit dans la console, et la partie suivante réessaie',
      async (failing) => {
        const setupResult = setup();
        const { renderer, board } = setupResult;
        const error = new Error('WebGL indisponible');
        setupResult[failing].mockRejectedValueOnce(error);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(board.showNewGame()).resolves.toBeUndefined();
        expect(consoleError).toHaveBeenCalledWith("Impossible d'initialiser le rendu :", error);
        expect(renderer.scenes).toHaveLength(0);

        await board.showNewGame();
        expect(setupResult[failing]).toHaveBeenCalledTimes(2);
        expect(renderer.scenes).toHaveLength(1);
      },
    );
  });

  describe('état du serveur', () => {
    it('sans GAME_STATE, le plateau a les dimensions par défaut et reste vide', async () => {
      const { renderer, board } = setup();

      await board.showNewGame();

      expect(renderer.current.layout).toMatchObject(DEFAULT_GRID);
      expect(sceneContent(renderer.current).players).toBe(0);
    });

    it('la scène neuve prend les dimensions et les joueurs du dernier GAME_STATE', async () => {
      const { bus, renderer, board } = setup();
      bus.emit('server:GAME_STATE', gameState([ALICE], { columns: 5, rows: 5 }));
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB], { columns: 9, rows: 7 }));

      await board.showNewGame();

      expect(renderer.current.layout).toMatchObject({ columns: 9, rows: 7 });
      expect(sceneContent(renderer.current).players).toBe(2);
    });

    it('un GAME_STATE sans dimensions laisse celles par défaut', async () => {
      const { bus, renderer, board } = setup();
      bus.emit('server:GAME_STATE', gameState([ALICE]));

      await board.showNewGame();

      expect(renderer.current.layout).toMatchObject(DEFAULT_GRID);
      expect(sceneContent(renderer.current).players).toBe(1);
    });

    it('l’état arrivé pendant le démarrage du rendu est donné à la scène', async () => {
      const { bus, renderer, createRenderer, board } = setup();
      const started = deferred<FakeRenderer>();
      createRenderer.mockReturnValueOnce(started.promise);

      const shown = board.showNewGame();
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB], { columns: 9, rows: 7 }));
      started.resolve(renderer);
      await shown;

      expect(renderer.current.layout).toMatchObject({ columns: 9, rows: 7 });
      expect(sceneContent(renderer.current).players).toBe(2);
    });

    it('la scène reçoit chaque GAME_STATE une seule fois, l’état gardé compris', async () => {
      const { bus, board } = setup();
      const applied = vi.spyOn(GameScene.prototype, 'handleGameState');
      const before = gameState([ALICE]);
      const after = gameState([ALICE, BOB]);
      bus.emit('server:GAME_STATE', before);

      await board.showNewGame();
      bus.emit('server:GAME_STATE', after);

      expect(applied.mock.calls).toEqual([[before], [after]]);
    });

    it('reset() oublie l’état de la session terminée', async () => {
      const { bus, renderer, board } = setup();
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB], { columns: 9, rows: 7 }));

      board.reset();
      await board.showNewGame();

      expect(renderer.current.layout).toMatchObject(DEFAULT_GRID);
      expect(sceneContent(renderer.current).players).toBe(0);
    });
  });
});
