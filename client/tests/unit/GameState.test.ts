import { describe, expect, it } from 'vitest';
import type { PlayerStateDTO } from '@shared/protocol/messages';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { GameState } from '../../src/state/GameState';

type GameOver = AppEvents['state:gameOver'];

/** Un état branché sur un bus neuf, et la liste des fins de partie qu'il publie. */
function setup() {
  // Un abonné qui échoue fait échouer le test, au lieu d'être signalé dans la console.
  const bus = new EventBus<AppEvents>((error) => {
    throw error;
  });
  const state = new GameState(bus);
  const gameOvers: GameOver[] = [];
  bus.on('state:gameOver', (result) => gameOvers.push(result));

  return {
    bus,
    state,
    gameOvers,
    joinAs(playerId: string) {
      bus.emit('session:joined', { playerId });
    },
    start(...players: string[]) {
      bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players });
    },
    explode(...eliminatedPlayers: string[]) {
      bus.emit('server:BOMB_EXPLODED', {
        type: 'BOMB_EXPLODED',
        bombId: 'b1',
        col: 1,
        row: 1,
        affectedCells: [{ col: 1, row: 1 }],
        eliminatedPlayers,
      });
    },
    gameState(players: Partial<PlayerStateDTO>[]) {
      bus.emit('server:GAME_STATE', {
        type: 'GAME_STATE',
        players: players.map((player) => ({
          playerId: 'p?',
          col: 1,
          row: 1,
          alive: true,
          ...player,
        })),
      });
    },
  };
}

