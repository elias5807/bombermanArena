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
 * Scénario écrit pour le joueur local : rejoué quand le client envoie `JOIN_LOBBY`, et
 * non dès la connexion, comme le vrai serveur qui ne dit rien à un client hors du lobby.
 */
export interface JoinScenario {
  readonly name: string;
  /** Les messages que reçoit le joueur `playerName` après son `JOIN_LOBBY`, dans cet ordre. */
  stepsFor(playerName: string): readonly ScenarioStep[];
}

function isJoinScenario(scenario: Scenario | JoinScenario): scenario is JoinScenario {
  return 'stepsFor' in scenario;
}

/**
 * Serveur simulé derrière `IGameConnection` : permet de lancer et de tester le
 * client sans serveur, avec de fausses données (mode hors ligne).
 *
 * Il rejoue son scénario : chaque message est livré aux abonnés une fois son
 * délai écoulé, dans l'ordre. Un `Scenario` démarre dès la connexion ; un
 * `JoinScenario` démarre à chaque `JOIN_LOBBY` reçu, depuis le début. Après
 * `disconnect()`, le rejeu s'arrête et reprend du début à la connexion suivante.
 *
 * C'est sa seule réaction : le reste de ce que le client envoie est seulement
 * enregistré (`sentMessages`). Pour répondre aux déplacements ou aux bombes, il
 * faudrait refaire les règles de jeu du serveur dans le client.
 *
 * @example
 * const connection: IGameConnection = new MockServerAdapter(gameSessionScenario);
 * connection.onMessage((message) => console.log(message.type));
 * await connection.connect();
 * connection.send({ type: 'JOIN_LOBBY', playerName: 'Louka' }); // lance le rejeu
 */
export class MockServerAdapter implements IGameConnection {
  private readonly scenario: Scenario | JoinScenario;
  private readonly handlers = new Set<MessageHandler>();
  private readonly sent: ClientMessage[] = [];
  private connected = false;
  /** Étapes du rejeu en cours. */
  private steps: readonly ScenarioStep[] = [];
  private nextStep = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(scenario: Scenario | JoinScenario) {
    this.scenario = scenario;
  }

  /** Messages envoyés au serveur simulé depuis sa création, dans l'ordre. Utile aux tests. */
  get sentMessages(): readonly ClientMessage[] {
    return this.sent;
  }

  connect(): Promise<void> {
    if (!this.connected) {
      this.connected = true;
      if (!isJoinScenario(this.scenario)) {
        this.replay(this.scenario.steps);
      }
    }
    return Promise.resolve();
  }

  send(message: ClientMessage): void {
    if (!this.connected) {
      throw new Error("MockServerAdapter : envoi impossible, la connexion n'est pas ouverte.");
    }
    // Une copie, comme si le message avait été sérialisé : l'appelant peut le modifier ensuite.
    this.sent.push(structuredClone(message));

    if (message.type === 'JOIN_LOBBY' && isJoinScenario(this.scenario)) {
      this.replay(this.scenario.stepsFor(message.playerName));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Le serveur simulé ne se coupe jamais de lui-même : l'abonné n'est jamais appelé.
   * Seul `disconnect()` ferme la connexion, et le contrat ne la signale pas.
   */
  onClose(): () => void {
    return () => undefined;
  }

  disconnect(): void {
    this.connected = false;
    this.stopReplay();
  }

  /** Rejoue `steps` depuis le début, à la place du rejeu en cours. */
  private replay(steps: readonly ScenarioStep[]): void {
    this.stopReplay();
    this.steps = steps;
    this.nextStep = 0;
    this.scheduleNextStep();
  }

  private stopReplay(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private scheduleNextStep(): void {
    if (this.nextStep >= this.steps.length) {
      return;
    }
    const { delayMs, message } = this.steps[this.nextStep];

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
    // peut la modifier sans altérer le scénario, qui peut être rejoué ensuite.
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
