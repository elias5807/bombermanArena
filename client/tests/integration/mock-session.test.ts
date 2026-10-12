import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@shared/protocol/messages';
import { gameSessionScenario } from '../../src/mocks/fixtures/game-session.fixture';
import { lobbyScenario } from '../../src/mocks/fixtures/lobby.fixture';
import type { LobbyPlayer } from '../../src/mocks/lobbySteps';
import type { IGameConnection } from '../../src/network/IGameConnection';
import { MockServerAdapter, type Scenario } from '../../src/network/MockServerAdapter';

/** Un lobby accueille de 2 à 4 joueurs (sujet du projet). */
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

/** Rejoue `scenario` en entier à travers l'interface commune, comme le fera le reste du client. */
async function replay(scenario: Scenario): Promise<ServerMessage[]> {
  const connection: IGameConnection = new MockServerAdapter(scenario);
  const received: ServerMessage[] = [];
  connection.onMessage((message) => received.push(message));

  await connection.connect();
  await vi.runAllTimersAsync();
  connection.disconnect();

  return received;
}

/**
 * Vérifie que `messages` suivent les règles du serveur pour le lobby et la
 * partie (`server/src/network/lobbyManager.ts`), pour qu'un scénario ne devienne
 * pas incohérent quand on l'étend.
 */
function expectLobbyRules(messages: readonly ServerMessage[]): void {
  let lobby: LobbyPlayer[] = [];
  let statusExpected = false;
  let startedPlayers: string[] | undefined;

  for (const message of messages) {
    if (statusExpected) {
      expect(message.type, 'PLAYER_JOINED doit être suivi de LOBBY_STATUS').toBe('LOBBY_STATUS');
    }

    switch (message.type) {
      case 'PLAYER_JOINED':
        expect(startedPlayers, 'personne ne rejoint une partie déjà lancée').toBeUndefined();
        expect(lobby.length, 'le lobby est plein').toBeLessThan(MAX_PLAYERS);
        lobby = [...lobby, { playerId: message.playerId, playerName: message.playerName }];
        statusExpected = true;
        break;

      case 'LOBBY_STATUS':
        if (statusExpected) {
          expect(message.players, 'LOBBY_STATUS liste tous les joueurs présents').toEqual(lobby);
        } else {
          // Un départ : le serveur renvoie la liste, sans le joueur parti.
          expect(message.players).toHaveLength(lobby.length - 1);
          expect(lobby).toEqual(expect.arrayContaining(message.players));
        }
        lobby = message.players;
        statusExpected = false;
        break;

      case 'GAME_STARTED':
        expect(lobby.length, 'trop peu de joueurs pour lancer la partie').toBeGreaterThanOrEqual(
          MIN_PLAYERS,
        );
        expect(message.players, 'GAME_STARTED liste les joueurs du lobby').toEqual(
          lobby.map(({ playerId }) => playerId),
        );
        startedPlayers = message.players;
        break;

      case 'POSITION_UPDATED':
        expect(startedPlayers, 'un déplacement avant le début de la partie').toBeDefined();
        expect(startedPlayers, 'un déplacement d’un joueur absent de la partie').toContain(
          message.playerId,
        );
        break;
    }
  }

  expect(statusExpected, 'le dernier PLAYER_JOINED n’est pas suivi de LOBBY_STATUS').toBe(false);
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
      const messages = await replay(scenario);

      expect(messages).toEqual(scenario.steps.map((step) => step.message));
    });

    it('suit les règles du serveur', async () => {
      expectLobbyRules(await replay(scenario));
    });
  });

  it('lobby : la salle se remplit puis se vide sans que la partie démarre', async () => {
    const messages = await replay(lobbyScenario);
    const sizes = messages.flatMap((message) =>
      message.type === 'LOBBY_STATUS' ? [message.players.length] : [],
    );

    expect(messages.map((message) => message.type)).not.toContain('GAME_STARTED');
    expect(sizes).toEqual([1, 2, 3, 2]);
  });

  it('game-session : le lobby se remplit, la partie démarre, puis les joueurs bougent', async () => {
    const types = (await replay(gameSessionScenario)).map((message) => message.type);
    const start = types.indexOf('GAME_STARTED');

    expect(start).toBeGreaterThan(0);
    expect(types.slice(0, start)).toEqual(
      Array(MAX_PLAYERS).fill(['PLAYER_JOINED', 'LOBBY_STATUS']).flat(),
    );
    expect(types.slice(start + 1).length).toBeGreaterThan(0);
    expect(types.slice(start + 1).every((type) => type === 'POSITION_UPDATED')).toBe(true);
  });
});
