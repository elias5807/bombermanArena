// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LobbyStatusMessage } from '@shared/protocol/messages';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { LobbyView, renderLobbyPlayers } from '../../src/ui/lobbyList';

type LobbyPlayers = LobbyStatusMessage['players'];

const ALICE = { playerId: 'p1', playerName: 'Alice' };
const BOB = { playerId: 'p2', playerName: 'Bob' };
const CAROL = { playerId: 'p3', playerName: 'Carol' };
const DAVE = { playerId: 'p4', playerName: 'Dave' };

/** Le pseudo qui exécutait du code chez tous les joueurs du salon avant le correctif. */
const XSS_NAME = `<img src=x onerror="document.title='XSS'">`;

/** Ce que montre chaque emplacement : classes, avatar, texte et statut. */
function describeSlots(list: HTMLUListElement) {
  return Array.from(list.children, (li) => {
    const [avatar, name, status] = Array.from(li.children);
    return {
      className: li.className,
      avatar: avatar?.getAttribute('src'),
      name: name?.textContent,
      status: status?.textContent,
    };
  });
}

describe('renderLobbyPlayers', () => {
  let list: HTMLUListElement;

  beforeEach(() => {
    document.body.replaceChildren();
    list = document.createElement('ul');
    document.body.append(list);
  });

  it('affiche un pseudo contenant du HTML comme du texte, sans créer d’élément', () => {
    renderLobbyPlayers(list, [{ playerId: 'p1', playerName: XSS_NAME }]);

    expect(list.querySelectorAll('img')).toHaveLength(4);
    expect(list.querySelectorAll('img[onerror]')).toHaveLength(0);
    expect(list.children[0]?.children[1]?.textContent).toBe(`P1: ${XSS_NAME}`);
    expect(list.children[0]?.children[1]?.children).toHaveLength(0);
  });

  it('reconstruit un emplacement avec les mêmes classes que la maquette', () => {
    renderLobbyPlayers(list, [ALICE]);

    const first = list.children[0] as HTMLLIElement;
    const [avatar, name, status] = Array.from(first.children);
    expect(first.tagName).toBe('LI');
    expect(avatar?.tagName).toBe('IMG');
    expect(avatar?.className).toBe('pixel-avatar');
    expect(avatar?.getAttribute('alt')).toBe('P1');
    expect(name?.tagName).toBe('SPAN');
    expect(name?.className).toBe('');
    expect(status?.tagName).toBe('SPAN');
    expect(status?.className).toBe('status');
  });

  it.each<[count: number, players: LobbyPlayers]>([
    [0, []],
    [1, [ALICE]],
    [2, [ALICE, BOB]],
    [3, [ALICE, BOB, CAROL]],
    [4, [ALICE, BOB, CAROL, DAVE]],
  ])('affiche toujours 4 emplacements, dont %i occupés', (count, players) => {
    renderLobbyPlayers(list, players);

    const slots = describeSlots(list);
    expect(slots).toHaveLength(4);
    expect(slots.filter((slot) => slot.status === 'PRÊT')).toHaveLength(count);
    expect(slots.filter((slot) => slot.status === 'ATTENTE')).toHaveLength(4 - count);
  });

  it('affiche les emplacements libres comme en attente', () => {
    renderLobbyPlayers(list, [ALICE]);

    expect(describeSlots(list).slice(1)).toEqual([
      {
        className: 'lobby-player waiting',
        avatar: '/assets/sprites/joueur_2.png',
        name: 'P2: En attente...',
        status: 'ATTENTE',
      },
      {
        className: 'lobby-player waiting',
        avatar: '/assets/sprites/joueur_3.png',
        name: 'P3: En attente...',
        status: 'ATTENTE',
      },
      {
        className: 'lobby-player waiting',
        avatar: '/assets/sprites/joueur_4.png',
        name: 'P4: En attente...',
        status: 'ATTENTE',
      },
    ]);
  });

  it('garde l’ordre envoyé par le serveur', () => {
    renderLobbyPlayers(list, [CAROL, ALICE, BOB]);

    expect(describeSlots(list).slice(0, 3)).toEqual([
      {
        className: 'lobby-player ready',
        avatar: '/assets/sprites/joueur_1.png',
        name: 'P1: Carol',
        status: 'PRÊT',
      },
      {
        className: 'lobby-player ready',
        avatar: '/assets/sprites/joueur_2.png',
        name: 'P2: Alice',
        status: 'PRÊT',
      },
      {
        className: 'lobby-player ready',
        avatar: '/assets/sprites/joueur_3.png',
        name: 'P3: Bob',
        status: 'PRÊT',
      },
    ]);
  });

  it('remplace la liste précédente à chaque appel', () => {
    const mockup = document.createElement('li');
    mockup.textContent = 'Maquette de index.html';
    list.append(mockup);
    renderLobbyPlayers(list, [ALICE, BOB, CAROL]);
    renderLobbyPlayers(list, [DAVE]);

    expect(list.children).toHaveLength(4);
    expect(describeSlots(list).map((slot) => slot.name)).toEqual([
      'P1: Dave',
      'P2: En attente...',
      'P3: En attente...',
      'P4: En attente...',
    ]);
  });

  it('marque l’emplacement du joueur local', () => {
    renderLobbyPlayers(list, [ALICE, BOB], 'p2');

    expect(describeSlots(list).map((slot) => slot.name)).toEqual([
      'P1: Alice',
      'P2: Bob (vous)',
      'P3: En attente...',
      'P4: En attente...',
    ]);
  });

  it('ne marque personne tant que le joueur local est inconnu ou absent', () => {
    renderLobbyPlayers(list, [ALICE, BOB]);
    expect(describeSlots(list).map((slot) => slot.name)).toEqual([
      'P1: Alice',
      'P2: Bob',
      'P3: En attente...',
      'P4: En attente...',
    ]);

    renderLobbyPlayers(list, [ALICE], 'p9');
    expect(describeSlots(list)[0]?.name).toBe('P1: Alice');
  });
});

