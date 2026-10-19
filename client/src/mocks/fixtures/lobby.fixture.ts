import type { Scenario } from '../../network/MockServerAdapter';
import { gameStateMessage } from '../mockArena';
import { MOCK_PLAYERS, arrivalSteps } from '../lobbySteps';

const [alice, bob, chloe] = MOCK_PLAYERS;

/**
 * Salle d'attente vue par Alice, déjà connectée : elle arrive, Bob et Chloé la
 * rejoignent, puis Bob s'en va. La partie ne démarre pas.
 *
 * Sert à construire l'écran Lobby, y compris le cas où la liste rétrécit : un
 * `LOBBY_STATUS` remplace la liste affichée, il ne s'y ajoute pas.
 */
export const lobbyScenario: Scenario = {
  name: 'lobby',
  steps: [
    ...arrivalSteps([alice, bob, chloe], 0, 1000),
    // Le serveur envoie l'état du jeu au nouveau venu, et à lui seul.
    { delayMs: 0, message: gameStateMessage([alice]) },
    ...arrivalSteps([alice, bob, chloe], 1, 1000),
    ...arrivalSteps([alice, bob, chloe], 2, 1000),
    // Le serveur n'a pas de message « joueur parti » : il renvoie la liste et l'état à jour.
    { delayMs: 2000, message: { type: 'LOBBY_STATUS', players: [alice, chloe] } },
    { delayMs: 0, message: gameStateMessage([alice, bob, chloe], [bob]) },
  ],
};
