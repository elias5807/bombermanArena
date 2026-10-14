import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@shared/protocol/messages';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { bridgeConnection } from '../../src/network/connectionBridge';
import { FakeConnection } from '../helpers/FakeConnection';
import { recordEvents, type RecordedEvent } from '../helpers/recordEvents';

const ALICE = { playerId: 'p1', playerName: 'Alice' };
const BOB = { playerId: 'p2', playerName: 'Bob' };

function playerJoined(player: typeof ALICE): ServerMessage {
  return { type: 'PLAYER_JOINED', ...player };
}

/** Chaque message serveur du protocole partagé, et l'événement sous lequel il doit être publié. */
const SERVER_MESSAGES: [event: RecordedEvent[0], message: ServerMessage][] = [
  ['server:PLAYER_JOINED', playerJoined(ALICE)],
  ['server:LOBBY_STATUS', { type: 'LOBBY_STATUS', players: [ALICE, BOB] }],
  ['server:GAME_STARTED', { type: 'GAME_STARTED', players: ['p1', 'p2'] }],
  ['server:POSITION_UPDATED', { type: 'POSITION_UPDATED', playerId: 'p1', position: 'up' }],
];

/** Un pont posé entre une connexion ouverte et un bus dont on enregistre les événements. */
function setup() {
  const connection = new FakeConnection();
  connection.open = true;
  // Un abonné qui échoue fait échouer le test, au lieu d'être signalé dans la console.
  const bus = new EventBus<AppEvents>((error) => {
    throw error;
  });
  const unbridge = bridgeConnection(connection, bus);
  // Abonné après le pont : une demande est enregistrée une fois que le pont l'a traitée.
  const events = recordEvents(bus);

  return { connection, bus, unbridge, events };
}

describe('bridgeConnection', () => {
  describe('connexion → bus', () => {
    it.each(SERVER_MESSAGES)('publie %s avec le message pour donnée', (event, message) => {
      const { connection, events } = setup();

      connection.receive(message);

      expect(events).toEqual([[event, message]]);
    });

    it("publie les messages dans l'ordre où ils arrivent", () => {
      const { connection, events } = setup();

      for (const [, message] of SERVER_MESSAGES) {
        connection.receive(message);
      }

      expect(events).toEqual(SERVER_MESSAGES);
    });
  });

  describe('bus → connexion', () => {
    it('envoie JOIN_LOBBY pour input:join', () => {
      const { connection, bus } = setup();

      bus.emit('input:join', { playerName: 'Louka' });

      expect(connection.sent).toEqual([{ type: 'JOIN_LOBBY', playerName: 'Louka' }]);
    });

    it("n'envoie rien pour input:bomb, que le protocole partagé ne décrit pas encore", () => {
      const { connection, bus } = setup();

      bus.emit('input:bomb');

      expect(connection.sent).toEqual([]);
    });

    it("publie connection:error quand l'envoi échoue, sans faire échouer la publication", () => {
      const { connection, bus, events } = setup();
      connection.open = false;

      expect(() => bus.emit('input:join', { playerName: 'Louka' })).not.toThrow();

      expect(connection.sent).toEqual([]);
      expect(events).toEqual([
        ['connection:error', { error: new Error('FakeConnection : la connexion est fermée.') }],
        ['input:join', { playerName: 'Louka' }],
      ]);
    });
  });

  // Règle provisoire, à trancher avec le Backend : voir le commentaire de bridgeConnection.
  describe('identifiant du joueur dans MOVE (provisoire)', () => {
    it('envoie MOVE avec le playerId du premier PLAYER_JOINED reçu après JOIN_LOBBY', () => {
      const { connection, bus } = setup();

      bus.emit('input:join', { playerName: 'Alice' });
      connection.receive(playerJoined(ALICE));
      bus.emit('input:move', { direction: 'left' });

      expect(connection.sent).toEqual([
        { type: 'JOIN_LOBBY', playerName: 'Alice' },
        { type: 'MOVE', playerId: 'p1', direction: 'left' },
      ]);
    });

    it('garde cet identifiant quand un autre joueur arrive ensuite', () => {
      const { connection, bus } = setup();
      bus.emit('input:join', { playerName: 'Alice' });
      connection.receive(playerJoined(ALICE));

      connection.receive(playerJoined(BOB));
      bus.emit('input:move', { direction: 'up' });

      expect(connection.sent.at(-1)).toEqual({ type: 'MOVE', playerId: 'p1', direction: 'up' });
    });

    it("n'envoie pas MOVE tant que le joueur n'a pas demandé à rejoindre le lobby", () => {
      const { connection, bus } = setup();

      connection.receive(playerJoined(ALICE));
      bus.emit('input:move', { direction: 'up' });

      expect(connection.sent).toEqual([]);
    });

    it("n'envoie pas MOVE entre JOIN_LOBBY et l'arrivée de PLAYER_JOINED", () => {
      const { connection, bus } = setup();
      connection.receive(playerJoined(ALICE));
      bus.emit('input:join', { playerName: 'Bob' });

      // LOBBY_STATUS cite des joueurs, mais ne dit pas lequel nous sommes.
      connection.receive({ type: 'LOBBY_STATUS', players: [ALICE] });
      bus.emit('input:move', { direction: 'up' });
      connection.receive(playerJoined(BOB));
      bus.emit('input:move', { direction: 'down' });

      expect(connection.sent).toEqual([
        { type: 'JOIN_LOBBY', playerName: 'Bob' },
        { type: 'MOVE', playerId: 'p2', direction: 'down' },
      ]);
    });

    it("oublie l'identifiant quand le joueur rejoint à nouveau le lobby", () => {
      const { connection, bus } = setup();
      bus.emit('input:join', { playerName: 'Alice' });
      connection.receive(playerJoined(ALICE));

      bus.emit('input:join', { playerName: 'Alice' });
      bus.emit('input:move', { direction: 'up' });
      connection.receive(playerJoined(BOB));
      bus.emit('input:move', { direction: 'down' });

      expect(connection.sent.slice(2)).toEqual([
        { type: 'MOVE', playerId: 'p2', direction: 'down' },
      ]);
    });

    it("n'attend pas d'identifiant quand JOIN_LOBBY n'a pas pu partir", () => {
      const { connection, bus } = setup();
      connection.open = false;
      bus.emit('input:join', { playerName: 'Alice' });
      connection.open = true;

      connection.receive(playerJoined(ALICE));
      bus.emit('input:move', { direction: 'up' });

      expect(connection.sent).toEqual([]);
    });
  });

  describe('une fois le pont défait', () => {
    it('ne publie plus les messages du serveur', () => {
      const { connection, unbridge, events } = setup();

      unbridge();
      connection.receive(playerJoined(ALICE));

      expect(connection.handlerCount).toBe(0);
      expect(events).toEqual([]);
    });

    it("n'envoie plus les demandes du joueur", () => {
      const { connection, bus, unbridge } = setup();
      bus.emit('input:join', { playerName: 'Alice' });
      connection.receive(playerJoined(ALICE));

      unbridge();
      bus.emit('input:join', { playerName: 'Alice' });
      bus.emit('input:move', { direction: 'up' });

      expect(connection.sent).toEqual([{ type: 'JOIN_LOBBY', playerName: 'Alice' }]);
    });
  });

  it("n'ouvre ni ne ferme la connexion : c'est le rôle de App", () => {
    const { connection, unbridge } = setup();

    unbridge();

    expect(connection.connectCalls).toBe(0);
    expect(connection.disconnectCalls).toBe(0);
  });
});