describe('LobbyView', () => {
  let bus: EventBus<AppEvents>;
  let state: { localPlayerId: string | null };
  let list: HTMLUListElement;
  let startButton: HTMLButtonElement;
  let startHint: HTMLElement;
  let view: LobbyView;

  const lobbyStatus = (...players: LobbyPlayers) =>
    bus.emit('server:LOBBY_STATUS', { type: 'LOBBY_STATUS', players });

  beforeEach(() => {
    bus = new EventBus<AppEvents>((error) => {
      throw error;
    });
    state = { localPlayerId: null };
    list = document.createElement('ul');
    startButton = document.createElement('button');
    startHint = document.createElement('p');
    document.body.replaceChildren(list, startButton, startHint);
    view = new LobbyView({ list, startButton, startHint }, bus, state);
  });

  it('affiche 4 emplacements en attente avant le premier LOBBY_STATUS', () => {
    expect(describeSlots(list).map((slot) => slot.status)).toEqual([
      'ATTENTE',
      'ATTENTE',
      'ATTENTE',
      'ATTENTE',
    ]);
  });

  it('désactive « Lancer la partie » avec un texte d’aide tant qu’il y a moins de 2 joueurs', () => {
    expect(startButton.disabled).toBe(true);
    expect(startHint.hidden).toBe(false);
    expect(startHint.textContent).toBe('Il faut au moins 2 joueurs pour lancer la partie.');

    lobbyStatus(ALICE);

    expect(startButton.disabled).toBe(true);
    expect(startHint.hidden).toBe(false);
  });

  it('active « Lancer la partie » dès que le salon compte 2 joueurs, et le désactive au départ de l’un', () => {
    lobbyStatus(ALICE, BOB);
    expect(startButton.disabled).toBe(false);
    expect(startHint.hidden).toBe(true);

    lobbyStatus(ALICE, BOB, CAROL);
    expect(startButton.disabled).toBe(false);

    lobbyStatus(BOB);
    expect(startButton.disabled).toBe(true);
    expect(startHint.hidden).toBe(false);
  });

  it('affiche les joueurs du LOBBY_STATUS et marque le joueur local', () => {
    state.localPlayerId = 'p2';
    lobbyStatus(ALICE, BOB);

    expect(describeSlots(list).map((slot) => slot.name)).toEqual([
      'P1: Alice',
      'P2: Bob (vous)',
      'P3: En attente...',
      'P4: En attente...',
    ]);
  });

  it('marque le joueur local quand son identifiant arrive après la liste', () => {
    lobbyStatus(ALICE, BOB);
    state.localPlayerId = 'p1';
    bus.emit('session:joined', { playerId: 'p1' });

    expect(describeSlots(list)[0]?.name).toBe('P1: Alice (vous)');
  });

  it('ne suit plus le bus après dispose()', () => {
    view.dispose();
    lobbyStatus(ALICE, BOB);

    expect(startButton.disabled).toBe(true);
    expect(describeSlots(list)[0]?.status).toBe('ATTENTE');
  });
});
