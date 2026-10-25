import type { AppEventBus } from '../core/AppEvents';

/** Message affiché quand la connexion ouverte s'est coupée. */
export const CONNECTION_LOST_MESSAGE = 'Connexion au serveur perdue.';

/** Message affiché quand le serveur ne répond pas à l'adresse `serverUrl`. */
export function unreachableMessage(serverUrl: string): string {
  return `Serveur injoignable à l'adresse ${serverUrl}. Vérifiez qu'il est lancé, puis réessayez.`;
}

/** Les éléments de l'écran de connexion que `ConnectionStatus` tient à jour. */
export interface ConnectionStatusElements {
  /** Encart du message et du bouton « Réessayer », masqué quand tout va bien. */
  panel: HTMLElement;
  message: HTMLElement;
  retryButton: HTMLButtonElement;
  /** « Rejoindre la salle d'attente » : actif seulement quand la connexion est ouverte. */
  joinButton: HTMLButtonElement;
}

export interface ConnectionStatusOptions {
  /** Adresse du serveur, citée quand il est injoignable. */
  serverUrl: string;
  /** Relance la connexion (`app.start()`) : appelée par « Réessayer ». */
  retry: () => void;
}

/**
 * État de la connexion sur l'écran de connexion, tenu à jour d'après le bus :
 *
 * - `connection:error` avant l'ouverture : le serveur est injoignable, son adresse
 *   est affichée avec le bouton « Réessayer » ;
 * - `connection:lost` : la connexion s'est coupée, même message d'échec ;
 * - `connection:opened` : l'encart disparaît et « Rejoindre » devient actif.
 *
 * « Rejoindre » reste désactivé tant que la connexion n'est pas ouverte. Une erreur
 * reçue connexion ouverte (un envoi qui échoue) ne change rien à l'affichage.
 * Les textes passent par `textContent`.
 */
export class ConnectionStatus {
  private readonly elements: ConnectionStatusElements;
  private readonly options: ConnectionStatusOptions;
  private open = false;
  private readonly unsubscribers: (() => void)[];

  constructor(
    elements: ConnectionStatusElements,
    bus: AppEventBus,
    options: ConnectionStatusOptions,
  ) {
    this.elements = elements;
    this.options = options;
    this.unsubscribers = [
      bus.on('connection:opened', () => {
        this.open = true;
        this.hide();
      }),
      bus.on('connection:closed', () => {
        this.open = false;
        this.hide();
      }),
      bus.on('connection:lost', () => {
        this.open = false;
        this.show(CONNECTION_LOST_MESSAGE);
      }),
      bus.on('connection:error', () => {
        if (!this.open) {
          this.show(unreachableMessage(this.options.serverUrl));
        }
      }),
    ];
    elements.retryButton.addEventListener('click', this.handleRetry);
    this.hide();
  }

  /** Se désabonne du bus et du bouton « Réessayer ». */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.elements.retryButton.removeEventListener('click', this.handleRetry);
  }

  private readonly handleRetry = (): void => {
    const { message, retryButton } = this.elements;
    message.textContent = `Connexion à ${this.options.serverUrl}...`;
    retryButton.disabled = true;
    this.options.retry();
  };

  private show(text: string): void {
    const { panel, message, retryButton } = this.elements;
    message.textContent = text;
    retryButton.disabled = false;
    panel.hidden = false;
    this.updateJoinButton();
  }

  private hide(): void {
    this.elements.panel.hidden = true;
    this.updateJoinButton();
  }

  private updateJoinButton(): void {
    this.elements.joinButton.disabled = !this.open;
  }
}
