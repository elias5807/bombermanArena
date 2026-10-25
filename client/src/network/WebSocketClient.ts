import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';
import type { CloseHandler, IGameConnection, MessageHandler } from './IGameConnection';

/**
 * Appelle chaque abonné de `handlers` avec `call`. On parcourt une copie : un abonné peut
 * s'abonner ou se désabonner pendant l'appel. Un abonné qui échoue n'empêche pas les autres.
 */
function callEach<Handler>(handlers: ReadonlySet<Handler>, call: (handler: Handler) => void): void {
  for (const handler of [...handlers]) {
    // Un abonné retiré en cours de route n'est plus appelé.
    if (!handlers.has(handler)) {
      continue;
    }
    try {
      call(handler);
    } catch (handlerError) {
      console.error('[WebSocketClient] Erreur dans un handler :', handlerError);
    }
  }
}

/**
 * Connexion WebSocket réelle au serveur de jeu.
 * Implémente le contrat IGameConnection (connexion asynchrone, écoute et envoi de messages,
 * signal des coupures venues du serveur).
 */
export class WebSocketClient implements IGameConnection {
  private socket: WebSocket | null = null;
  /** Ouverture en cours : un second `connect()` l'attend au lieu d'ouvrir une autre socket. */
  private opening: Promise<void> | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private readonly closeHandlers = new Set<CloseHandler>();
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
          // après l'ouverture de la suivante : elle ne doit ni effacer cette dernière, ni
          // passer pour une coupure. Une socket jamais ouverte n'est pas `this.socket` non plus.
          if (this.socket !== ws) {
            return;
          }
          // En microtâche, comme les messages : ceux reçus avant la coupure sont livrés d'abord.
          queueMicrotask(() => {
            // `disconnect()` a pu être appelée entre-temps : la coupure n'est plus signalée.
            if (this.socket === ws) {
              this.socket = null;
              callEach(this.closeHandlers, (handler) => handler());
            }
          });
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

    callEach(this.handlers, (handler) => handler(message));
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
   * Abonne un gestionnaire aux coupures venues du serveur (pas à `disconnect()`).
   */
  onClose(handler: CloseHandler): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
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
