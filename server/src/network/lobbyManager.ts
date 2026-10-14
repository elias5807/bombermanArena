import type { WebSocket } from 'ws';
import { GameEngine } from '../game/GameEngine.js';

export const sharedEngine = new GameEngine();

export function addPlayerToLobby(socket: WebSocket, playerName: string): string | null {
  return sharedEngine.addPlayer(socket, playerName);
}

export function removePlayerFromLobby(playerId: string): void {
  sharedEngine.removePlayer(playerId);
}

export function getWaitingPlayersCount(): number {
  return sharedEngine.getPlayersCount();
}