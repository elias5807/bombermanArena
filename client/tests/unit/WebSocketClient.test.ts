import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';
import { WebSocketClient } from '../../src/network/WebSocketClient';

const URL = 'ws://serveur.test:3000';

const joinedAlice: ServerMessage = { type: 'PLAYER_JOINED', playerId: 'p1', playerName: 'Alice' };
const joinedBob: ServerMessage = { type: 'PLAYER_JOINED', playerId: 'p2', playerName: 'Bob' };
const started: ServerMessage = { type: 'GAME_STARTED', players: ['p1', 'p2'] };

const join: ClientMessage = { type: 'JOIN_LOBBY', playerName: 'Alice' };
const move: ClientMessage = { type: 'MOVE', playerId: 'p1', direction: 'up' };

type Listener = (event: unknown) => void;

/**
 * Faux WebSocket, injecté à la place du global : il ne fait rien de lui-même,
 * chaque événement du serveur est déclenché par le test (`simulate…`).
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  /** Les sockets créées par le client, dans l'ordre. */
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  /** Les données passées à `send()`, dans l'ordre. */
  readonly sent: string[] = [];
  readonly url: string;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  /** Comme un vrai WebSocket, l'événement `close` n'arrive que plus tard (`simulateClose`). */
  close(): void {
    this.readyState = FakeWebSocket.CLOSING;
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  simulateError(): void {
    this.emit('error', {});
  }

  simulateClose(code = 1006): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code });
  }

  /** Un message du serveur : un objet est envoyé en JSON, une chaîne telle quelle. */
  simulateMessage(message: ServerMessage | string): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    this.emit('message', { data });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }
}

/** La dernière socket créée par le client. */
function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error('aucune socket créée');
  }
  return socket;
}

