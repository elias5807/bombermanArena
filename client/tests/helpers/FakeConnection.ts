import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';
import type { IGameConnection, MessageHandler } from '../../src/network/IGameConnection';

/**
 * Fausse connexion pilotée par le test : il décide de ce que le serveur envoie
 * (`receive`), de l'issue de `connect()` et de l'état de la connexion (`open`).
 */
export class FakeConnection implements IGameConnection {
  /** Messages passés à `send`, dans l'ordre. */
  readonly sent: ClientMessage[] = [];
  /** `send` lève une erreur tant que la connexion est fermée, comme le veut le contrat. */
  open = false;
  connectCalls = 0;
  disconnectCalls = 0;
  /** Issue de `connect()` : à remplacer pour simuler un serveur injoignable ou lent. */
  connectOutcome: () => Promise<void> = () => Promise.resolve();

  private readonly handlers = new Set<MessageHandler>();

  /** Nombre d'abonnés aux messages du serveur. */
  get handlerCount(): number {
    return this.handlers.size;
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    await this.connectOutcome();
    this.open = true;
  }

  send(message: ClientMessage): void {
    if (!this.open) {
      throw new Error('FakeConnection : la connexion est fermée.');
    }
    this.sent.push(message);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.open = false;
  }

  /** Simule l'arrivée d'un message du serveur. */
  receive(message: ServerMessage): void {
    for (const handler of [...this.handlers]) {
      handler(message);
    }
  }
}
