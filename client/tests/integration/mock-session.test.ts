import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateMessage, ServerMessage } from '@shared/protocol/messages';
import { gameSessionScenario } from '../../src/mocks/fixtures/game-session.fixture';
import { lobbyScenario } from '../../src/mocks/fixtures/lobby.fixture';
import type { LobbyPlayer } from '../../src/mocks/lobbySteps';
import type { IGameConnection } from '../../src/network/IGameConnection';
import {
  MockServerAdapter,
  type JoinScenario,
  type Scenario,
  type ScenarioStep,
} from '../../src/network/MockServerAdapter';

/**
 * Règles du serveur (`server/src/game/GameEngine.ts` et `grid.ts`) que les
 * scénarios doivent suivre, réécrites ici sans lire le code du mock.
 */
const MIN_PLAYERS = 2; // sujet du projet : de 2 à 4 joueurs
const MAX_PLAYERS = 4;
const BOMB_DELAY_MS = 2500;
const BOMB_RANGE = 2;
const FLOOR = 0;
const WALL = 1;
const BRICK = 2;

/** Nom sous lequel le joueur local rejoint le salon dans les scénarios qui l'attendent. */
const LOCAL_NAME = 'Louka';

/** Chaque message serveur du protocole partagé : le compilateur signale un oubli. */
const SERVER_MESSAGE_TYPES = Object.keys({
  PLAYER_JOINED: true,
  LOBBY_STATUS: true,
  GAME_STARTED: true,
  GAME_STATE: true,
  POSITION_UPDATED: true,
  BOMB_PLACED: true,
  BOMB_EXPLODED: true,
} satisfies Record<ServerMessage['type'], true>);

type Cell = { col: number; row: number };

/** Un message reçu et l'heure (simulée) de sa réception. */
interface Received {
  at: number;
  message: ServerMessage;
}

function isJoinScenario(scenario: Scenario | JoinScenario): scenario is JoinScenario {
  return 'stepsFor' in scenario;
}

function stepsOf(scenario: Scenario | JoinScenario): readonly ScenarioStep[] {
  return isJoinScenario(scenario) ? scenario.stepsFor(LOCAL_NAME) : scenario.steps;
}

/**
 * Rejoue `scenario` en entier à travers l'interface commune, comme le fera le reste du
 * client, en rejoignant le salon si le scénario l'attend.
 */
async function replay(scenario: Scenario | JoinScenario): Promise<Received[]> {
  const connection: IGameConnection = new MockServerAdapter(scenario);
  const received: Received[] = [];
  connection.onMessage((message) => received.push({ at: Date.now(), message }));

  await connection.connect();
  if (isJoinScenario(scenario)) {
    connection.send({ type: 'JOIN_LOBBY', playerName: LOCAL_NAME });
  }
  await vi.runAllTimersAsync();
  connection.disconnect();

  return received;
}

/** Dimensions du plateau annoncées par le premier `GAME_STATE` du scénario. */
function gridOf(received: readonly Received[]): { columns: number; rows: number } {
  const state = received.find(({ message }) => message.type === 'GAME_STATE')?.message as
    GameStateMessage | undefined;
  return state?.grid ?? { columns: 15, rows: 13 };
}

const sortedCells = (cells: readonly Cell[]) => cells.map(({ col, row }) => `${col},${row}`).sort();

/** Cases de départ du serveur, dans l'ordre d'arrivée. */
function spawnPoints({ columns, rows }: { columns: number; rows: number }): Cell[] {
  return [
    { col: 1, row: 1 },
    { col: columns - 2, row: 1 },
    { col: 1, row: rows - 2 },
    { col: columns - 2, row: rows - 2 },
  ];
}

/** Vérifie que `map` a la forme d'un plateau produit par le serveur (`generateGrid`). */
function expectServerMap(map: number[][], { columns, rows }: { columns: number; rows: number }) {
  expect(map).toHaveLength(rows);
  map.forEach((line, row) => {
    expect(line).toHaveLength(columns);
    line.forEach((value, col) => {
      const where = `case (${col}, ${row})`;
      const border = row === 0 || col === 0 || row === rows - 1 || col === columns - 1;
      const pillar = row % 2 === 0 && col % 2 === 0;
      const spawnZone = (row < 3 || row >= rows - 3) && (col < 3 || col >= columns - 3);
      if (border || pillar) {
        expect(value, `${where} : mur attendu`).toBe(WALL);
      } else if (spawnZone) {
        expect(value, `${where} : coin de départ, à laisser dégagé`).toBe(FLOOR);
      } else {
        expect([FLOOR, BRICK], `${where} : sol ou brique attendu`).toContain(value);
      }
    });
  });
}

