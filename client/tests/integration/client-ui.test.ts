// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerStateDTO } from '@shared/protocol/messages';
import indexHtml from '../../index.html?raw';
import { App } from '../../src/App';
import type { KeyboardSource, KeyPress } from '../../src/input/KeyboardInput';
import { mountClient } from '../../src/mountClient';
import { CONNECTION_LOST_MESSAGE } from '../../src/ui/connectionStatus';
import { blankTextures } from '../helpers/blankTextures';
import { FakeConnection } from '../helpers/FakeConnection';
import { FakeRenderer, sceneContent } from '../helpers/FakeRenderer';

/**
 * Le client tel que `main.ts` le monte, sur le vrai `index.html`, avec une fausse connexion
 * (le test joue le serveur), un faux moteur de rendu (pas de WebGL) et un faux clavier.
 */

const ALICE: PlayerStateDTO = { playerId: 'p1', name: 'Alice', col: 1, row: 1, alive: true };
const BOB: PlayerStateDTO = { playerId: 'p2', name: 'Bob', col: 13, row: 1, alive: true };

/** Charge le corps de `index.html` dans le document de test, sans ses scripts. */
function loadIndexPage(): void {
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');
  page.querySelectorAll('script').forEach((script) => script.remove());
  document.body.innerHTML = page.body.innerHTML;
}

function element<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) {
    throw new Error(`${selector} absent de la page`);
  }
  return found;
}

const click = (selector: string) => element<HTMLButtonElement>(selector).click();
const isShown = (selector: string) => !element(selector).classList.contains('hidden');
const visibleScreens = () =>
  ['#login-screen', '#lobby-screen', '#game-screen'].filter((selector) => isShown(selector));
const texts = (selector: string) =>
  Array.from(document.querySelectorAll(selector), (item) => item.textContent);

/** Laisse s'achever ce qui attend une promesse : ouverture de la connexion, démarrage du rendu. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** Faux clavier : `press` appelle l'écouteur `keydown` que le client a posé. */
function fakeKeyboard() {
  const listeners = new Set<(event: KeyPress) => void>();
  const source: KeyboardSource = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const press = (key: string) => {
    for (const listener of listeners) {
      listener({ key, repeat: false, preventDefault: () => undefined });
    }
  };
  return { source, press };
}

/** Monte le client sur `index.html` et attend l'ouverture de la connexion. */
async function mount() {
  loadIndexPage();
  const connection = new FakeConnection();
  const renderer = new FakeRenderer();
  const keyboard = fakeKeyboard();
  await mountClient(document, new App(connection), {
    rendering: {
      createRenderer: () => Promise.resolve(renderer),
      loadSprites: () => Promise.resolve(blankTextures()),
    },
    keyboard: keyboard.source,
  });
  const sentTypes = () => connection.sent.map(({ type }) => type);
  return { connection, renderer, press: keyboard.press, sentTypes };
}

type Client = Awaited<ReturnType<typeof mount>>;

/**
 * Alice rejoint le salon : le serveur l'annonce, lui envoie l'état du jeu (comme le vrai
 * serveur à chaque arrivée), puis Bob arrive.
 */
function joinLobby({ connection }: Client): void {
  element<HTMLInputElement>('#pseudo-input').value = 'Alice';
  click('#btn-login');
  connection.receive({ type: 'PLAYER_JOINED', playerId: 'p1', playerName: 'Alice' });
  connection.receive({ type: 'LOBBY_STATUS', players: [{ playerId: 'p1', playerName: 'Alice' }] });
  connection.receive({ type: 'GAME_STATE', players: [ALICE], grid: { columns: 15, rows: 13 } });
  connection.receive({ type: 'PLAYER_JOINED', playerId: 'p2', playerName: 'Bob' });
  connection.receive({
    type: 'LOBBY_STATUS',
    players: [
      { playerId: 'p1', playerName: 'Alice' },
      { playerId: 'p2', playerName: 'Bob' },
    ],
  });
}

/** Le serveur lance une partie : GAME_STARTED, puis l'état de départ. */
async function serverStartsGame({ connection }: Client, players = [ALICE, BOB]): Promise<void> {
  connection.receive({ type: 'GAME_STARTED', players: players.map(({ playerId }) => playerId) });
  connection.receive({ type: 'GAME_STATE', players, grid: { columns: 15, rows: 13 } });
  await settle();
}

/** Une partie en cours entre Alice (joueur local) et Bob. */
async function inGame(): Promise<Client> {
  const client = await mount();
  joinLobby(client);
  click('#btn-start-game');
  await serverStartsGame(client);
  return client;
}

