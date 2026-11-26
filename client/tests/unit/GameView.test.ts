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

/** Laisse s'achever le démarrage du rendu et l'affichage de la scène. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  new GameView(HOST, bus, { createRenderer, loadSprites });

  /** Le serveur lance une partie ; la scène est affichée au retour. */
  const startGame = async () => {
    bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players: ['p1', 'p2'] });
    await settle();
  };

  return { bus, renderer, createRenderer, loadSprites, startGame };
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
    it('ne démarre rien avant la première partie, même si le salon envoie un état', async () => {
      const { bus, renderer, createRenderer } = setup();

      bus.emit('server:GAME_STATE', gameState([ALICE]));
      await settle();

      expect(createRenderer).not.toHaveBeenCalled();
      expect(renderer.scenes).toHaveLength(0);
    });

    it('démarre le rendu dans son conteneur et charge les sprites à la première partie', async () => {
      const { renderer, createRenderer, loadSprites, startGame } = setup();

      await startGame();

      expect(createRenderer).toHaveBeenCalledTimes(1);
      expect(createRenderer).toHaveBeenCalledWith(HOST);
      expect(loadSprites).toHaveBeenCalledTimes(1);
      expect(renderer.scenes).toHaveLength(1);
      expect(renderer.current).toBeInstanceOf(GameScene);
    });

    it('réutilise moteur et sprites aux parties suivantes', async () => {
      const { createRenderer, loadSprites, startGame } = setup();

      await startGame();
      await startGame();

      expect(createRenderer).toHaveBeenCalledTimes(1);
      expect(loadSprites).toHaveBeenCalledTimes(1);
    });

    it('deux parties lancées pendant le démarrage ne le lancent qu’une fois', async () => {
      const { bus, renderer, createRenderer } = setup();

      bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players: [] });
      bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players: [] });
      await settle();

      expect(createRenderer).toHaveBeenCalledTimes(1);
      expect(renderer.scenes).toHaveLength(2);
    });

    it.each(['createRenderer', 'loadSprites'] as const)(
      'un échec de %s est écrit dans la console, et la partie suivante réessaie',
      async (failing) => {
        const setupResult = setup();
        const { renderer, startGame } = setupResult;
        const error = new Error('WebGL indisponible');
        setupResult[failing].mockRejectedValueOnce(error);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await startGame();
        expect(consoleError).toHaveBeenCalledWith("Impossible d'initialiser le rendu :", error);
        expect(renderer.scenes).toHaveLength(0);

        await startGame();
        expect(setupResult[failing]).toHaveBeenCalledTimes(2);
        expect(renderer.scenes).toHaveLength(1);
      },
    );
  });

  describe('une scène neuve par partie', () => {
    it('chaque GAME_STARTED remplace la scène, même partie précédente encore affichée', async () => {
      const { bus, renderer, startGame } = setup();
      await startGame();
      const previous = renderer.current;
      // Une bombe posée après la fin de partie, que le serveur efface sans message en relançant.
      bus.emit('server:BOMB_PLACED', {
        type: 'BOMB_PLACED',
        bombId: 'b1',
        playerId: 'p1',
        col: 1,
        row: 1,
      });
      expect(sceneContent(previous).effects).toBe(1);

      await startGame();

      expect(renderer.current).not.toBe(previous);
      expect(previous.view.destroyed).toBe(true);
      expect(sceneContent(renderer.current).effects).toBe(0);
    });
  });

  describe('état du serveur', () => {
    it('sans GAME_STATE, le plateau a les dimensions par défaut et reste vide', async () => {
      const { renderer, startGame } = setup();

      await startGame();

      expect(renderer.current.layout).toMatchObject(DEFAULT_GRID);
      expect(sceneContent(renderer.current).players).toBe(0);
    });

    it('la scène neuve prend les dimensions et les joueurs du dernier GAME_STATE', async () => {
      const { bus, renderer, startGame } = setup();
      bus.emit('server:GAME_STATE', gameState([ALICE], { columns: 5, rows: 5 }));
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB], { columns: 9, rows: 7 }));

      await startGame();

      expect(renderer.current.layout).toMatchObject({ columns: 9, rows: 7 });
      expect(sceneContent(renderer.current).players).toBe(2);
    });

    it('un GAME_STATE sans dimensions laisse celles par défaut', async () => {
      const { bus, renderer, startGame } = setup();
      bus.emit('server:GAME_STATE', gameState([ALICE]));

      await startGame();

      expect(renderer.current.layout).toMatchObject(DEFAULT_GRID);
      expect(sceneContent(renderer.current).players).toBe(1);
    });

    it('l’état arrivé pendant le démarrage du rendu est donné à la scène', async () => {
      const { bus, renderer, createRenderer } = setup();
      const started = deferred<FakeRenderer>();
      createRenderer.mockReturnValueOnce(started.promise);

      bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players: ['p1', 'p2'] });
      bus.emit('server:GAME_STATE', gameState([ALICE, BOB], { columns: 9, rows: 7 }));
      started.resolve(renderer);
      await settle();

      expect(renderer.current.layout).toMatchObject({ columns: 9, rows: 7 });
      expect(sceneContent(renderer.current).players).toBe(2);
    });

    it('la scène reçoit chaque GAME_STATE une seule fois, l’état gardé compris', async () => {
      const { bus, startGame } = setup();
      const applied = vi.spyOn(GameScene.prototype, 'handleGameState');
      const before = gameState([ALICE]);
      const after = gameState([ALICE, BOB]);
      bus.emit('server:GAME_STATE', before);

      await startGame();
      bus.emit('server:GAME_STATE', after);

      expect(applied.mock.calls).toEqual([[before], [after]]);
    });

    it.each(['connection:closed', 'connection:lost'] as const)(
      'oublie l’état reçu sur %s : la session suivante repart de rien',
      async (event) => {
        const { bus, renderer, startGame } = setup();
        bus.emit('server:GAME_STATE', gameState([ALICE, BOB], { columns: 9, rows: 7 }));

        bus.emit(event);
        await startGame();

        expect(renderer.current.layout).toMatchObject(DEFAULT_GRID);
        expect(sceneContent(renderer.current).players).toBe(0);
      },
    );
  });
});
