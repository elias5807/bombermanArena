import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';
import { MockServerAdapter, type Scenario } from '../../src/network/MockServerAdapter';

const joinedAlice: ServerMessage = { type: 'PLAYER_JOINED', playerId: 'p1', playerName: 'Alice' };
const joinedBob: ServerMessage = { type: 'PLAYER_JOINED', playerId: 'p2', playerName: 'Bob' };
const started: ServerMessage = { type: 'GAME_STARTED', players: ['p1', 'p2'] };

/** Alice arrive à 100 ms, Bob à 300 ms, puis la partie démarre à 350 ms. */
const scenario: Scenario = {
  name: 'test',
  steps: [
    { delayMs: 100, message: joinedAlice },
    { delayMs: 200, message: joinedBob },
    { delayMs: 50, message: started },
  ],
};

const join: ClientMessage = { type: 'JOIN_LOBBY', playerName: 'Alice' };
const move: ClientMessage = { type: 'MOVE', playerId: 'p1', direction: 'up' };

/** Crée un serveur simulé dont les messages reçus s'accumulent dans `received`. */
function createAdapter(withScenario: Scenario = scenario) {
  const adapter = new MockServerAdapter(withScenario);
  const received: ServerMessage[] = [];
  adapter.onMessage((message) => received.push(message));
  return { adapter, received };
}

