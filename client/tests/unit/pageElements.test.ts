// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { findPageElements, requireElement } from '../../src/ui/pageElements';

/** La vraie page du client, telle que le navigateur la charge (ses scripts ne s'exécutent pas). */
function indexPage(): Document {
  return new DOMParser().parseFromString(indexHtml, 'text/html');
}

/** Tous les sélecteurs dont le client dépend. */
const SELECTORS = [
  '#login-screen',
  '#lobby-screen',
  '#game-screen',
  '#pseudo-input',
  '#btn-login',
  '#btn-start-game',
  '#btn-leave-lobby',
  '#btn-quit',
  '#help-panel',
  '#btn-show-help-login',
  '#btn-show-help-game',
  '#btn-close-help',
  '#connection-status',
  '#connection-message',
  '#btn-retry',
  '.lobby-players',
  '#start-hint',
  '.player-list',
  '.timer',
  '#canvas-container',
];

/** Renomme l'`id` ou retire la classe que vise `selector`, comme le ferait une retouche de la page. */
function rename(page: Document, selector: string): void {
  const element = page.querySelector(selector);
  if (!element) {
    throw new Error(`${selector} absent de index.html`);
  }
  if (selector.startsWith('#')) {
    element.id = `${element.id}-renomme`;
  } else {
    element.classList.remove(selector.slice(1));
  }
}

describe('findPageElements', () => {
  it('trouve dans index.html chaque élément à sa place', () => {
    const page = indexPage();
    const get = (selector: string) => page.querySelector(selector);

    expect(findPageElements(page)).toEqual({
      navigation: {
        screens: {
          login: get('#login-screen'),
          lobby: get('#lobby-screen'),
          game: get('#game-screen'),
        },
        pseudoInput: get('#pseudo-input'),
        joinButton: get('#btn-login'),
        startButton: get('#btn-start-game'),
        leaveLobbyButton: get('#btn-leave-lobby'),
        quitButton: get('#btn-quit'),
      },
      help: {
        panel: get('#help-panel'),
        openButtons: [get('#btn-show-help-login'), get('#btn-show-help-game')],
        closeButton: get('#btn-close-help'),
      },
      connection: {
        panel: get('#connection-status'),
        message: get('#connection-message'),
        retryButton: get('#btn-retry'),
        joinButton: get('#btn-login'),
      },
      lobby: {
        list: get('.lobby-players'),
        startButton: get('#btn-start-game'),
        startHint: get('#start-hint'),
      },
      hudPlayers: get('.player-list'),
      timer: get('.timer'),
      board: get('#canvas-container'),
    });
  });

  it('donne les mêmes boutons « Rejoindre » et « Lancer » aux modules qui les partagent', () => {
    const { navigation, connection, lobby } = findPageElements(indexPage());

    expect(connection.joinButton).toBe(navigation.joinButton);
    expect(lobby.startButton).toBe(navigation.startButton);
  });

  it.each(SELECTORS)('nomme « %s » s’il a été renommé dans index.html', (selector) => {
    const page = indexPage();
    rename(page, selector);

    expect(() => findPageElements(page)).toThrow(
      `index.html : élément « ${selector} » introuvable.`,
    );
  });
});

describe('requireElement', () => {
  it('rend l’élément trouvé, avec son type', () => {
    const page = indexPage();

    const input = requireElement(page, '#pseudo-input', HTMLInputElement);

    expect(input.maxLength).toBe(15);
  });

  it('refuse un élément d’un autre type que celui attendu', () => {
    const page = indexPage();
    const impostor = page.createElement('div');
    impostor.id = 'btn-login';
    page.querySelector('#btn-login')?.replaceWith(impostor);

    expect(() => requireElement(page, '#btn-login', HTMLButtonElement)).toThrow(
      'index.html : « #btn-login » est un HTMLDivElement, HTMLButtonElement attendu.',
    );
    expect(() => findPageElements(page)).toThrow('« #btn-login »');
  });

  it('ne cherche que dans la racine donnée', () => {
    const page = indexPage();
    const lobby = requireElement(page, '#lobby-screen', HTMLElement);

    expect(requireElement(lobby, '#btn-start-game', HTMLButtonElement).id).toBe('btn-start-game');
    expect(() => requireElement(lobby, '#btn-login', HTMLButtonElement)).toThrow('#btn-login');
  });
});
