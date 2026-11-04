import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage } from '@bomberman-area/shared';
import { GameEngine } from '../game/GameEngine.js';

/** @returns le message décodé, ou `null` si ce n'est pas un objet JSON. */
function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ClientMessage) : null;
  } catch {
    return null;
  }
}

export function startConnectionManager(port: number, engine = new GameEngine()): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`Serveur démarré, en écoute sur le port ${port}`);

  wss.on('connection', (socket: WebSocket) => {
    console.log('Un joueur vient de se connecter');

    let playerId: string | undefined;

    socket.on('message', (data) => {
      const message = parseClientMessage(data.toString());
      if (!message) {
        console.error('Message invalide reçu :', data.toString());
        return;
      }

      switch (message.type) {
        case 'JOIN_LOBBY': {
          // Le client ne ferme pas son socket en quittant le salon : il revient par un nouveau
          // JOIN_LOBBY. Un socket ne porte qu'un joueur, le précédent est donc remplacé.
          if (playerId) {
            engine.removePlayer(playerId);
          }
          playerId = engine.addPlayer(socket, message.playerName) ?? undefined;
          console.log(
            `${message.playerName} a rejoint le lobby (id: ${playerId ?? 'refusé, lobby plein'})`,
          );
          break;
        }

        case 'MOVE': {
          // L'identité vient du socket : le `playerId` du message, diffusé à tous, n'est pas fiable.
          if (playerId) {
            engine.movePlayer(playerId, message.direction);
          }
          break;
        }

        case 'PLACE_BOMB': {
          if (playerId) {
            engine.placeBomb(playerId);
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