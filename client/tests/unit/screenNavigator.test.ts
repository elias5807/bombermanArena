// @vitest-environment happy-dom
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import {
  DEFAULT_PLAYER_NAME,
  ScreenNavigator,
  type ScreenName,
} from '../../src/ui/screenNavigator';
import { recordEvents } from '../helpers/recordEvents';

const GAME_STARTED: AppEvents['server:GAME_STARTED'] = {
  type: 'GAME_STARTED',
  players: ['p1', 'p2'],
};

/** Un écran de `index.html` : seul celui de connexion est visible au chargement. */
function screen(hidden: boolean): HTMLElement {
  const element = document.createElement('div');
  element.className = hidden ? 'panel hidden' : 'panel';
  return element;
}

/** Une navigation sur des écrans neufs, avec une fausse session et de fausses vues. */
function setup() {
  const bus = new EventBus<AppEvents>((error) => {
    throw error;
  });
  const events = recordEvents(bus);
  const screens = { login: screen(false), lobby: screen(true), game: screen(true) };
  const elements = {
    screens,
    pseudoInput: document.createElement('input'),
    joinButton: document.createElement('button'),
    startButton: document.createElement('button'),
    leaveLobbyButton: document.createElement('button'),
    quitButton: document.createElement('button'),
  };
  const session = { start: vi.fn(() => Promise.resolve()), stop: vi.fn() };
  /** Les vues montées, une liste par session. */
  const mounted: { dispose: Mock }[][] = [];
  const mountSessionViews = vi.fn(() => {
    const views = [{ dispose: vi.fn() }, { dispose: vi.fn() }];
    mounted.push(views);
    return views;
  });
  const navigator = new ScreenNavigator(elements, bus, { session, mountSessionViews });

  /** Les écrans affichés, d'après le DOM. */
  const visible = () =>
    (Object.keys(screens) as ScreenName[]).filter(
      (name) => !screens[name].classList.contains('hidden'),
    );
  const pressKey = (key: string) =>
    elements.pseudoInput.dispatchEvent(new KeyboardEvent('keydown', { key }));
  const named = (name: keyof AppEvents) => events.filter(([event]) => event === name);

  return {
    bus,
    elements,
    session,
    mounted,
    mountSessionViews,
    navigator,
    visible,
    pressKey,
    named,
  };
}

/** Une navigation déjà dans le salon. */
function inLobby() {
  const context = setup();
  context.elements.joinButton.click();
  return context;
}

/** Une navigation déjà sur l'écran de jeu, partie lancée par le serveur. */
function inGame() {
  const context = inLobby();
  context.bus.emit('server:GAME_STARTED', GAME_STARTED);
  return context;
}

