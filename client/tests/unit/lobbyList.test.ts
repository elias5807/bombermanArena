// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LobbyStatusMessage } from '@shared/protocol/messages';
import { renderLobbyPlayers } from '../../src/ui/lobbyList';

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
});
