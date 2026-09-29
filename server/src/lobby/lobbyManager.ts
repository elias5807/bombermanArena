import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../protocol/messages.js';

const MAX_PLAYERS = 4;

interface LobbyPlayer {
  playerId: string;
  playerName: string;
  socket: WebSocket;
}

const waitingPlayers: LobbyPlayer[] = [];

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function broadcastToLobby(message: ServerMessage): void {
  for (const player of waitingPlayers) {
    send(player.socket, message);
  }
}

function buildLobbyStatus(): ServerMessage {
  return {
    type: 'LOBBY_STATUS',
    players: waitingPlayers.map(({ playerId, playerName }) => ({ playerId, playerName })),
  };
}

export function addPlayerToLobby(socket: WebSocket, playerName: string): string | null {
  if (waitingPlayers.length >= MAX_PLAYERS) {
    console.warn(`Lobby plein, ${playerName} ne peut pas rejoindre`);
    return null;
  }

  const playerId = randomUUID();

  waitingPlayers.push({ playerId, playerName, socket });

  broadcastToLobby({ type: 'PLAYER_JOINED', playerId, playerName });
  broadcastToLobby(buildLobbyStatus());

  if (waitingPlayers.length >= MAX_PLAYERS) {
    startGame();
  }

  return playerId;
}

export function removePlayerFromLobby(playerId: string): void {
  const index = waitingPlayers.findIndex((player) => player.playerId === playerId);
  if (index !== -1) {
    waitingPlayers.splice(index, 1);
    broadcastToLobby(buildLobbyStatus());
  }
}

function startGame(): void {
  const players = waitingPlayers.map((p) => p.playerId);

  broadcastToLobby({ type: 'GAME_STARTED', players });

  // TODO: transmettre `players` au game engine une fois créé (game/GameEngine.ts), au lieu de vider la liste d'attente.
  waitingPlayers.length = 0;
}

export function getWaitingPlayersCount(): number {
  return waitingPlayers.length;
}