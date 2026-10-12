import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';
import type { IGameConnection, MessageHandler } from './IGameConnection';

/** Un message du serveur simulé et le moment où il arrive. */
export interface ScenarioStep {
  /** Attente, en millisecondes, après le message précédent (ou après la connexion). */
  readonly delayMs: number;
  readonly message: ServerMessage;
}

/** Messages que le serveur simulé envoie après la connexion, dans cet ordre. */
export interface Scenario {
  readonly name: string;
  readonly steps: readonly ScenarioStep[];
}

/**
 * Serveur simulé derrière `IGameConnection` : permet de lancer et de tester le
 * client sans serveur, avec de fausses données (mode hors ligne).
 *
 * Dès la connexion, il rejoue son scénario : chaque message est livré aux
 * abonnés une fois son délai écoulé, dans l'ordre. Après `disconnect()`, une
 * nouvelle connexion rejoue le scénario depuis le début.
 *
 * Il ne réagit pas à ce que le client envoie : les réponses du vrai serveur
 * dépendent de règles de jeu que le protocole ne décrit pas encore.
 *
 * @example
 * const connection: IGameConnection = new MockServerAdapter(gameSessionScenario);
 * connection.onMessage((message) => console.log(message.type));
 * await connection.connect();
 */
export class MockServerAdapter implements IGameConnection {
  private readonly scenario: Scenario;
  private readonly handlers = new Set<MessageHandler>();
  private readonly sent: ClientMessage[] = [];
  private connected = false;
  private nextStep = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
  }

  /** Messages envoyés au serveur simulé depuis sa création, dans l'ordre. Utile aux tests. */
  get sentMessages(): readonly ClientMessage[] {
    return this.sent;
  }

  connect(): Promise<void> {
    if (!this.connected) {
      this.connected = true;
      this.nextStep = 0;
      this.scheduleNextStep();
    }
    return Promise.resolve();
  }

  send(message: ClientMessage): void {
    if (!this.connected) {
      throw new Error("MockServerAdapter : envoi impossible, la connexion n'est pas ouverte.");
    }
    // Une copie, comme si le message avait été sérialisé : l'appelant peut le modifier ensuite.
    this.sent.push(structuredClone(message));
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  disconnect(): void {
    this.connected = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private scheduleNextStep(): void {
    if (this.nextStep >= this.scenario.steps.length) {
      return;
    }
    const { delayMs, message } = this.scenario.steps[this.nextStep];

    this.timer = setTimeout(() => {
      this.nextStep += 1;
      // Le suivant est programmé avant la livraison : si un abonné appelle
      // `disconnect()`, il est annulé comme n'importe quel autre.
      this.scheduleNextStep();
      this.deliver(message);
    }, delayMs);
  }

  private deliver(message: ServerMessage): void {
    // Une copie neuve, comme après le décodage d'un vrai message JSON : un abonné
    // peut la modifier sans altérer le scénario, qui sera rejoué à la prochaine connexion.
    const received = structuredClone(message);

    // On parcourt une copie : un abonné peut s'abonner ou se désabonner pendant la livraison.
    for (const handler of [...this.handlers]) {
      // Un abonné retiré en cours de route ne reçoit plus rien : sa couche est peut-être détruite.
      if (!this.handlers.has(handler)) {
        continue;
      }
      try {
        handler(received);
      } catch (error) {
        console.error('[MockServerAdapter] Un abonné a échoué :', error);
      }
    }
  }
}
