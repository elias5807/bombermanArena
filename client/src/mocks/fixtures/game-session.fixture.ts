import type { Scenario, ScenarioStep } from '../../network/MockServerAdapter';
import { MOCK_PLAYERS, joinLobbySteps } from '../lobbySteps';

const [alice, bob, chloe, david] = MOCK_PLAYERS;

/** Déplacement confirmé par le serveur, que tous les joueurs reçoivent. */
function positionUpdate(
  playerId: string,
  col: number,
  row: number,
  direction?: 'up' | 'down' | 'left' | 'right',
): ScenarioStep {
  return { delayMs: 500, message: { type: 'POSITION_UPDATED', playerId, col, row, direction } };
}

/**
 * Début de partie à quatre joueurs : le lobby se remplit, la partie démarre,
 * puis les joueurs se déplacent avec des coordonnées précises synchronisées.
 */
export const gameSessionScenario: Scenario = {
  name: 'game-session',
  steps: [
    ...joinLobbySteps(MOCK_PLAYERS, 1000),
    {
      delayMs: 1000,
      message: { type: 'GAME_STARTED', players: MOCK_PLAYERS.map(({ playerId }) => playerId) },
    },
    positionUpdate(alice.playerId, 2, 1, 'right'),
    positionUpdate(bob.playerId, 11, 2, 'down'),
    positionUpdate(chloe.playerId, 2, 9, 'right'),
    positionUpdate(alice.playerId, 2, 2, 'down'),
    positionUpdate(david.playerId, 11, 8, 'up'),
    positionUpdate(bob.playerId, 10, 2, 'left'),
  ],
};