describe('ScreenNavigator', () => {
  it('commence sur l’écran de connexion, les vues de la session montées', () => {
    const { navigator, visible, mountSessionViews } = setup();

    expect(navigator.screen).toBe('login');
    expect(visible()).toEqual(['login']);
    expect(mountSessionViews).toHaveBeenCalledTimes(1);
  });

  it('impose son écran au DOM, même si plusieurs écrans étaient visibles', () => {
    const { elements, visible } = setup();
    elements.screens.game.classList.remove('hidden');

    elements.joinButton.click();

    expect(visible()).toEqual(['lobby']);
  });

  describe('connexion → salon', () => {
    it('« Rejoindre » publie input:join avec le pseudo sans espaces, puis affiche le salon', () => {
      const { elements, navigator, visible, named } = setup();
      elements.pseudoInput.value = '  Agent007 ';

      elements.joinButton.click();

      expect(named('input:join')).toEqual([['input:join', { playerName: 'Agent007' }]]);
      expect(navigator.screen).toBe('lobby');
      expect(visible()).toEqual(['lobby']);
    });

    it.each(['', '   '])('un pseudo vide (%j) devient DEFAULT_PLAYER_NAME', (pseudo) => {
      const { elements, named } = setup();
      elements.pseudoInput.value = pseudo;

      elements.joinButton.click();

      expect(named('input:join')).toEqual([['input:join', { playerName: DEFAULT_PLAYER_NAME }]]);
    });

    it('Entrée dans le champ du pseudo rejoint, les autres touches non', () => {
      const { navigator, pressKey, named } = setup();

      pressKey('a');
      expect(named('input:join')).toHaveLength(0);

      pressKey('Enter');
      expect(named('input:join')).toHaveLength(1);
      expect(navigator.screen).toBe('lobby');
    });

    it('Entrée ne fait rien tant que « Rejoindre » est désactivé', () => {
      const { elements, navigator, pressKey, named } = setup();
      elements.joinButton.disabled = true;

      pressKey('Enter');

      expect(named('input:join')).toHaveLength(0);
      expect(navigator.screen).toBe('login');
    });
  });

  describe('salon → partie', () => {
    it('« Lancer la partie » publie input:start sans quitter le salon : le serveur décide', () => {
      const { elements, navigator, visible, named } = inLobby();

      elements.startButton.click();

      expect(named('input:start')).toHaveLength(1);
      expect(navigator.screen).toBe('lobby');
      expect(visible()).toEqual(['lobby']);
    });

    it('server:GAME_STARTED affiche la partie chez tous les joueurs', () => {
      const { bus, navigator, visible } = inLobby();

      bus.emit('server:GAME_STARTED', GAME_STARTED);

      expect(navigator.screen).toBe('game');
      expect(visible()).toEqual(['game']);
    });

    it('une partie relancée garde l’écran de jeu', () => {
      const { bus, navigator, visible } = inGame();

      bus.emit('server:GAME_STARTED', GAME_STARTED);

      expect(navigator.screen).toBe('game');
      expect(visible()).toEqual(['game']);
    });
  });

  describe('retour à l’écran de connexion', () => {
    it.each([
      ['« Retour au login »', inLobby, 'leaveLobbyButton'],
      ['« Quitter »', inGame, 'quitButton'],
    ] as const)(
      '%s ferme la connexion, remet la session à zéro, puis en ouvre une neuve',
      (_label, start, button) => {
        const { elements, session, mounted, mountSessionViews, navigator, visible } = start();

        elements[button].click();

        expect(navigator.screen).toBe('login');
        expect(visible()).toEqual(['login']);
        for (const view of mounted[0]) {
          expect(view.dispose).toHaveBeenCalledTimes(1);
        }
        expect(mounted).toHaveLength(2);
        expect(session.stop).toHaveBeenCalledTimes(1);
        expect(session.start).toHaveBeenCalledTimes(1);
        // La connexion est fermée avant la remise à zéro, et rouverte après.
        const [stopOrder] = session.stop.mock.invocationCallOrder;
        const [startOrder] = session.start.mock.invocationCallOrder;
        const [disposeOrder] = mounted[0][0].dispose.mock.invocationCallOrder;
        const [remountOrder] = mountSessionViews.mock.invocationCallOrder.slice(-1);
        expect(stopOrder).toBeLessThan(disposeOrder);
        expect(disposeOrder).toBeLessThan(remountOrder);
        expect(remountOrder).toBeLessThan(startOrder);
      },
    );

    it('connection:lost ramène à l’écran de connexion sans rouvrir de connexion', () => {
      const { bus, session, mounted, navigator, visible } = inGame();

      bus.emit('connection:lost');

      expect(navigator.screen).toBe('login');
      expect(visible()).toEqual(['login']);
      expect(mounted).toHaveLength(2);
      // « Réessayer » de ConnectionStatus s'en charge.
      expect(session.stop).not.toHaveBeenCalled();
      expect(session.start).not.toHaveBeenCalled();
    });

    it('chaque session démonte ses propres vues, une seule fois', () => {
      const { bus, elements, mounted } = inLobby();

      elements.leaveLobbyButton.click();
      bus.emit('connection:lost');

      expect(mounted).toHaveLength(3);
      const [first, second, current] = mounted;
      for (const view of [...first, ...second]) {
        expect(view.dispose).toHaveBeenCalledTimes(1);
      }
      for (const view of current) {
        expect(view.dispose).not.toHaveBeenCalled();
      }
    });

    it('après « Quitter », la partie suivante s’affiche comme la première', () => {
      const { bus, elements, navigator, visible } = inGame();

      elements.quitButton.click();
      elements.joinButton.click();
      bus.emit('server:GAME_STARTED', GAME_STARTED);

      expect(navigator.screen).toBe('game');
      expect(visible()).toEqual(['game']);
    });
  });
});
