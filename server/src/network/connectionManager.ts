import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage } from '@bomberman-area/shared';
import { GameEngine } from '../game/GameEngine.js';

export function startConnectionManager(port: number, engine = new GameEngine()): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`Serveur démarré, en écoute sur le port ${port}`);

  wss.on('connection', (socket: WebSocket) => {
    console.log('Un joueur vient de se connecter');

    let playerId: string | undefined;

    socket.on('message', (data) => {
      let message: ClientMessage;

      try {
        message = JSON.parse(data.toString());
      } catch (error) {
        console.error('Message invalide reçu :', data.toString());
        return;
      }

      switch (message.type) {
        case 'JOIN_LOBBY': {
          playerId = engine.addPlayer(socket, message.playerName) ?? undefined;
          console.log(
            `${message.playerName} a rejoint le lobby (id: ${playerId ?? 'refusé, lobby plein'})`,
          );
          break;
        }

        case 'MOVE': {
          const id = playerId ?? message.playerId;
          if (id) {
            engine.movePlayer(id, message.direction);
          }
          break;
        }

        case 'PLACE_BOMB': {
          const id = playerId ?? message.playerId;
          if (id) {
            engine.placeBomb(id);
          }
          break;
        }

        case 'START_GAME': {
          engine.startGame();
          break;
        }

        default: {
          console.error('Type de message inconnu :', message);
        }
      }
    });

    socket.on('close', () => {
      console.log('Un joueur s\'est déconnecté');
      if (playerId) {
        engine.removePlayer(playerId);
      }
    });
  });

  return wss;
}