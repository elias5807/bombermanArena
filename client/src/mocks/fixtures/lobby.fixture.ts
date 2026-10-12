import type { Scenario } from '../../network/MockServerAdapter';
import { MOCK_PLAYERS, joinLobbySteps } from '../lobbySteps';

const [alice, bob, chloe] = MOCK_PLAYERS;

/**
 * Salle d'attente : trois joueurs arrivent un par un, puis Bob s'en va. La
 * partie ne démarre pas.
 *
 * Sert à construire l'écran Lobby, y compris le cas où la liste rétrécit : un
 * `LOBBY_STATUS` remplace la liste affichée, il ne s'y ajoute pas.
 */
export const lobbyScenario: Scenario = {
  name: 'lobby',
  steps: [
    ...joinLobbySteps([alice, bob, chloe], 1000),
    // Le serveur n'a pas de message « joueur parti » : il renvoie la liste à jour.
    { delayMs: 2000, message: { type: 'LOBBY_STATUS', players: [alice, chloe] } },
  ],
};
