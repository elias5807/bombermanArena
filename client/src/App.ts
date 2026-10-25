import { CONNECTION_MODE, SERVER_URL, type ConnectionMode } from './config';
import type { AppEventBus, AppEvents } from './core/AppEvents';
import { EventBus } from './core/EventBus';
import { gameSessionScenario } from './mocks/fixtures/game-session.fixture';
import { bridgeConnection } from './network/connectionBridge';
import type { IGameConnection } from './network/IGameConnection';
import { MockServerAdapter } from './network/MockServerAdapter';
import { WebSocketClient } from './network/WebSocketClient';
import { GameState } from './state/GameState';

/**
 * Choisit la connexion au serveur de jeu. C'est le seul endroit du client qui
 * sait laquelle est utilisée : les couches ne voient que `IGameConnection`.
 */
export function createConnection(mode: ConnectionMode): IGameConnection {
  switch (mode) {
    case 'mock':
      return new MockServerAdapter(gameSessionScenario);
    case 'server':
      return new WebSocketClient(SERVER_URL);
  }
}

/**
 * Assemblage de l'application : crée le bus d'événements et l'état de la partie,
 * choisit la connexion et les relie. Les couches reçoivent `bus` (et lisent
 * `state`) ; elles ne se connaissent pas entre elles.
 *
 * @example
 * const app = new App();
 * app.bus.on('server:LOBBY_STATUS', ({ players }) => console.log(players));
 * await app.start();
 */
export class App {
  /** Le bus de l'application : la seule instance, à transmettre aux couches. */
  readonly bus: AppEventBus = new EventBus<AppEvents>();
  /** Ce que le client sait de la partie, déduit du bus : la seule instance. */
  readonly state = new GameState(this.bus);

  private readonly connection: IGameConnection;
  /** Défait le pont connexion ↔ bus. Défini tant que l'application est démarrée. */
  private unbridge: (() => void) | undefined;
  private connectionOpened = false;

  /**
   * @param connection Connexion à utiliser ; par défaut celle que désigne la configuration
   *   (`CONNECTION_MODE`). Un test fournit la sienne.
   */
  constructor(connection: IGameConnection = createConnection(CONNECTION_MODE)) {
    this.connection = connection;
  }

  /**
   * Relie la connexion au bus, puis l'ouvre. S'abonner au bus avant, pour ne
   * manquer aucun événement. Sans effet si l'application est déjà démarrée.
   *
   * La promesse n'est jamais rejetée : si la connexion ne s'ouvre pas,
   * `connection:error` est publié et l'application reste arrêtée, prête pour un
   * nouveau `start()`.
   */
  async start(): Promise<void> {
    if (this.unbridge) {
      return;
    }
    // Le pont est posé avant l'ouverture : un message reçu sans abonné serait perdu.
    const unbridge = bridgeConnection(this.connection, this.bus);
    this.unbridge = unbridge;

    let failure: { error: unknown } | undefined;
    try {
      await this.connection.connect();
    } catch (error) {
      failure = { error };
    }

    // `stop()` a pu être appelée pendant l'ouverture : ce démarrage ne compte plus.
    if (this.unbridge !== unbridge) {
      return;
    }
    if (failure) {
      this.stop();
      this.bus.emit('connection:error', failure);
      return;
    }
    this.connectionOpened = true;
    this.bus.emit('connection:opened');
  }

  /**
   * Ferme la connexion et défait le pont : plus aucun événement `server:*`
   * n'est publié, et les `input:*` ne sont plus envoyés. Sans effet si
   * l'application est déjà arrêtée. Elle peut être redémarrée avec `start()`.
   */
  stop(): void {
    if (!this.unbridge) {
      return;
    }
    this.unbridge();
    this.unbridge = undefined;
    this.connection.disconnect();

    if (this.connectionOpened) {
      this.connectionOpened = false;
      this.bus.emit('connection:closed');
    }
  }
}
