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
 * Étapes d'un lobby où `players` arrivent l'un après l'autre, à `delayMs`
 * d'intervalle.
 *
 * Reproduit le serveur (`addPlayerToLobby`, dans `server/src/network/lobbyManager.ts`) :
 * pour chaque arrivée, `PLAYER_JOINED`, puis aussitôt un `LOBBY_STATUS` qui liste
 * tous les joueurs présents, nouveau compris.
 */
export function joinLobbySteps(players: readonly LobbyPlayer[], delayMs: number): ScenarioStep[] {
  return players.flatMap((player, index): ScenarioStep[] => [
    { delayMs, message: { type: 'PLAYER_JOINED', ...player } },
    { delayMs: 0, message: { type: 'LOBBY_STATUS', players: players.slice(0, index + 1) } },
  ]);
}
