/** Fonction appelée avec la donnée d'un événement. */
export type EventHandler<TPayload> = (payload: TPayload) => void;

/** Annule un abonnement ; peut être appelée plusieurs fois sans effet. */
export type Unsubscribe = () => void;

/** Signale l'exception qu'un abonné a levée en recevant l'événement `event`. */
export type HandlerErrorReporter = (error: unknown, event: string) => void;

type EventName<TEvents> = keyof TEvents & string;

/** La donnée n'est facultative que pour un événement dont la donnée peut être `undefined`. */
type EmitArgs<TPayload> = undefined extends TPayload ? [payload?: TPayload] : [payload: TPayload];

type SubscriberSets<TEvents> = {
  [K in EventName<TEvents>]?: Set<EventHandler<TEvents[K]>>;
};

function logHandlerError(error: unknown, event: string): void {
  console.error(`[EventBus] Un abonné de "${event}" a échoué :`, error);
}

/**
 * Bus d'événements (publish/subscribe) : seul canal de communication entre les
 * couches du client (réseau, état, entrées, rendu, interface).
 *
 * Le bus ne contient aucune logique métier : il ne connaît ni les noms
 * d'événements ni leur contenu. L'application les décrit dans une carte
 * `TEvents` (nom de l'événement → type de sa donnée), que le compilateur
 * vérifie à chaque publication et à chaque abonnement.
 *
 * @example
 * interface ExampleEvents {
 *   'input:move': { direction: 'up' | 'down' | 'left' | 'right' };
 *   'input:bomb': undefined;
 * }
 *
 * const bus = new EventBus<ExampleEvents>();
 * const unsubscribe = bus.on('input:move', ({ direction }) => console.log(direction));
 * bus.emit('input:move', { direction: 'up' });
 * bus.emit('input:bomb'); // pas de donnée à fournir
 * unsubscribe();
 */
export class EventBus<TEvents extends object> {
  // Sans prototype : des noms comme `constructor` ou `__proto__` restent des clés ordinaires.
  private readonly subscribers: SubscriberSets<TEvents> = Object.create(null);
  private readonly reportHandlerError: HandlerErrorReporter;

  /**
   * @param reportHandlerError Appelée quand un abonné lève une exception ; écrit dans la console
   *   par défaut. Un test peut fournir une fonction qui relance l'erreur pour ne pas l'avaler.
   */
  constructor(reportHandlerError: HandlerErrorReporter = logHandlerError) {
    this.reportHandlerError = reportHandlerError;
  }

  /**
   * Abonne `handler` à `event`. Abonner deux fois la même fonction au même
   * événement n'a pas d'effet supplémentaire.
   *
   * @returns la fonction qui annule cet abonnement.
   */
  on<K extends EventName<TEvents>>(event: K, handler: EventHandler<TEvents[K]>): Unsubscribe {
    let handlers = this.subscribers[event];
    if (!handlers) {
      handlers = new Set();
      this.subscribers[event] = handlers;
    }
    handlers.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Comme `on`, mais l'abonnement prend fin après la première réception.
   * Pour l'annuler avant, utiliser la fonction retournée : `off` ne reconnaît
   * pas `handler`, qui est enveloppé.
   */
  once<K extends EventName<TEvents>>(event: K, handler: EventHandler<TEvents[K]>): Unsubscribe {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  /** Retire `handler` de `event`. Sans effet s'il n'y était pas abonné. */
  off<K extends EventName<TEvents>>(event: K, handler: EventHandler<TEvents[K]>): void {
    this.subscribers[event]?.delete(handler);
  }

  /**
   * Publie `event` auprès de ses abonnés, de façon synchrone et dans l'ordre
   * d'abonnement. La donnée peut être omise si l'événement n'en porte pas.
   *
   * Un abonné qui lève une exception est signalé au `HandlerErrorReporter` du
   * bus, sans empêcher les suivants de recevoir l'événement.
   */
  emit<K extends EventName<TEvents>>(event: K, ...args: EmitArgs<TEvents[K]>): void {
    const handlers = this.subscribers[event];
    if (!handlers) {
      return;
    }

    // `payload` n'est `undefined` que si le type de l'événement l'accepte (voir EmitArgs).
    const payload = args[0] as TEvents[K];

    // On parcourt une copie : un abonné peut s'abonner ou se désabonner pendant la publication.
    for (const handler of [...handlers]) {
      // Un abonné retiré en cours de route n'est plus appelé : sa couche est peut-être détruite.
      if (!handlers.has(handler)) {
        continue;
      }
      try {
        handler(payload);
      } catch (error) {
        this.reportHandlerError(error, event);
      }
    }
  }
}