describe('client monté sur index.html', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('ouvre la connexion une fois branché : écran de connexion, « Rejoindre » actif', async () => {
    const { connection } = await mount();

    expect(connection.connectCalls).toBe(1);
    expect(visibleScreens()).toEqual(['#login-screen']);
    expect(element<HTMLButtonElement>('#btn-login').disabled).toBe(false);
    expect(isShown('#help-panel')).toBe(false);
  });

  it('rejoindre : le pseudo part au serveur, le salon affiche les joueurs', async () => {
    const client = await mount();

    joinLobby(client);

    expect(client.connection.sent).toEqual([{ type: 'JOIN_LOBBY', playerName: 'Alice' }]);
    expect(visibleScreens()).toEqual(['#lobby-screen']);
    expect(texts('.lobby-player span:not(.status)').slice(0, 2)).toEqual([
      'P1: Alice (vous)',
      'P2: Bob',
    ]);
    expect(element<HTMLButtonElement>('#btn-start-game').disabled).toBe(false);
  });

  it('lancer la partie : START_GAME part, la partie s’affiche avec ses joueurs', async () => {
    const client = await mount();
    joinLobby(client);

    click('#btn-start-game');
    await serverStartsGame(client);

    expect(client.sentTypes()).toEqual(['JOIN_LOBBY', 'START_GAME']);
    expect(visibleScreens()).toEqual(['#game-screen']);
    expect(sceneContent(client.renderer.current).players).toBe(2);
    expect(texts('.player-name')).toEqual(['Alice (vous)', 'Bob']);
  });

  it('le clavier ne pilote que la partie, tant que le joueur local est en vie', async () => {
    const client = await mount();
    joinLobby(client);
    // L'état reçu dans le salon dit Alice en vie : seul l'écran affiché retient le clavier.
    client.press('ArrowRight');
    expect(client.sentTypes()).toEqual(['JOIN_LOBBY']);

    click('#btn-start-game');
    await serverStartsGame(client);
    client.press('ArrowRight');
    expect(client.connection.sent.at(-1)).toEqual({
      type: 'MOVE',
      playerId: 'p1',
      direction: 'right',
    });

    client.connection.receive({
      type: 'BOMB_EXPLODED',
      bombId: 'b1',
      col: 1,
      row: 1,
      affectedCells: [{ col: 1, row: 1 }],
      eliminatedPlayers: ['p1'],
    });
    client.press('ArrowLeft');
    expect(client.sentTypes().filter((type) => type === 'MOVE')).toHaveLength(1);
  });

  it('fin de partie : l’encart s’affiche par-dessus le plateau', async () => {
    const client = await inGame();

    client.connection.receive({
      type: 'BOMB_EXPLODED',
      bombId: 'b1',
      col: 13,
      row: 1,
      affectedCells: [{ col: 13, row: 1 }],
      eliminatedPlayers: ['p2'],
    });

    expect(texts('#canvas-container .game-over:not(.hidden) h2')).toEqual(['Victoire !']);
  });

  it('« Quitter » ferme la connexion, remet l’écran de connexion à zéro et en rouvre une', async () => {
    const client = await inGame();

    click('#btn-quit');
    await settle();

    expect(client.connection.disconnectCalls).toBe(1);
    expect(client.connection.connectCalls).toBe(2);
    expect(visibleScreens()).toEqual(['#login-screen']);
    expect(texts('.player-list .player-item')).toEqual([]);
    expect(texts('.lobby-player.ready')).toEqual([]);
    expect(element('.timer').textContent).toBe('00:00');
  });

  it('une coupure ramène à l’écran de connexion ; « Réessayer » rouvre la connexion', async () => {
    const client = await inGame();

    client.connection.drop();

    expect(visibleScreens()).toEqual(['#login-screen']);
    expect(element('#connection-status').hidden).toBe(false);
    expect(element('#connection-message').textContent).toBe(CONNECTION_LOST_MESSAGE);

    click('#btn-retry');
    await settle();
    expect(client.connection.connectCalls).toBe(2);
    expect(element('#connection-status').hidden).toBe(true);
  });

  it('l’aide s’ouvre depuis la partie et se ferme', async () => {
    await inGame();

    click('#btn-show-help-game');
    expect(isShown('#help-panel')).toBe(true);

    click('#btn-close-help');
    expect(isShown('#help-panel')).toBe(false);
  });

  it('un élément manquant arrête le montage avant toute connexion', () => {
    loadIndexPage();
    element('#btn-quit').remove();
    const connection = new FakeConnection();

    expect(() => mountClient(document, new App(connection))).toThrow('« #btn-quit »');
    expect(connection.connectCalls).toBe(0);
  });
});
