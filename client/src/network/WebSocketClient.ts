import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';
import type { IGameConnection, MessageHandler } from './IGameConnection';

/**
 * Connexion WebSocket réelle au serveur de jeu.
 * Implémente le contrat IGameConnection (connexion asynchrone, écoute et envoi de messages).
 */
export class WebSocketClient implements IGameConnection {
  private socket: WebSocket | null = null;
  /** Ouverture en cours : un second `connect()` l'attend au lieu d'ouvrir une autre socket. */
  private opening: Promise<void> | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Ouvre la connexion WebSocket vers le serveur.
   * La promesse se résout quand la connexion est établie et prête à échanger.
   */
  connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (!this.opening) {
      this.opening = this.open().finally(() => {
        this.opening = null;
      });
    }
    return this.opening;
  }

  private open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);

        const onOpen = () => {
          cleanup();
          this.socket = ws;
          resolve();
        };

        const onError = () => {
          cleanup();
          reject(new Error(`WebSocketClient : impossible de se connecter à ${this.url}`));
        };

        const onClose = (event: CloseEvent) => {
          cleanup();
          reject(new Error(`WebSocketClient : connexion fermée avant ouverture (${event.code})`));
        };

        const cleanup = () => {
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('error', onError);
          ws.removeEventListener('close', onClose);
        };

        ws.addEventListener('open', onOpen);
        ws.addEventListener('error', onError);
        ws.addEventListener('close', onClose);

        ws.addEventListener('message', (event) => {
          let message: ServerMessage;
          try {
            message = JSON.parse(String(event.data)) as ServerMessage;
          } catch {
            console.error('[WebSocketClient] Message invalide reçu du serveur :', event.data);
            return;
          }

          // Livraison asynchrone (microtask) conformément au contrat IGameConnection
          queueMicrotask(() => this.deliver(ws, message));
        });

        ws.addEventListener('close', () => {
          // Une socket fermée par `disconnect()` signale sa fermeture plus tard, parfois
          // après l'ouverture de la suivante : elle ne doit pas effacer cette dernière.
          if (this.socket === ws) {
            this.socket = null;
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Livre aux abonnés un message reçu par la socket `from`. */
  private deliver(from: WebSocket, message: ServerMessage): void {
    // Arrivé avant `disconnect()` mais pas encore livré : il ne l'est jamais.
    if (this.socket !== from) {
      return;
    }

    // On parcourt une copie : un abonné peut s'abonner ou se désabonner pendant la livraison.
    for (const handler of [...this.handlers]) {
      // Un abonné retiré en cours de route ne reçoit plus rien, pas même ce message.
      if (!this.handlers.has(handler)) {
        continue;
      }
      try {
        handler(message);
      } catch (handlerError) {
        console.error('[WebSocketClient] Erreur dans un handler :', handlerError);
      }
    }
  }

  /**
   * Envoie un message au serveur sous forme sérialisée JSON.
   */
  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocketClient : la connexion n'est pas ouverte.");
    }
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Abonne un gestionnaire aux messages entrants du serveur.
   */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Ferme proprement la connexion WebSocket.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
