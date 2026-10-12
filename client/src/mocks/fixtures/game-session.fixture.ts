import type { Scenario, ScenarioStep } from '../../network/MockServerAdapter';
import { MOCK_PLAYERS, joinLobbySteps } from '../lobbySteps';

const [alice, bob, chloe, david] = MOCK_PLAYERS;

/** Déplacement confirmé par le serveur, que tous les joueurs reçoivent. */
function positionUpdate(playerId: string, position: string): ScenarioStep {
  return { delayMs: 500, message: { type: 'POSITION_UPDATED', playerId, position } };
}

/**
 * Début de partie à quatre joueurs : le lobby se remplit, la partie démarre,
 * puis les joueurs se déplacent.
 *
 * C'est tout ce que le protocole partagé permet de décrire pour l'instant :
 * les bombes, explosions, murs détruits et la fin de partie seront ajoutés
 * quand `shared/` les définira. Le champ `position` y est encore une simple
 * chaîne (« à affiner ») ; le serveur y met aujourd'hui la direction du
 * déplacement, comme ici. Quand le format changera, le compilateur signalera
 * les valeurs à corriger.
 */
export const gameSessionScenario: Scenario = {
  name: 'game-session',
  steps: [
    ...joinLobbySteps(MOCK_PLAYERS, 1000),
    {
      delayMs: 1000,
      message: { type: 'GAME_STARTED', players: MOCK_PLAYERS.map(({ playerId }) => playerId) },
    },
    positionUpdate(alice.playerId, 'right'),
    positionUpdate(bob.playerId, 'down'),
    positionUpdate(chloe.playerId, 'left'),
    positionUpdate(alice.playerId, 'down'),
    positionUpdate(david.playerId, 'up'),
    positionUpdate(bob.playerId, 'right'),
  ],
};
