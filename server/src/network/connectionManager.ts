import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../protocol/messages.js';
import { addPlayerToLobby, removePlayerFromLobby } from '../lobby/lobbyManager.js';

export function startConnectionManager(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`Serveur démarré, en écoute sur le port ${port}`);

  wss.on('connection', (socket: WebSocket) => {
    console.log('Un joueur vient de se connecter');

    // playerId n'est connu qu'une fois JOIN_LOBBY reçu, donc undefined au départ.
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
          playerId = addPlayerToLobby(socket, message.playerName) ?? undefined;
          console.log(`${message.playerName} a rejoint le lobby (id: ${playerId ?? 'refusé, lobby plein'})`);
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
      if (playerId) {
        removePlayerFromLobby(playerId);
      }
    });
  });

  return wss;
}