describe('GameState', () => {
  describe('fin de partie', () => {
    it('victoire : le joueur local est le dernier en vie', () => {
      const { gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      start('p1', 'p2');

      explode('p2');

      expect(gameOvers).toEqual([{ winnerId: 'p1', outcome: 'victory' }]);
    });

    it('défaite : le joueur local est éliminé, un autre survit', () => {
      const { gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      start('p1', 'p2');

      explode('p1');

      expect(gameOvers).toEqual([{ winnerId: 'p2', outcome: 'defeat' }]);
    });

    it('défaite : le joueur local, éliminé plus tôt, apprend la fin quand un autre gagne', () => {
      const { gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      start('p1', 'p2', 'p3');

      explode('p1');
      expect(gameOvers).toEqual([]);

      explode('p3');
      expect(gameOvers).toEqual([{ winnerId: 'p2', outcome: 'defeat' }]);
    });

    it('égalité : les derniers joueurs sont éliminés par la même explosion', () => {
      const { gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      start('p1', 'p2', 'p3');
      explode('p3');

      explode('p1', 'p2');

      expect(gameOvers).toEqual([{ winnerId: null, outcome: 'draw' }]);
    });

    it("rien tant qu'il reste au moins deux joueurs en vie", () => {
      const { gameOvers, joinAs, start, explode, gameState } = setup();
      joinAs('p1');
      start('p1', 'p2', 'p3', 'p4');

      explode('p4');
      explode('p3', 'unknown');
      gameState([{ playerId: 'p1' }, { playerId: 'p2' }, { playerId: 'p3', alive: false }]);

      expect(gameOvers).toEqual([]);
    });

    it('victoire : le dernier adversaire quitte la partie (absent du GAME_STATE)', () => {
      const { gameOvers, joinAs, start, gameState } = setup();
      joinAs('p1');
      start('p1', 'p2');
      gameState([{ playerId: 'p1' }, { playerId: 'p2' }]);

      gameState([{ playerId: 'p1' }]);

      expect(gameOvers).toEqual([{ winnerId: 'p1', outcome: 'victory' }]);
    });

    it('défaite : un départ laisse en vie un seul autre joueur', () => {
      const { gameOvers, joinAs, start, explode, gameState } = setup();
      joinAs('p1');
      start('p1', 'p2', 'p3');
      explode('p1');

      gameState([{ playerId: 'p1', alive: false }, { playerId: 'p2' }]);

      expect(gameOvers).toEqual([{ winnerId: 'p2', outcome: 'defeat' }]);
    });

    it('suit le champ alive du GAME_STATE, qui fait foi', () => {
      const { gameOvers, joinAs, start, gameState } = setup();
      joinAs('p1');
      start('p1', 'p2');

      gameState([{ playerId: 'p1' }, { playerId: 'p2', alive: false }]);

      expect(gameOvers).toEqual([{ winnerId: 'p1', outcome: 'victory' }]);
    });

    it('ignore une explosion sans liste de joueurs éliminés', () => {
      const { bus, gameOvers, start } = setup();
      start('p1', 'p2');

      bus.emit('server:BOMB_EXPLODED', {
        type: 'BOMB_EXPLODED',
        bombId: 'b1',
        col: 1,
        row: 1,
        affectedCells: [],
      });

      expect(gameOvers).toEqual([]);
    });
  });

  describe('une seule fin par partie', () => {
    it('ne publie rien avant GAME_STARTED', () => {
      const { gameOvers, joinAs, explode, gameState } = setup();
      joinAs('p1');

      // Le serveur envoie l'état du jeu au nouveau venu, seul dans la salle d'attente.
      gameState([{ playerId: 'p1' }]);
      gameState([{ playerId: 'p1', alive: false }]);
      explode('p1');

      expect(gameOvers).toEqual([]);
    });

    it("ne publie qu'une fois, même si d'autres messages suivent la fin", () => {
      const { gameOvers, joinAs, start, explode, gameState } = setup();
      joinAs('p1');
      start('p1', 'p2', 'p3');
      explode('p2', 'p3');

      explode('p1');
      gameState([{ playerId: 'p1', alive: false }]);
      gameState([]);

      expect(gameOvers).toEqual([{ winnerId: 'p1', outcome: 'victory' }]);
    });

    it('un nouveau GAME_STARTED remet tout à zéro : la partie suivante a sa propre fin', () => {
      const { state, gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      start('p1', 'p2');
      explode('p1');

      start('p1', 'p2');
      expect(state.players).toEqual([
        { playerId: 'p1', alive: true },
        { playerId: 'p2', alive: true },
      ]);
      expect(state.isLocalPlayerAlive).toBe(true);

      explode('p2');
      expect(gameOvers).toEqual([
        { winnerId: 'p2', outcome: 'defeat' },
        { winnerId: 'p1', outcome: 'victory' },
      ]);
    });

    it('oublie les joueurs de la partie précédente qui ne sont pas dans la nouvelle', () => {
      const { state, gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      start('p1', 'p2', 'p3');
      explode('p2', 'p3');

      start('p1', 'p3');
      explode('p3');

      expect(state.players).toEqual([
        { playerId: 'p1', alive: true },
        { playerId: 'p3', alive: false },
      ]);
      expect(gameOvers).toEqual([
        { winnerId: 'p1', outcome: 'victory' },
        { winnerId: 'p1', outcome: 'victory' },
      ]);
    });

    it('une partie lancée seul ne se termine qu’à la mort de son unique joueur', () => {
      const { gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');

      start('p1');
      expect(gameOvers).toEqual([]);

      explode('p1');
      expect(gameOvers).toEqual([{ winnerId: null, outcome: 'draw' }]);
    });
  });

  describe('joueur local', () => {
    it('id local inconnu : le survivant gagne, jamais « victoire »', () => {
      const { state, gameOvers, start, explode } = setup();
      start('p1', 'p2');

      explode('p2');

      expect(state.localPlayerId).toBeNull();
      expect(gameOvers).toEqual([{ winnerId: 'p1', outcome: 'defeat' }]);
    });

    it('retient le dernier identifiant annoncé par session:joined', () => {
      const { state, gameOvers, joinAs, start, explode } = setup();
      joinAs('p1');
      joinAs('p2');
      start('p1', 'p2');

      explode('p1');

      expect(state.localPlayerId).toBe('p2');
      expect(gameOvers).toEqual([{ winnerId: 'p2', outcome: 'victory' }]);
    });

    it('isLocalPlayerAlive : faux hors partie, vrai en jeu, faux une fois éliminé', () => {
      const { state, joinAs, start, explode } = setup();
      expect(state.isLocalPlayerAlive).toBe(false);
      joinAs('p1');
      expect(state.isLocalPlayerAlive).toBe(false);

      start('p1', 'p2', 'p3');
      expect(state.isLocalPlayerAlive).toBe(true);

      explode('p1');
      expect(state.isLocalPlayerAlive).toBe(false);
    });

    it("isLocalPlayerAlive est faux quand le joueur local n'est pas dans la partie", () => {
      const { state, joinAs, start } = setup();
      joinAs('p9');

      start('p1', 'p2');

      expect(state.isLocalPlayerAlive).toBe(false);
    });
  });

  describe('joueurs', () => {
    it('donne les joueurs du GAME_STATE, avec leur nom, dans son ordre', () => {
      const { state, start, gameState } = setup();
      start('p1', 'p2');

      gameState([
        { playerId: 'p2', name: 'Bob' },
        { playerId: 'p1', name: 'Alice', alive: false },
      ]);

      expect(state.players).toEqual([
        { playerId: 'p2', name: 'Bob', alive: true },
        { playerId: 'p1', name: 'Alice', alive: false },
      ]);
    });

    it("garde le nom connu d'un joueur quand un GAME_STATE ne le redonne pas", () => {
      const { state, start, gameState, explode } = setup();
      start('p1', 'p2', 'p3');
      gameState([
        { playerId: 'p1', name: 'Alice' },
        { playerId: 'p2', name: 'Bob' },
        { playerId: 'p3', name: 'Chloé' },
      ]);
      explode('p2');

      gameState([{ playerId: 'p1' }, { playerId: 'p2', alive: false }]);

      expect(state.players).toEqual([
        { playerId: 'p1', name: 'Alice', alive: true },
        { playerId: 'p2', name: 'Bob', alive: false },
      ]);
    });

    it("n'ajoute pas un joueur inconnu éliminé par une explosion", () => {
      const { state, start, explode } = setup();
      start('p1', 'p2');

      explode('p9');

      expect(state.players.map(({ playerId }) => playerId)).toEqual(['p1', 'p2']);
    });
  });
});
