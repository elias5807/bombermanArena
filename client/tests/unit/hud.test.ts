// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerStateDTO } from '@shared/protocol/messages';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { GameState } from '../../src/state/GameState';
import { Hud } from '../../src/ui/hud';

/** Le pseudo qui exécuterait du code s'il passait par `innerHTML`. */
const XSS_NAME = `<img src=x onerror="document.title='XSS'">`;

/** Un HUD branché, comme dans l'application, sur un bus neuf et le `GameState` abonné avant lui. */
function setup() {
  const bus = new EventBus<AppEvents>((error) => {
    throw error;
  });
  const state = new GameState(bus);
  const list = document.createElement('div');
  document.body.replaceChildren(list);
  const hud = new Hud(list, bus, state);

  return {
    bus,
    list,
    hud,
    joinAs(playerId: string) {
      bus.emit('session:joined', { playerId });
    },
    start(...players: string[]) {
      bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players });
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
  };
}

/** Ce que montre chaque ligne : classes, avatar, nom et état. */
function describeRows(list: HTMLElement) {
  return Array.from(list.children, (row) => ({
    className: row.className,
    avatar: row.querySelector('img')?.getAttribute('src'),
    name: row.querySelector('.player-name')?.textContent,
    status: row.querySelector('.player-status')?.textContent,
  }));
}

const ALICE = { playerId: 'p1', name: 'Alice' };
const BOB = { playerId: 'p2', name: 'Bob' };
const CAROL = { playerId: 'p3', name: 'Carol' };

describe('Hud', () => {
  let game: ReturnType<typeof setup>;

  beforeEach(() => {
    game = setup();
  });

  it('est vide avant la première partie, même si le salon envoie un GAME_STATE', () => {
    expect(game.list.children).toHaveLength(0);

    game.gameState([ALICE, BOB]);

    expect(game.list.children).toHaveLength(0);
  });

  it('affiche une ligne par joueur présent, et pas plus', () => {
    game.start('p1', 'p2');
    game.gameState([ALICE, BOB]);

    expect(describeRows(game.list)).toEqual([
      {
        className: 'player-item p1',
        avatar: '/assets/sprites/joueur_1.png',
        name: 'Alice',
        status: 'En jeu',
      },
      {
        className: 'player-item p2',
        avatar: '/assets/sprites/joueur_2.png',
        name: 'Bob',
        status: 'En jeu',
      },
    ]);
  });

  it('met en évidence le joueur local', () => {
    game.joinAs('p2');
    game.start('p1', 'p2');
    game.gameState([ALICE, BOB]);

    expect(describeRows(game.list).map(({ className, name }) => ({ className, name }))).toEqual([
      { className: 'player-item p1', name: 'Alice' },
      { className: 'player-item p2 local', name: 'Bob (vous)' },
    ]);
  });

  it('grise un joueur éliminé par une explosion', () => {
    game.start('p1', 'p2', 'p3');
    game.gameState([ALICE, BOB, CAROL]);
    game.explode('p2');

    expect(describeRows(game.list)[1]).toEqual({
      className: 'player-item p2 eliminated',
      avatar: '/assets/sprites/joueur_2.png',
      name: 'Bob',
      status: 'Éliminé',
    });
    expect(describeRows(game.list).map((row) => row.status)).toEqual([
      'En jeu',
      'Éliminé',
      'En jeu',
    ]);
  });

  it('grise un joueur que le GAME_STATE dit mort', () => {
    game.start('p1', 'p2');
    game.gameState([ALICE, { ...BOB, alive: false }]);

    expect(describeRows(game.list).map((row) => row.status)).toEqual(['En jeu', 'Éliminé']);
  });

  it('retire un joueur parti, et les autres gardent leur couleur', () => {
    game.start('p1', 'p2', 'p3');
    game.gameState([ALICE, BOB, CAROL]);
    game.gameState([ALICE, CAROL]);

    expect(describeRows(game.list).map(({ className, name }) => ({ className, name }))).toEqual([
      { className: 'player-item p1', name: 'Alice' },
      { className: 'player-item p3', name: 'Carol' },
    ]);
  });

  it('redonne vie aux joueurs à la partie suivante', () => {
    game.start('p1', 'p2');
    game.gameState([ALICE, BOB]);
    game.explode('p1');
    game.start('p1', 'p2');
    game.gameState([ALICE, BOB]);

    expect(describeRows(game.list).map((row) => row.status)).toEqual(['En jeu', 'En jeu']);
  });

  it('affiche un nom contenant du HTML comme du texte', () => {
    game.start('p1');
    game.gameState([{ playerId: 'p1', name: XSS_NAME }]);

    expect(game.list.querySelector('.player-name')?.textContent).toBe(XSS_NAME);
    expect(game.list.querySelectorAll('img')).toHaveLength(1);
  });

  it('nomme un joueur dont le serveur ne donne pas le nom', () => {
    game.start('p1', 'p2');
    game.gameState([ALICE, { playerId: 'p2' }]);

    expect(describeRows(game.list)[1]?.name).toBe('Joueur 2');
  });

  it('ne suit plus le bus après dispose()', () => {
    game.start('p1', 'p2');
    game.gameState([ALICE, BOB]);
    game.hud.dispose();
    game.explode('p2');

    expect(describeRows(game.list).map((row) => row.status)).toEqual(['En jeu', 'En jeu']);
  });
});
