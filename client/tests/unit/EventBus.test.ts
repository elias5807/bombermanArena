import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';

/** Événements fictifs : le bus est générique et ne connaît pas ceux du jeu. */
interface TestEvents {
  'test:number': number;
  'test:player': { name: string };
  'test:signal': undefined;
}

function createBus(): EventBus<TestEvents> {
  return new EventBus<TestEvents>();
}

describe('EventBus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('publication', () => {
    it("transmet la donnée de l'événement à l'abonné", () => {
      const bus = createBus();
      const handler = vi.fn();
      bus.on('test:player', handler);

      bus.emit('test:player', { name: 'Alice' });

      expect(handler).toHaveBeenCalledExactlyOnceWith({ name: 'Alice' });
    });

    it("atteint tous les abonnés, dans l'ordre d'abonnement", () => {
      const bus = createBus();
      const calls: string[] = [];
      bus.on('test:number', () => calls.push('premier'));
      bus.on('test:number', () => calls.push('second'));

      bus.emit('test:number', 1);

      expect(calls).toEqual(['premier', 'second']);
    });

    it("n'appelle que les abonnés de l'événement publié", () => {
      const bus = createBus();
      const onNumber = vi.fn();
      const onPlayer = vi.fn();
      bus.on('test:number', onNumber);
      bus.on('test:player', onPlayer);

      bus.emit('test:number', 7);

      expect(onNumber).toHaveBeenCalledExactlyOnceWith(7);
      expect(onPlayer).not.toHaveBeenCalled();
    });

    it("ne fait rien quand personne n'est abonné", () => {
      expect(() => createBus().emit('test:number', 1)).not.toThrow();
    });

    it("n'exige pas de donnée pour un événement qui n'en porte pas", () => {
      const bus = createBus();
      const handler = vi.fn();
      bus.on('test:signal', handler);

      bus.emit('test:signal');

      expect(handler).toHaveBeenCalledExactlyOnceWith(undefined);
    });

    it("n'abonne qu'une fois la même fonction au même événement", () => {
      const bus = createBus();
      const handler = vi.fn();
      bus.on('test:number', handler);
      bus.on('test:number', handler);

      bus.emit('test:number', 1);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('permet à un abonné de publier un autre événement', () => {
      const bus = createBus();
      const received = vi.fn();
      bus.on('test:number', (value) => bus.emit('test:player', { name: `joueur-${value}` }));
      bus.on('test:player', received);

      bus.emit('test:number', 3);

      expect(received).toHaveBeenCalledExactlyOnceWith({ name: 'joueur-3' });
    });

    it("accepte les noms d'événements déjà présents sur Object.prototype", () => {
      const bus = new EventBus<Record<string, number>>();
      const onConstructor = vi.fn();
      const onProto = vi.fn();
      bus.on('constructor', onConstructor);
      bus.on('__proto__', onProto);

      bus.emit('constructor', 1);
      bus.emit('__proto__', 2);

      expect(onConstructor).toHaveBeenCalledExactlyOnceWith(1);
      expect(onProto).toHaveBeenCalledExactlyOnceWith(2);
    });
  });

  describe('désabonnement', () => {
    it("la fonction retournée par on retire l'abonné", () => {
      const bus = createBus();
      const handler = vi.fn();
      const unsubscribe = bus.on('test:number', handler);

      unsubscribe();
      bus.emit('test:number', 1);

      expect(handler).not.toHaveBeenCalled();
    });

    it("off retire l'abonné sans toucher aux autres", () => {
      const bus = createBus();
      const removed = vi.fn();
      const kept = vi.fn();
      bus.on('test:number', removed);
      bus.on('test:number', kept);

      bus.off('test:number', removed);
      bus.emit('test:number', 1);

      expect(removed).not.toHaveBeenCalled();
      expect(kept).toHaveBeenCalledTimes(1);
    });

    it('se désabonner deux fois, ou sans être abonné, est sans effet', () => {
      const bus = createBus();
      const kept = vi.fn();
      bus.on('test:number', kept);
      const unsubscribe = bus.on('test:number', vi.fn());

      unsubscribe();
      unsubscribe();
      bus.off('test:number', vi.fn());
      bus.off('test:signal', vi.fn());
      bus.emit('test:number', 1);

      expect(kept).toHaveBeenCalledTimes(1);
    });

    it("n'appelle plus un abonné retiré pendant la publication", () => {
      const bus = createBus();
      const late = vi.fn();
      bus.on('test:number', () => bus.off('test:number', late));
      bus.on('test:number', late);

      bus.emit('test:number', 1);

      expect(late).not.toHaveBeenCalled();
    });

    it("ne publie pas l'événement en cours à un abonné ajouté pendant la publication", () => {
      const bus = createBus();
      const added = vi.fn();
      bus.on('test:number', () => bus.on('test:number', added));

      bus.emit('test:number', 1);
      expect(added).not.toHaveBeenCalled();

      bus.emit('test:number', 2);
      expect(added).toHaveBeenCalledExactlyOnceWith(2);
    });
  });

  describe('once', () => {
    it("n'appelle l'abonné qu'une seule fois", () => {
      const bus = createBus();
      const handler = vi.fn();
      bus.once('test:number', handler);

      bus.emit('test:number', 1);
      bus.emit('test:number', 2);

      expect(handler).toHaveBeenCalledExactlyOnceWith(1);
    });

    it("peut être annulé avant d'avoir reçu l'événement", () => {
      const bus = createBus();
      const handler = vi.fn();
      const cancel = bus.once('test:number', handler);

      cancel();
      bus.emit('test:number', 1);

      expect(handler).not.toHaveBeenCalled();
    });

    it("ne se redéclenche pas quand l'abonné republie le même événement", () => {
      const bus = createBus();
      const handler = vi.fn(() => bus.emit('test:number', 2));
      bus.once('test:number', handler);

      bus.emit('test:number', 1);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('erreur dans un abonné', () => {
    it("signale l'erreur sans empêcher les abonnés suivants de recevoir l'événement", () => {
      const reporter = vi.fn();
      const bus = new EventBus<TestEvents>(reporter);
      const error = new Error('boom');
      const next = vi.fn();
      bus.on('test:number', () => {
        throw error;
      });
      bus.on('test:number', next);

      expect(() => bus.emit('test:number', 1)).not.toThrow();

      expect(reporter).toHaveBeenCalledExactlyOnceWith(error, 'test:number');
      expect(next).toHaveBeenCalledExactlyOnceWith(1);
    });

    it("écrit l'erreur dans la console par défaut", () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bus = createBus();
      const error = new Error('boom');
      bus.on('test:number', () => {
        throw error;
      });

      bus.emit('test:number', 1);

      expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('test:number'),
        error,
      );
    });

    it("laisse le reporter relancer l'erreur, par exemple pour faire échouer un test", () => {
      const bus = new EventBus<TestEvents>((error) => {
        throw error;
      });
      bus.on('test:number', () => {
        throw new Error('boom');
      });

      expect(() => bus.emit('test:number', 1)).toThrow('boom');
    });
  });

  describe('typage', () => {
    // Vérifié par `npm run typecheck` : chaque @ts-expect-error échoue dès que l'erreur disparaît.
    it('refuse à la compilation un événement inconnu ou une donnée du mauvais type', () => {
      const bus = createBus();

      // @ts-expect-error événement absent de TestEvents
      bus.emit('test:inconnu', 1);
      // @ts-expect-error la donnée doit être un nombre
      bus.emit('test:number', 'texte');
      // @ts-expect-error cet événement exige une donnée
      bus.emit('test:number');
      // @ts-expect-error l'abonné reçoit un nombre, pas une chaîne
      bus.on('test:number', (value: string) => value);

      bus.on('test:player', (player) => {
        expectTypeOf(player).toEqualTypeOf<{ name: string }>();
      });
    });
  });
});
