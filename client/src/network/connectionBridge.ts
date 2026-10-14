import type { ClientMessage } from '@shared/protocol/messages';
import type { AppEventBus } from '../core/AppEvents';
import type { IGameConnection } from './IGameConnection';

/**
 * Relie la connexion et le bus d'événements, dans les deux sens :
 *
 * - connexion → bus : chaque message du serveur est publié sous `server:<TYPE>` ;
 * - bus → connexion : les demandes du joueur (`input:*`) partent sous la forme
 *   des messages du protocole partagé.
 *
 * Le pont n'ouvre ni ne ferme la connexion : `App` s'en charge. Un envoi qui
 * échoue (connexion fermée, par exemple) est publié sur `connection:error` au
 * lieu de remonter chez la couche qui a publié la demande.
 *
 * @returns la fonction qui défait le pont : plus rien ne passe, dans aucun sens.
 */
export function bridgeConnection(connection: IGameConnection, bus: AppEventBus): () => void {
  // PROVISOIRE, à trancher avec le Backend : `MOVE` exige un `playerId`, mais aucun message
  // du serveur ne dit au client lequel est le sien (`PLAYER_JOINED` a la même forme pour lui
  // et pour les autres). En attendant, on prend celui du premier `PLAYER_JOINED` reçu après
  // l'envoi de `JOIN_LOBBY` : le serveur actuel annonce au nouveau venu sa propre arrivée
  // avant celle des suivants. Rien dans le protocole ne le garantit.
  let ownPlayerId: string | undefined;
  let awaitingOwnJoin = false;

  /** @returns `false` si le message n'a pas pu partir. */
  function send(message: ClientMessage): boolean {
    try {
      connection.send(message);
      return true;
    } catch (error) {
      bus.emit('connection:error', { error });
      return false;
    }
  }

  const unsubscribers = [
    connection.onMessage((message) => {
      if (awaitingOwnJoin && message.type === 'PLAYER_JOINED') {
        ownPlayerId = message.playerId;
        awaitingOwnJoin = false;
      }

      // 1. Publication générique sous le canal server:<TYPE>
      bus.emit(`server:${message.type}`, message);

      // 2. Publication des événements sémantiques vers l'EventBus local
      if (message.type === 'POSITION_UPDATED') {
        bus.emit('network:playerMoved', {
          playerId: message.playerId,
          col: message.col,
          row: message.row,
          direction: message.direction,
        });
      } else if (message.type === 'GAME_STATE') {
        bus.emit('network:gameState', message);
      }
    }),

    bus.on('input:join', ({ playerName }) => {
      ownPlayerId = undefined;
      awaitingOwnJoin = send({ type: 'JOIN_LOBBY', playerName });
    }),

    bus.on('input:move', ({ direction }) => {
      // Sans identifiant, le déplacement ne peut pas être décrit : il n'est pas envoyé.
      if (ownPlayerId !== undefined) {
        send({ type: 'MOVE', playerId: ownPlayerId, direction });
      }
    }),

    bus.on('input:bomb', () => {
      if (ownPlayerId !== undefined) {
        send({ type: 'PLACE_BOMB', playerId: ownPlayerId });
      }
    }),

    bus.on('input:start', () => {
      send({ type: 'START_GAME' });
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}
