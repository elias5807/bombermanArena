import type { ConnectionStatusElements } from './connectionStatus';
import type { HelpPanelElements } from './helpPanel';
import type { LobbyElements } from './lobbyList';
import type { NavigationElements } from './screenNavigator';

/** Un type d'élément du DOM, tel que `HTMLButtonElement`, vérifié par `instanceof`. */
export type ElementType<T extends Element> = new () => T;

/**
 * L'élément de `root` que désigne `selector`, s'il a le type attendu.
 *
 * @throws Error qui cite `selector` si l'élément manque ou n'a pas le type attendu : un `id`
 *   renommé dans `index.html` se signale au démarrage, pas au premier clic.
 */
export function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  type: ElementType<T>,
): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`index.html : élément « ${selector} » introuvable.`);
  }
  if (!(element instanceof type)) {
    throw new Error(
      `index.html : « ${selector} » est un ${element.constructor.name}, ${type.name} attendu.`,
    );
  }
  return element;
}

/** Les éléments de `index.html` dont le client se sert, regroupés par module. */
export interface PageElements {
  navigation: NavigationElements;
  help: HelpPanelElements;
  connection: ConnectionStatusElements;
  lobby: LobbyElements;
  /** Liste des joueurs du HUD. */
  hudPlayers: HTMLElement;
  /** Chrono de la partie. */
  timer: HTMLElement;
  /** Conteneur du plateau : le canvas PixiJS et l'encart de fin de partie. */
  board: HTMLElement;
}

/**
 * Cherche dans `root` (la page) tous les éléments dont le client se sert. C'est le seul
 * endroit qui connaît les `id` et les classes de `index.html`.
 *
 * @throws Error qui cite le sélecteur du premier élément manquant (voir `requireElement`).
 */
export function findPageElements(root: ParentNode): PageElements {
  const find = <T extends Element>(selector: string, type: ElementType<T>) =>
    requireElement(root, selector, type);

  // Partagés entre plusieurs modules.
  const joinButton = find('#btn-login', HTMLButtonElement);
  const startButton = find('#btn-start-game', HTMLButtonElement);

  return {
    navigation: {
      screens: {
        login: find('#login-screen', HTMLElement),
        lobby: find('#lobby-screen', HTMLElement),
        game: find('#game-screen', HTMLElement),
      },
      pseudoInput: find('#pseudo-input', HTMLInputElement),
      joinButton,
      startButton,
      leaveLobbyButton: find('#btn-leave-lobby', HTMLButtonElement),
      quitButton: find('#btn-quit', HTMLButtonElement),
    },
    help: {
      panel: find('#help-panel', HTMLElement),
      openButtons: [
        find('#btn-show-help-login', HTMLButtonElement),
        find('#btn-show-help-game', HTMLButtonElement),
      ],
      closeButton: find('#btn-close-help', HTMLButtonElement),
    },
    connection: {
      panel: find('#connection-status', HTMLElement),
      message: find('#connection-message', HTMLElement),
      retryButton: find('#btn-retry', HTMLButtonElement),
      joinButton,
    },
    lobby: {
      list: find('.lobby-players', HTMLUListElement),
      startButton,
      startHint: find('#start-hint', HTMLElement),
    },
    hudPlayers: find('.player-list', HTMLElement),
    timer: find('.timer', HTMLElement),
    board: find('#canvas-container', HTMLElement),
  };
}
