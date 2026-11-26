import type { AppEventBus } from '../core/AppEvents';

/** Les écrans de `index.html`, dont un seul est visible à la fois. */
export type ScreenName = 'login' | 'lobby' | 'game';

/** Pseudo envoyé quand le champ est laissé vide. */
export const DEFAULT_PLAYER_NAME = 'VoleurInconnu';

/** Une vue de `ui/` branchée sur le bus, à démonter en fin de session. */
export interface Disposable {
  dispose(): void;
}

/** La connexion au serveur, vue par la navigation : `App` la fournit. */
export interface SessionControl {
  /** Ouvre une connexion neuve. */
  start(): Promise<void>;
  /** Ferme la connexion : le serveur retire le joueur. */
  stop(): void;
}

/** Les éléments de `index.html` que `ScreenNavigator` affiche ou écoute. */
export interface NavigationElements {
  screens: Readonly<Record<ScreenName, HTMLElement>>;
  pseudoInput: HTMLInputElement;
  /** « Rejoindre la salle d'attente » : actif seulement connexion ouverte (`ConnectionStatus`). */
  joinButton: HTMLButtonElement;
  /** « Lancer la partie », dans le salon. */
  startButton: HTMLButtonElement;
  /** « Retour au login », dans le salon. */
  leaveLobbyButton: HTMLButtonElement;
  /** « Quitter », pendant la partie. */
  quitButton: HTMLButtonElement;
}

export interface NavigationDependencies {
  session: SessionControl;
  /**
   * Crée les vues d'une session (salon, HUD, chrono, fin de partie), branchées sur le bus.
   * Appelée à la création de la navigation, puis à chaque retour à l'écran de connexion.
   */
  mountSessionViews: () => readonly Disposable[];
}

/**
 * Navigation entre les écrans de `index.html` : connexion, salle d'attente et partie.
 *
 * - « Rejoindre », ou Entrée dans le champ du pseudo, publie `input:join` puis affiche le salon ;
 * - « Lancer la partie » publie `input:start` puis affiche la partie, que `server:GAME_STARTED`
 *   affiche aussi chez les autres joueurs. Le plateau (`GameView`) suit le serveur, pas l'écran ;
 * - « Retour au login » et « Quitter » ferment la connexion, ce qui retire le joueur du
 *   serveur, puis en ouvrent une neuve ;
 * - `connection:lost` ramène aussi à l'écran de connexion.
 *
 * Revenir à l'écran de connexion remet la session à zéro : les vues sont recréées par
 * `mountSessionViews`.
 *
 * La navigation vit aussi longtemps que la page : elle n'a rien à libérer.
 *
 * @example
 * const navigation = new ScreenNavigator(elements, app.bus, {
 *   session: app,
 *   mountSessionViews: () => [new GameTimer(timerElement, app.bus)],
 * });
 * navigation.screen; // 'login'
 */
export class ScreenNavigator {
  private readonly elements: NavigationElements;
  private readonly bus: AppEventBus;
  private readonly session: SessionControl;
  private readonly mountSessionViews: () => readonly Disposable[];
  private sessionViews: readonly Disposable[];
  private current: ScreenName = 'login';

  constructor(
    elements: NavigationElements,
    bus: AppEventBus,
    { session, mountSessionViews }: NavigationDependencies,
  ) {
    this.elements = elements;
    this.bus = bus;
    this.session = session;
    this.mountSessionViews = mountSessionViews;
    this.sessionViews = mountSessionViews();
    this.show('login');

    bus.on('connection:lost', () => this.returnToLogin());
    bus.on('server:GAME_STARTED', () => this.show('game'));

    elements.joinButton.addEventListener('click', () => this.join());
    elements.pseudoInput.addEventListener('keydown', (event) => {
      // Un clic ne fait rien tant que le bouton est désactivé (connexion pas encore ouverte).
      if (event.key === 'Enter') {
        elements.joinButton.click();
      }
    });
    elements.startButton.addEventListener('click', () => {
      bus.emit('input:start');
      this.show('game');
    });
    elements.leaveLobbyButton.addEventListener('click', () => this.leave());
    elements.quitButton.addEventListener('click', () => this.leave());
  }

  /** L'écran visible. */
  get screen(): ScreenName {
    return this.current;
  }

  private join(): void {
    const playerName = this.elements.pseudoInput.value.trim() || DEFAULT_PLAYER_NAME;
    this.bus.emit('input:join', { playerName });
    this.show('lobby');
  }

  /** Quitte le salon ou la partie : le serveur retire le joueur quand sa connexion se ferme. */
  private leave(): void {
    this.session.stop();
    this.returnToLogin();
    void this.session.start();
  }

  private returnToLogin(): void {
    for (const view of this.sessionViews) {
      view.dispose();
    }
    this.sessionViews = this.mountSessionViews();
    this.show('login');
  }

  private show(screen: ScreenName): void {
    this.current = screen;
    for (const [name, element] of Object.entries(this.elements.screens)) {
      element.classList.toggle('hidden', name !== screen);
    }
  }
}
