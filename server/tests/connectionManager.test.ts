import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, type WebSocketServer } from 'ws';
import { GameEngine } from '../src/game/GameEngine.js';
import { startConnectionManager } from '../src/network/connectionManager.js';

describe('startConnectionManager', () => {
  let engine: GameEngine;
  let server: WebSocketServer;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    engine = new GameEngine();
    server = startConnectionManager(0, engine);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.terminate();
    }
    await new Promise((resolve) => server.close(resolve));
    vi.restoreAllMocks();
  });

  async function connect(): Promise<WebSocket> {
    const { port } = server.address() as AddressInfo;
    const client = new WebSocket(`ws://localhost:${port}`);
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once('open', resolve);
      client.once('error', reject);
    });
    return client;
  }

  /**
   * Attend que le serveur ait traité ce que ce client a déjà envoyé : il répond au ping
   * dans l'ordre des trames reçues, donc après les messages qui le précèdent.
   */
  async function flush(client: WebSocket): Promise<void> {
    await new Promise((resolve) => {
      client.once('pong', resolve);
      client.ping();
    });
  }

  async function join(playerName: string): Promise<{ client: WebSocket; playerId: string }> {
    const known = new Set(engine.buildLobbyStatus().players.map((p) => p.playerId));
    const client = await connect();
    client.send(JSON.stringify({ type: 'JOIN_LOBBY', playerName }));
    await flush(client);

    const joined = engine.buildLobbyStatus().players.find((p) => !known.has(p.playerId));
    if (!joined) {
      throw new Error(`${playerName} n'a pas pu rejoindre le lobby`);
    }
    return { client, playerId: joined.playerId };
  }

  describe('messages invalides', () => {
    it.each(['null', '42', '"texte"', 'true', '[]', '{', ''])(
      'ignore %j sans interrompre le traitement du client',
      async (payload) => {
        const client = await connect();

        client.send(payload);
        await flush(client);

        client.send(JSON.stringify({ type: 'JOIN_LOBBY', playerName: 'Alice' }));
        await flush(client);
        expect(engine.getPlayersCount()).toBe(1);
      },
    );
  });

  describe('identité du joueur', () => {
    it('déplace le joueur rattaché au socket', async () => {
      const { client, playerId } = await join('Alice');

      client.send(JSON.stringify({ type: 'MOVE', playerId, direction: 'right' }));
      await flush(client);

      expect(engine.getPlayer(playerId)?.col).toBe(2);
    });

    it("refuse le MOVE d'un socket qui n'a pas rejoint le lobby", async () => {
      const { playerId } = await join('Alice');
      const intruder = await connect();

      intruder.send(JSON.stringify({ type: 'MOVE', playerId, direction: 'right' }));
      await flush(intruder);

      expect(engine.getPlayer(playerId)?.col).toBe(1);
    });

    it("refuse le PLACE_BOMB d'un socket qui n'a pas rejoint le lobby", async () => {
      const { playerId } = await join('Alice');
      const placeBomb = vi.spyOn(engine, 'placeBomb');
      const intruder = await connect();

      intruder.send(JSON.stringify({ type: 'PLACE_BOMB', playerId }));
      await flush(intruder);

      expect(placeBomb).not.toHaveBeenCalled();
    });

    it("n'agit jamais sur un autre joueur, même avec son identifiant", async () => {
      const alice = await join('Alice');
      const bob = await join('Bob');
      const bobCol = engine.getPlayer(bob.playerId)?.col;

      alice.client.send(
        JSON.stringify({ type: 'MOVE', playerId: bob.playerId, direction: 'left' }),
      );
      await flush(alice.client);

      expect(engine.getPlayer(bob.playerId)?.col).toBe(bobCol);
      expect(engine.getPlayer(alice.playerId)?.col).toBe(1);
    });
  });

  describe('JOIN_LOBBY répété', () => {
    it('ne crée pas de second joueur pour le même socket', async () => {
      const { client } = await join('Alice');

      client.send(JSON.stringify({ type: 'JOIN_LOBBY', playerName: 'Alice2' }));
      await flush(client);

      expect(engine.buildLobbyStatus().players.map((p) => p.playerName)).toEqual(['Alice']);
    });

    it('libère la place du joueur à la fermeture du socket', async () => {
      const { client } = await join('Alice');

      client.send(JSON.stringify({ type: 'JOIN_LOBBY', playerName: 'Alice2' }));
      await flush(client);
      client.close();

      await vi.waitFor(() => expect(engine.getPlayersCount()).toBe(0));
    });
  });
});
