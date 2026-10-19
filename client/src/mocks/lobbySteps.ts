import type { LobbyStatusMessage } from '@shared/protocol/messages';
import type { ScenarioStep } from '../network/MockServerAdapter';

/** Un joueur tel que le serveur le décrit dans `LOBBY_STATUS`. */
export type LobbyPlayer = LobbyStatusMessage['players'][number];

/** Joueurs fictifs communs à tous les scénarios, pour que leurs identifiants restent les mêmes. */
export const MOCK_PLAYERS: readonly LobbyPlayer[] = [
  { playerId: 'p1', playerName: 'Alice' },
  { playerId: 'p2', playerName: 'Bob' },
  { playerId: 'p3', playerName: 'Chloé' },
  { playerId: 'p4', playerName: 'David' },
];

/**
 * Étapes de l'arrivée de `lobby[index]`, `delayMs` après l'étape précédente, quand
 * les joueurs qui le précèdent dans `lobby` sont déjà là.
 *
 * Reproduit le serveur (`GameEngine.addPlayer`, dans `server/src/game/GameEngine.ts`) :
 * `PLAYER_JOINED`, puis aussitôt un `LOBBY_STATUS` qui liste tous les joueurs
 * présents, nouveau compris.
 */
export function arrivalSteps(
  lobby: readonly LobbyPlayer[],
  index: number,
  delayMs: number,
): ScenarioStep[] {
  return [
    { delayMs, message: { type: 'PLAYER_JOINED', ...lobby[index] } },
    { delayMs: 0, message: { type: 'LOBBY_STATUS', players: lobby.slice(0, index + 1) } },
  ];
}

/** Étapes d'un lobby où `players` arrivent l'un après l'autre, à `delayMs` d'intervalle. */
export function joinLobbySteps(players: readonly LobbyPlayer[], delayMs: number): ScenarioStep[] {
  return players.flatMap((_, index) => arrivalSteps(players, index, delayMs));
}