/**
 * Cases touchées par une bombe en `origin`, et briques détruites : la case de la
 * bombe, puis `BOMB_RANGE` cases dans chaque direction, arrêtées par un mur ; une
 * brique est touchée, détruite, et arrête le souffle.
 */
function blast(map: number[][], origin: Cell): { affected: Cell[]; bricks: Cell[] } {
  const affected = [origin];
  const bricks: Cell[] = [];
  for (const [dCol, dRow] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let step = 1; step <= BOMB_RANGE; step++) {
      const cell = { col: origin.col + dCol * step, row: origin.row + dRow * step };
      const value = map[cell.row]?.[cell.col];
      if (value === undefined || value === WALL) {
        break;
      }
      affected.push(cell);
      if (value === BRICK) {
        bricks.push(cell);
        break;
      }
    }
  }
  return { affected, bricks };
}

const STEP: Record<string, Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

/**
 * Vérifie que `received` suit les règles du serveur, en tenant à jour sa propre
 * vision de la partie : salon, positions, plateau, bombes. Un scénario étendu plus
 * tard ne peut donc pas devenir incohérent sans que ce test le signale.
 */
function expectServerRules(received: readonly Received[]): void {
  const spawns = spawnPoints(gridOf(received));
  let lobby: LobbyPlayer[] = [];
  let localId: string | undefined;
  let started: string[] | undefined;
  let statusExpected = false;
  /** Pourquoi un `GAME_STATE` doit arriver maintenant, s'il doit arriver. */
  let stateExpected: 'arrivée du joueur local' | 'départ' | 'lancement' | undefined;
  let map: number[][] | undefined;
  const players = new Map<string, Cell & { alive: boolean }>();
  const bombs = new Map<string, Cell & { placedAt: number }>();

  const bombAt = (cell: Cell) =>
    [...bombs.values()].some(({ col, row }) => col === cell.col && row === cell.row);

  for (const { at, message } of received) {
    if (statusExpected) {
      expect(message.type, 'PLAYER_JOINED doit être suivi de LOBBY_STATUS').toBe('LOBBY_STATUS');
    } else if (stateExpected) {
      expect(message.type, `GAME_STATE attendu (${stateExpected})`).toBe('GAME_STATE');
    }

    switch (message.type) {
      case 'PLAYER_JOINED': {
        expect(started, 'personne ne rejoint une partie déjà lancée').toBeUndefined();
        expect(lobby.length, 'le lobby est plein').toBeLessThan(MAX_PLAYERS);
        localId ??= message.playerId;
        players.set(message.playerId, { ...spawns[lobby.length], alive: true });
        lobby = [...lobby, { playerId: message.playerId, playerName: message.playerName }];
        statusExpected = true;
        break;
      }

      case 'LOBBY_STATUS': {
        if (statusExpected) {
          expect(message.players, 'LOBBY_STATUS liste tous les joueurs présents').toEqual(lobby);
          if (lobby.length === 1 && lobby[0].playerId === localId) {
            stateExpected = 'arrivée du joueur local';
          }
        } else {
          // Un départ : le serveur renvoie la liste sans le joueur parti, puis l'état du jeu.
          expect(message.players).toHaveLength(lobby.length - 1);
          expect(lobby).toEqual(expect.arrayContaining(message.players));
          for (const { playerId } of lobby) {
            if (!message.players.some((player) => player.playerId === playerId)) {
              players.delete(playerId);
            }
          }
          stateExpected = 'départ';
        }
        lobby = message.players;
        statusExpected = false;
        break;
      }

      case 'GAME_STATE': {
        expect(stateExpected, 'GAME_STATE inattendu').toBeDefined();
        if (message.map && message.grid) {
          expectServerMap(message.map, message.grid);
          map = message.map.map((line) => [...line]);
        }
        expect(message.players, 'GAME_STATE décrit les joueurs présents, à leur place').toEqual(
          lobby.map(({ playerId, playerName }) => ({
            playerId,
            name: playerName,
            ...players.get(playerId),
            score: 0,
          })),
        );
        stateExpected = undefined;
        break;
      }

      case 'GAME_STARTED': {
        expect(lobby.length, 'trop peu de joueurs pour lancer la partie').toBeGreaterThanOrEqual(
          MIN_PLAYERS,
        );
        expect(message.players, 'GAME_STARTED liste les joueurs du lobby').toEqual(
          lobby.map(({ playerId }) => playerId),
        );
        // Au lancement, le serveur replace chacun sur sa case de départ.
        lobby.forEach(({ playerId }, index) => {
          players.set(playerId, { ...spawns[index], alive: true });
        });
        started = message.players;
        stateExpected = 'lancement';
        break;
      }

      case 'POSITION_UPDATED': {
        const player = players.get(message.playerId);
        expect(started, 'un déplacement avant le début de la partie').toBeDefined();
        expect(player?.alive, `${message.playerId} bouge sans être en jeu`).toBe(true);
        const step = STEP[message.direction ?? ''];
        const target = { col: message.col, row: message.row };
        expect(target, `${message.playerId} doit avancer d'une case`).toEqual({
          col: player!.col + step.col,
          row: player!.row + step.row,
        });
        expect(map?.[target.row]?.[target.col], `${message.playerId} entre dans un mur`).toBe(
          FLOOR,
        );
        expect(bombAt(target), `${message.playerId} traverse une bombe`).toBe(false);
        players.set(message.playerId, { ...target, alive: true });
        break;
      }

      case 'BOMB_PLACED': {
        const player = players.get(message.playerId);
        expect(started, 'une bombe avant le début de la partie').toBeDefined();
        expect(player?.alive, `${message.playerId} pose une bombe sans être en jeu`).toBe(true);
        expect({ col: message.col, row: message.row }, 'une bombe se pose sur sa case').toEqual({
          col: player!.col,
          row: player!.row,
        });
        expect(bombAt(message), 'deux bombes sur la même case').toBe(false);
        bombs.set(message.bombId, { col: message.col, row: message.row, placedAt: at });
        break;
      }

      case 'BOMB_EXPLODED': {
        const bomb = bombs.get(message.bombId);
        expect(bomb, `la bombe ${message.bombId} n'a pas été posée`).toBeDefined();
        expect({ col: message.col, row: message.row }).toEqual({ col: bomb!.col, row: bomb!.row });
        // À quelques millisecondes près : les étapes sans délai s'enchaînent chacune au tour suivant.
        expect(at - bomb!.placedAt, 'délai entre la pose et l’explosion').toBeGreaterThanOrEqual(
          BOMB_DELAY_MS,
        );
        expect(at - bomb!.placedAt, 'délai entre la pose et l’explosion').toBeLessThan(
          BOMB_DELAY_MS + 10,
        );

        const { affected, bricks } = blast(map!, bomb!);
        expect(sortedCells(message.affectedCells), 'cases touchées').toEqual(sortedCells(affected));
        expect(sortedCells(message.destroyedBricks ?? []), 'briques détruites').toEqual(
          sortedCells(bricks),
        );
        const hit = [...players.entries()]
          .filter(([, p]) => p.alive && affected.some((c) => c.col === p.col && c.row === p.row))
          .map(([playerId]) => playerId);
        expect([...(message.eliminatedPlayers ?? [])].sort(), 'joueurs éliminés').toEqual(
          hit.sort(),
        );

        for (const { col, row } of bricks) {
          map![row][col] = FLOOR;
        }
        for (const playerId of hit) {
          players.set(playerId, { ...players.get(playerId)!, alive: false });
        }
        bombs.delete(message.bombId);
        break;
      }
    }
  }

  expect(statusExpected, 'le dernier PLAYER_JOINED n’est pas suivi de LOBBY_STATUS').toBe(false);
  expect(stateExpected, 'le scénario s’arrête avant le GAME_STATE attendu').toBeUndefined();
}