describe('MockServerAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rejeu du scénario', () => {
    it("ne livre rien tant que la connexion n'est pas ouverte", () => {
      const { received } = createAdapter();

      vi.advanceTimersByTime(1000);

      expect(received).toEqual([]);
    });

    it('livre les messages dans l’ordre du scénario', async () => {
      const { adapter, received } = createAdapter();

      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(received).toEqual([joinedAlice, joinedBob, started]);
    });

    it('respecte le délai de chaque message', async () => {
      const { adapter, received } = createAdapter();
      await adapter.connect();

      vi.advanceTimersByTime(99);
      expect(received).toEqual([]);

      vi.advanceTimersByTime(1); // 100 ms : Alice
      expect(received).toEqual([joinedAlice]);

      vi.advanceTimersByTime(199); // 299 ms : Bob n'est pas encore là
      expect(received).toEqual([joinedAlice]);

      vi.advanceTimersByTime(1); // 300 ms : Bob
      expect(received).toEqual([joinedAlice, joinedBob]);

      vi.advanceTimersByTime(49); // 349 ms : la partie n'a pas encore démarré
      expect(received).toEqual([joinedAlice, joinedBob]);

      vi.advanceTimersByTime(1); // 350 ms : démarrage
      expect(received).toEqual([joinedAlice, joinedBob, started]);
    });

    it('livre toujours de façon asynchrone, même avec un délai nul', async () => {
      const { adapter, received } = createAdapter({
        name: 'immédiat',
        steps: [{ delayMs: 0, message: joinedAlice }],
      });

      await adapter.connect();
      expect(received).toEqual([]);

      vi.advanceTimersByTime(0);
      expect(received).toEqual([joinedAlice]);
    });

    it("garde l'ordre de messages qui arrivent sans délai entre eux", async () => {
      const { adapter, received } = createAdapter({
        name: 'simultanés',
        steps: [
          { delayMs: 0, message: joinedAlice },
          { delayMs: 0, message: joinedBob },
          { delayMs: 0, message: started },
        ],
      });

      await adapter.connect();
      vi.runAllTimers();

      expect(received).toEqual([joinedAlice, joinedBob, started]);
    });

    it("n'envoie rien pour un scénario vide", async () => {
      const { adapter, received } = createAdapter({ name: 'vide', steps: [] });

      await adapter.connect();
      vi.advanceTimersByTime(1000);

      expect(received).toEqual([]);
    });

    it('livre une copie neuve : modifier un message ne change ni le scénario ni le rejeu', async () => {
      const adapter = new MockServerAdapter(scenario);
      const names: string[] = [];
      adapter.onMessage((message) => {
        if (message.type === 'PLAYER_JOINED') {
          names.push(message.playerName); // lu avant la modification
          message.playerName = 'modifié par un abonné';
        }
      });

      await adapter.connect();
      vi.advanceTimersByTime(350);
      adapter.disconnect();
      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(names).toEqual(['Alice', 'Bob', 'Alice', 'Bob']);
      expect(scenario.steps[0].message).toEqual({
        type: 'PLAYER_JOINED',
        playerId: 'p1',
        playerName: 'Alice',
      });
    });
  });

  describe('connexion', () => {
    it('se résout une fois la connexion ouverte', async () => {
      const { adapter } = createAdapter();

      await expect(adapter.connect()).resolves.toBeUndefined();
    });

    it('est sans effet si la connexion est déjà ouverte : le scénario ne repart pas', async () => {
      const { adapter, received } = createAdapter();
      await adapter.connect();
      vi.advanceTimersByTime(150); // Alice est arrivée

      await adapter.connect();
      vi.advanceTimersByTime(200);

      expect(received).toEqual([joinedAlice, joinedBob, started]);
    });

    it('interrompt le rejeu quand on se déconnecte', async () => {
      const { adapter, received } = createAdapter();
      await adapter.connect();
      vi.advanceTimersByTime(100);

      adapter.disconnect();
      vi.advanceTimersByTime(1000);

      expect(received).toEqual([joinedAlice]);
    });

    it('rejoue le scénario depuis le début après une reconnexion, avec les mêmes abonnés', async () => {
      const { adapter, received } = createAdapter();
      await adapter.connect();
      vi.advanceTimersByTime(100);
      adapter.disconnect();

      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(received).toEqual([joinedAlice, joinedAlice, joinedBob, started]);
    });

    it('accepte qu’on se déconnecte sans être connecté, ou deux fois de suite', () => {
      const { adapter } = createAdapter();

      expect(() => {
        adapter.disconnect();
        adapter.disconnect();
      }).not.toThrow();
    });

    it('permet à un abonné de fermer la connexion pendant la livraison', async () => {
      const { adapter, received } = createAdapter();
      adapter.onMessage(() => adapter.disconnect());

      await adapter.connect();
      vi.advanceTimersByTime(1000);

      expect(received).toEqual([joinedAlice]);
    });
  });

  describe('abonnements', () => {
    it('livre chaque message à tous les abonnés', async () => {
      const { adapter, received } = createAdapter();
      const other: ServerMessage[] = [];
      adapter.onMessage((message) => other.push(message));

      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(other).toEqual([joinedAlice, joinedBob, started]);
      expect(received).toEqual(other);
    });

    it("n'appelle plus un abonné qui s'est désabonné", async () => {
      const { adapter } = createAdapter();
      const handler = vi.fn();
      const unsubscribe = adapter.onMessage(handler);
      await adapter.connect();
      vi.advanceTimersByTime(100);

      unsubscribe();
      vi.advanceTimersByTime(250);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("n'appelle pas un abonné retiré par un autre pendant la livraison du même message", async () => {
      const adapter = new MockServerAdapter(scenario);
      const lateHandler = vi.fn();
      let unsubscribeLate = () => {};
      adapter.onMessage(() => unsubscribeLate());
      unsubscribeLate = adapter.onMessage(lateHandler);

      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(lateHandler).not.toHaveBeenCalled();
    });

    it("n'appelle qu'une fois par message une fonction abonnée deux fois", async () => {
      const { adapter } = createAdapter();
      const handler = vi.fn();
      adapter.onMessage(handler);
      adapter.onMessage(handler);

      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('isole un abonné qui échoue : les autres et les messages suivants sont servis', async () => {
      const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const adapter = new MockServerAdapter(scenario);
      const failure = new Error('abonné défaillant');
      adapter.onMessage(() => {
        throw failure;
      });
      const received: ServerMessage[] = [];
      adapter.onMessage((message) => received.push(message));

      await adapter.connect();
      vi.advanceTimersByTime(350);

      expect(received).toEqual([joinedAlice, joinedBob, started]);
      expect(logError).toHaveBeenCalledTimes(3);
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('MockServerAdapter'), failure);
    });
  });

  describe('envoi de messages', () => {
    it("refuse d'envoyer tant que la connexion n'est pas ouverte", () => {
      const { adapter } = createAdapter();

      expect(() => adapter.send(join)).toThrow(/connexion/);
      expect(adapter.sentMessages).toEqual([]);
    });

    it("refuse d'envoyer après la déconnexion", async () => {
      const { adapter } = createAdapter();
      await adapter.connect();
      adapter.disconnect();

      expect(() => adapter.send(join)).toThrow(/connexion/);
    });

    it('garde les messages envoyés, dans l’ordre', async () => {
      const { adapter } = createAdapter();
      await adapter.connect();

      adapter.send(join);
      adapter.send(move);

      expect(adapter.sentMessages).toEqual([join, move]);
    });

    it('garde une copie : modifier le message après l’envoi ne change pas ce qui a été envoyé', async () => {
      const { adapter } = createAdapter();
      await adapter.connect();
      const message: ClientMessage = { type: 'MOVE', playerId: 'p1', direction: 'up' };

      adapter.send(message);
      message.direction = 'down';

      expect(adapter.sentMessages).toEqual([move]);
    });
  });
});