/** Laisse passer toutes les livraisons en attente (microtâches). */
function flushDeliveries(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Crée un client dont les messages reçus s'accumulent dans `received`. */
function createClient() {
  const client = new WebSocketClient(URL);
  const received: ServerMessage[] = [];
  client.onMessage((message) => received.push(message));
  return { client, received };
}

/** Ouvre la connexion de `client` et renvoie la socket ouverte. */
async function open(client: WebSocketClient): Promise<FakeWebSocket> {
  const connecting = client.connect();
  const socket = lastSocket();
  socket.simulateOpen();
  await connecting;
  return socket;
}

/** Crée un client connecté. */
async function createConnectedClient() {
  const { client, received } = createClient();
  const socket = await open(client);
  return { client, socket, received };
}

describe('WebSocketClient', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('connexion', () => {
    it("ouvre une socket vers l'adresse donnée", () => {
      const { client } = createClient();

      void client.connect();

      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(lastSocket().url).toBe(URL);
    });

    it("ne se résout qu'une fois la socket ouverte", async () => {
      const { client } = createClient();
      let resolved = false;
      void client.connect().then(() => {
        resolved = true;
      });

      await flushDeliveries();
      expect(resolved).toBe(false);

      lastSocket().simulateOpen();
      await flushDeliveries();
      expect(resolved).toBe(true);
    });

    it('est rejetée si le serveur est injoignable', async () => {
      const { client } = createClient();
      const connecting = client.connect();

      lastSocket().simulateError();
      lastSocket().simulateClose(1006);

      await expect(connecting).rejects.toThrow(URL);
    });

    it('est rejetée si la socket se ferme avant de s’ouvrir', async () => {
      const { client } = createClient();
      const connecting = client.connect();

      lastSocket().simulateClose(1008);

      await expect(connecting).rejects.toThrow(/fermée avant ouverture \(1008\)/);
    });

    it('est rejetée si la socket ne peut même pas être créée (adresse invalide)', async () => {
      const invalidUrl = new SyntaxError('adresse invalide');
      vi.stubGlobal(
        'WebSocket',
        class {
          static readonly OPEN = 1;
          constructor() {
            throw invalidUrl;
          }
        },
      );
      const { client } = createClient();

      await expect(client.connect()).rejects.toBe(invalidUrl);
    });

    it('peut réessayer après un échec', async () => {
      const { client } = createClient();
      const failed = client.connect();
      lastSocket().simulateError();
      await expect(failed).rejects.toThrow();

      await open(client);

      expect(FakeWebSocket.instances).toHaveLength(2);
      expect(() => client.send(join)).not.toThrow();
    });

    it('est sans effet si la connexion est déjà ouverte', async () => {
      const { client } = await createConnectedClient();

      await expect(client.connect()).resolves.toBeUndefined();

      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('ouvre une nouvelle socket si la précédente est en train de se fermer', async () => {
      const { client, socket } = await createConnectedClient();
      socket.readyState = FakeWebSocket.CLOSING; // le serveur a commencé à fermer

      const reconnecting = client.connect();
      lastSocket().simulateOpen();
      await reconnecting;

      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('peut rouvrir la connexion après disconnect(), avec les mêmes abonnés', async () => {
      const { client, received } = await createConnectedClient();
      client.disconnect();

      const socket = await open(client);
      socket.simulateMessage(joinedAlice);
      await flushDeliveries();

      expect(FakeWebSocket.instances).toHaveLength(2);
      expect(received).toEqual([joinedAlice]);
    });

    it("n'ouvre qu'une socket pour deux connect() simultanés", async () => {
      const { client } = createClient();

      const first = client.connect();
      const second = client.connect();
      expect(FakeWebSocket.instances).toHaveLength(1);

      lastSocket().simulateOpen();
      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    });

    it('rejette tous les connect() en attente si l’ouverture échoue, puis accepte un nouvel essai', async () => {
      const { client } = createClient();
      const first = client.connect();
      const second = client.connect();
      expect(FakeWebSocket.instances).toHaveLength(1);

      lastSocket().simulateError();
      await expect(first).rejects.toThrow(URL);
      await expect(second).rejects.toThrow(URL);

      await open(client);
      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("garde la nouvelle connexion quand l'ancienne socket finit de se fermer", async () => {
      const { client, socket: oldSocket, received } = await createConnectedClient();
      client.disconnect();
      const socket = await open(client);

      oldSocket.simulateClose(1000); // le vrai WebSocket signale la fermeture plus tard
      client.send(join);
      socket.simulateMessage(joinedAlice);
      await flushDeliveries();

      expect(socket.sent).toEqual([JSON.stringify(join)]);
      expect(received).toEqual([joinedAlice]);
    });
  });

  describe('déconnexion', () => {
    it('ferme la socket', async () => {
      const { client, socket } = await createConnectedClient();
      const close = vi.spyOn(socket, 'close');

      client.disconnect();

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('accepte qu’on se déconnecte sans être connecté, ou deux fois de suite', async () => {
      const { client } = createClient();
      expect(() => client.disconnect()).not.toThrow();

      const socket = await open(client);
      const close = vi.spyOn(socket, 'close');
      client.disconnect();
      client.disconnect();

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('ne livre jamais un message arrivé juste avant disconnect()', async () => {
      const { client, socket, received } = await createConnectedClient();

      socket.simulateMessage(joinedAlice);
      client.disconnect();
      await flushDeliveries();

      expect(received).toEqual([]);
    });

    it('ne livre pas les messages déjà arrivés quand un abonné se déconnecte', async () => {
      const { client, socket, received } = await createConnectedClient();
      client.onMessage(() => client.disconnect());

      socket.simulateMessage(joinedAlice);
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(received).toEqual([joinedAlice]);
    });

    it("ne livre pas à l'ancienne connexion un message arrivé avant une reconnexion", async () => {
      const { client, socket: oldSocket, received } = await createConnectedClient();

      oldSocket.simulateMessage(joinedAlice);
      client.disconnect();
      const socket = await open(client);
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(received).toEqual([joinedBob]);
    });
  });

  describe('envoi de messages', () => {
    it('envoie le message sérialisé en JSON, dans l’ordre', async () => {
      const { client, socket } = await createConnectedClient();

      client.send(join);
      client.send(move);

      expect(socket.sent.map((data) => JSON.parse(data) as ClientMessage)).toEqual([join, move]);
    });

    it("refuse d'envoyer avant la connexion", () => {
      const { client } = createClient();

      expect(() => client.send(join)).toThrow(/connexion n'est pas ouverte/);
    });

    it("refuse d'envoyer tant que la socket n'est pas ouverte", () => {
      const { client } = createClient();
      void client.connect();

      expect(() => client.send(join)).toThrow(/connexion n'est pas ouverte/);
      expect(lastSocket().sent).toEqual([]);
    });

    it("refuse d'envoyer après disconnect()", async () => {
      const { client, socket } = await createConnectedClient();
      client.disconnect();

      expect(() => client.send(join)).toThrow(/connexion n'est pas ouverte/);
      expect(socket.sent).toEqual([]);
    });

    it("refuse d'envoyer quand le serveur a fermé la connexion", async () => {
      const { client, socket } = await createConnectedClient();
      socket.simulateClose(1001);

      expect(() => client.send(join)).toThrow(/connexion n'est pas ouverte/);
    });

    it("refuse d'envoyer pendant une fermeture lancée par le serveur", async () => {
      const { client, socket } = await createConnectedClient();
      socket.readyState = FakeWebSocket.CLOSING;

      expect(() => client.send(join)).toThrow(/connexion n'est pas ouverte/);
      expect(socket.sent).toEqual([]);
    });
  });

  describe('réception de messages', () => {
    it('livre les messages décodés, dans l’ordre d’arrivée', async () => {
      const { socket, received } = await createConnectedClient();

      socket.simulateMessage(joinedAlice);
      socket.simulateMessage(joinedBob);
      socket.simulateMessage(started);
      await flushDeliveries();

      expect(received).toEqual([joinedAlice, joinedBob, started]);
    });

    it('livre de façon asynchrone, jamais pendant l’arrivée du message', async () => {
      const { socket, received } = await createConnectedClient();

      socket.simulateMessage(joinedAlice);
      expect(received).toEqual([]);

      await flushDeliveries();
      expect(received).toEqual([joinedAlice]);
    });

    it('ne livre rien pendant connect(), même si un message suit l’ouverture', async () => {
      const { client, received } = createClient();
      const connecting = client.connect();
      const socket = lastSocket();

      socket.simulateOpen();
      socket.simulateMessage(joinedAlice);
      expect(received).toEqual([]);

      await connecting;
      await flushDeliveries();
      expect(received).toEqual([joinedAlice]);
    });

    it('ne livre rien pendant send(), même si le serveur répond aussitôt', async () => {
      const { client, socket, received } = await createConnectedClient();
      vi.spyOn(socket, 'send').mockImplementation(() => socket.simulateMessage(joinedAlice));

      client.send(join);
      expect(received).toEqual([]);

      await flushDeliveries();
      expect(received).toEqual([joinedAlice]);
    });

    it('ignore un message illisible, le signale et livre les suivants', async () => {
      const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { socket, received } = await createConnectedClient();

      socket.simulateMessage('pas du JSON');
      socket.simulateMessage(joinedAlice);
      await flushDeliveries();

      expect(received).toEqual([joinedAlice]);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('WebSocketClient'),
        'pas du JSON',
      );
    });
  });

  describe('abonnements', () => {
    it('livre chaque message à tous les abonnés', async () => {
      const { client, socket, received } = await createConnectedClient();
      const other: ServerMessage[] = [];
      client.onMessage((message) => other.push(message));

      socket.simulateMessage(joinedAlice);
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(other).toEqual([joinedAlice, joinedBob]);
      expect(received).toEqual(other);
    });

    it("n'appelle plus un abonné qui s'est désabonné", async () => {
      const { client, socket } = await createConnectedClient();
      const handler = vi.fn();
      const unsubscribe = client.onMessage(handler);
      socket.simulateMessage(joinedAlice);
      await flushDeliveries();

      unsubscribe();
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("n'appelle pas un abonné retiré par un autre pendant la livraison du même message", async () => {
      const { client, socket } = await createConnectedClient();
      const lateHandler = vi.fn();
      let unsubscribeLate = () => {};
      client.onMessage(() => unsubscribeLate());
      unsubscribeLate = client.onMessage(lateHandler);

      socket.simulateMessage(joinedAlice);
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(lateHandler).not.toHaveBeenCalled();
    });

    it("n'appelle qu'une fois par message une fonction abonnée deux fois", async () => {
      const { client, socket } = await createConnectedClient();
      const handler = vi.fn();
      client.onMessage(handler);
      client.onMessage(handler);

      socket.simulateMessage(joinedAlice);
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('isole un abonné qui échoue : les autres et les messages suivants sont servis', async () => {
      const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const client = new WebSocketClient(URL);
      const failure = new Error('abonné défaillant');
      client.onMessage(() => {
        throw failure;
      });
      const received: ServerMessage[] = [];
      client.onMessage((message) => received.push(message));
      const socket = await open(client);

      socket.simulateMessage(joinedAlice);
      socket.simulateMessage(joinedBob);
      await flushDeliveries();

      expect(received).toEqual([joinedAlice, joinedBob]);
      expect(logError).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('WebSocketClient'), failure);
    });

    it('conserve les abonnements après disconnect()', async () => {
      const { client, received } = createClient();
      const handler = vi.fn();
      client.onMessage(handler);
      await open(client);
      client.disconnect();

      const socket = await open(client);
      socket.simulateMessage(started);
      await flushDeliveries();

      expect(received).toEqual([started]);
      expect(handler).toHaveBeenCalledWith(started);
    });
  });
});
