import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../protocol/messages.js';

export function startConnectionManager(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`Serveur démarré, en écoute sur le port ${port}`);

  wss.on('connection', (socket: WebSocket) => {
    console.log('Un joueur vient de se connecter');

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
          // TODO: brancher sur le vrai lobbyManager une fois créé.
          console.log(`${message.playerName} demande à rejoindre le lobby`);
          break;
        }

        case 'MOVE': {
          const response: ServerMessage = {
            type: 'POSITION_UPDATED',
            playerId: message.playerId,
            position: message.direction,
          };
          socket.send(JSON.stringify(response));
          break;
        }

        default: {
          console.error('Type de message inconnu :', message);
        }
      }
    });

    socket.on('close', () => {
      console.log('Un joueur s\'est déconnecté');
    });
  });

  return wss;
}