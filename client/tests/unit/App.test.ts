import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@shared/protocol/messages';
import { App, createConnection } from '../../src/App';
import { SERVER_URL } from '../../src/config';
import { MockServerAdapter } from '../../src/network/MockServerAdapter';
import { FakeConnection } from '../helpers/FakeConnection';
import { recordEvents } from '../helpers/recordEvents';

const LOBBY_STATUS: ServerMessage = {
  type: 'LOBBY_STATUS',
  players: [{ playerId: 'p1', playerName: 'Alice' }],
};

function setup() {
  const connection = new FakeConnection();
  const app = new App(connection);
  const events = recordEvents(app.bus);

  return { connection, app, events };
}

/** Une ouverture de connexion que le test termine quand il le décide. */
function pendingConnect(connection: FakeConnection) {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  connection.connectOutcome = () => promise;
  return { resolve, reject };
}

describe('createConnection', () => {
  it('crée le serveur simulé en mode mock', () => {
    expect(createConnection('mock')).toBeInstanceOf(MockServerAdapter);
  });

  it("refuse le mode server tant que la connexion réelle n'existe pas, en citant l'URL visée", () => {
    expect(() => createConnection('server')).toThrow(SERVER_URL);
  });
});

describe('App', () => {
  describe('start', () => {
    it('ouvre la connexion puis publie connection:opened', async () => {
      const { connection, app, events } = setup();

      await app.start();

      expect(connection.connectCalls).toBe(1);
      expect(events).toEqual([['connection:opened', undefined]]);
    });

    it("relie la connexion au bus avant de l'ouvrir, pour ne perdre aucun message", async () => {
      const { connection, app } = setup();
      let handlersAtConnect: number | undefined;
      connection.connectOutcome = () => {
        handlersAtConnect = connection.handlerCount;
        return Promise.resolve();
      };

      await app.start();

      expect(handlersAtConnect).toBe(1);
    });

    it('relie la connexion et le bus dans les deux sens', async () => {
      const { connection, app, events } = setup();
      await app.start();

      connection.receive(LOBBY_STATUS);
      app.bus.emit('input:join', { playerName: 'Alice' });

      expect(events).toContainEqual(['server:LOBBY_STATUS', LOBBY_STATUS]);
      expect(connection.sent).toEqual([{ type: 'JOIN_LOBBY', playerName: 'Alice' }]);
    });

    it('est sans effet si l’application est déjà démarrée', async () => {
      const { connection, app, events } = setup();
      await app.start();

      await app.start();
      connection.receive(LOBBY_STATUS);

      expect(connection.connectCalls).toBe(1);
      expect(events).toEqual([
        ['connection:opened', undefined],
        ['server:LOBBY_STATUS', LOBBY_STATUS],
      ]);
    });

    it('publie connection:error, sans rejeter sa promesse, quand la connexion ne s’ouvre pas', async () => {
      const { connection, app, events } = setup();
      const error = new Error('serveur injoignable');
      connection.connectOutcome = () => Promise.reject(error);

      await expect(app.start()).resolves.toBeUndefined();

      expect(events).toEqual([['connection:error', { error }]]);
      expect(connection.handlerCount).toBe(0);
    });

    it('peut être relancée après un échec', async () => {
      const { connection, app, events } = setup();
      connection.connectOutcome = () => Promise.reject(new Error('serveur injoignable'));
      await app.start();
      connection.connectOutcome = () => Promise.resolve();

      await app.start();
      connection.receive(LOBBY_STATUS);

      expect(events.slice(1)).toEqual([
        ['connection:opened', undefined],
        ['server:LOBBY_STATUS', LOBBY_STATUS],
      ]);
    });
  });

  describe('stop', () => {
    it('ferme la connexion puis publie connection:closed', async () => {
      const { connection, app, events } = setup();
      await app.start();

      app.stop();

      expect(connection.disconnectCalls).toBe(1);
      expect(events).toEqual([
        ['connection:opened', undefined],
        ['connection:closed', undefined],
      ]);
    });

    it('défait le pont : plus rien ne passe entre la connexion et le bus', async () => {
      const { connection, app, events } = setup();
      await app.start();
      app.stop();
      events.length = 0;

      connection.receive(LOBBY_STATUS);
      app.bus.emit('input:join', { playerName: 'Alice' });

      expect(connection.handlerCount).toBe(0);
      // Ni server:LOBBY_STATUS, ni connection:error pour un envoi sur une connexion fermée.
      expect(events).toEqual([['input:join', { playerName: 'Alice' }]]);
    });

    it('est sans effet si l’application n’est pas démarrée', async () => {
      const { connection, app, events } = setup();

      app.stop();
      await app.start();
      app.stop();
      app.stop();

      expect(connection.disconnectCalls).toBe(1);
      expect(events).toEqual([
        ['connection:opened', undefined],
        ['connection:closed', undefined],
      ]);
    });

    it('pendant l’ouverture de la connexion : ni connection:opened ni connection:closed', async () => {
      const { connection, app, events } = setup();
      const { resolve } = pendingConnect(connection);
      const started = app.start();

      app.stop();
      resolve();
      await started;

      expect(connection.disconnectCalls).toBe(1);
      expect(connection.handlerCount).toBe(0);
      expect(events).toEqual([]);
    });

    it('pendant une ouverture qui échoue ensuite : pas de connection:error', async () => {
      const { connection, app, events } = setup();
      const { reject } = pendingConnect(connection);
      const started = app.start();

      app.stop();
      reject(new Error('serveur injoignable'));
      await started;

      expect(events).toEqual([]);
    });

    it('suivi d’un redémarrage qui échoue : connection:closed n’est pas publié une seconde fois', async () => {
      const { connection, app, events } = setup();
      await app.start();
      app.stop();
      events.length = 0;
      const error = new Error('serveur injoignable');
      connection.connectOutcome = () => Promise.reject(error);

      await app.start();

      expect(events).toEqual([['connection:error', { error }]]);
    });

    it('permet de redémarrer : chaque message est publié une seule fois', async () => {
      const { connection, app, events } = setup();
      await app.start();
      app.stop();
      events.length = 0;

      await app.start();
      connection.receive(LOBBY_STATUS);

      expect(connection.connectCalls).toBe(2);
      expect(events).toEqual([
        ['connection:opened', undefined],
        ['server:LOBBY_STATUS', LOBBY_STATUS],
      ]);
    });
  });
});