describe('session simulée', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each([lobbyScenario, gameSessionScenario])('scénario « $name »', (scenario) => {
    it('est livré en entier et dans l’ordre à travers IGameConnection', async () => {
      const messages = (await replay(scenario)).map(({ message }) => message);

      expect(messages).toEqual(stepsOf(scenario).map((step) => step.message));
    });

    it('suit les règles du serveur', async () => {
      expectServerRules(await replay(scenario));
    });
  });

  it('lobby : la salle se remplit puis se vide sans que la partie démarre', async () => {
    const messages = (await replay(lobbyScenario)).map(({ message }) => message);
    const sizes = messages.flatMap((message) =>
      message.type === 'LOBBY_STATUS' ? [message.players.length] : [],
    );

    expect(messages.map((message) => message.type)).not.toContain('GAME_STARTED');
    expect(sizes).toEqual([1, 2, 3, 2]);
  });

  describe('game-session', () => {
    it('accueille le joueur local en premier, sous le nom qu’il a envoyé', async () => {
      const [first] = await replay(gameSessionScenario);

      expect(first.message).toEqual({
        type: 'PLAYER_JOINED',
        playerId: 'p1',
        playerName: LOCAL_NAME,
      });
    });

    it('remplit le salon, lance la partie, puis seuls les autres jouent', async () => {
      const messages = (await replay(gameSessionScenario)).map(({ message }) => message);
      const start = messages.findIndex((message) => message.type === 'GAME_STARTED');
      const sizes = messages
        .slice(0, start)
        .flatMap((message) => (message.type === 'LOBBY_STATUS' ? [message.players.length] : []));
      const actors = messages
        .slice(start)
        .flatMap((message) =>
          message.type === 'POSITION_UPDATED' || message.type === 'BOMB_PLACED'
            ? [message.playerId]
            : [],
        );

      expect(sizes).toEqual([1, 2, 3, 4]);
      expect(actors.length).toBeGreaterThan(0);
      // Le serveur simulé ne répond pas aux déplacements du joueur local.
      expect(actors).not.toContain('p1');
    });

    it('contient chaque message du protocole, pour montrer tout l’affichage hors ligne', async () => {
      const types = new Set((await replay(gameSessionScenario)).map(({ message }) => message.type));

      expect([...types].sort()).toEqual([...SERVER_MESSAGE_TYPES].sort());
    });
  });

  // Un arbitre qui laisse tout passer ne prouverait rien : il doit refuser un scénario faux.
  describe('les règles du serveur refusent un scénario', () => {
    /** Le début de `game-session`, jusqu'au lancement de la partie inclus. */
    async function untilStart(): Promise<Received[]> {
      const received = await replay(gameSessionScenario);
      const start = received.findIndex(({ message }) => message.type === 'GAME_STARTED');
      return received.slice(0, start + 2);
    }

    it('où un joueur entre dans un mur', async () => {
      const received = await untilStart();
      const { at } = received[received.length - 1];
      // Bob part de (13, 1) : au-dessus de lui, c'est le mur du bord.
      received.push({
        at,
        message: { type: 'POSITION_UPDATED', playerId: 'p2', col: 13, row: 0, direction: 'up' },
      });

      expect(() => expectServerRules(received)).toThrow();
    });

    it('où une bombe explose trop tôt', async () => {
      const received = await untilStart();
      const { at } = received[received.length - 1];
      received.push(
        { at, message: { type: 'BOMB_PLACED', bombId: 'x', playerId: 'p2', col: 13, row: 1 } },
        {
          at: at + 1000,
          message: {
            type: 'BOMB_EXPLODED',
            bombId: 'x',
            col: 13,
            row: 1,
            affectedCells: [{ col: 13, row: 1 }],
            destroyedBricks: [],
            eliminatedPlayers: ['p2'],
          },
        },
      );

      expect(() => expectServerRules(received)).toThrow();
    });

    it('où le joueur reste debout dans le souffle de sa bombe', async () => {
      const received = await replay(gameSessionScenario);
      const explosion = received.find(
        ({ message }) => message.type === 'BOMB_EXPLODED' && message.bombId === 'b1',
      );
      if (explosion?.message.type === 'BOMB_EXPLODED') {
        explosion.message.eliminatedPlayers = [];
      }

      expect(() => expectServerRules(received)).toThrow();
    });
  });
});
