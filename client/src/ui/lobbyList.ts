import type { LobbyStatusMessage } from '@shared/protocol/messages';

/** Nombre d'emplacements du salon, occupés ou non. */
const LOBBY_SLOTS = 4;

/**
 * Reconstruit les emplacements du salon d'attente à partir de la liste envoyée par le serveur.
 *
 * Les pseudos viennent des autres joueurs : ils passent par `textContent`, jamais par
 * `innerHTML`, pour qu'un pseudo contenant du HTML s'affiche tel quel au lieu de s'exécuter.
 */
export function renderLobbyPlayers(
  list: HTMLUListElement,
  players: LobbyStatusMessage['players'],
): void {
  const items: HTMLLIElement[] = [];
  for (let i = 0; i < LOBBY_SLOTS; i++) {
    items.push(createSlot(i + 1, players[i]?.playerName));
  }
  list.replaceChildren(...items);
}

/** Un emplacement : avatar, `P{n}: nom` (ou en attente) et statut. */
function createSlot(slot: number, playerName: string | undefined): HTMLLIElement {
  const taken = playerName !== undefined;

  const li = document.createElement('li');
  li.className = taken ? 'lobby-player ready' : 'lobby-player waiting';

  const avatar = document.createElement('img');
  avatar.src = `/assets/sprites/joueur_${slot}.png`;
  avatar.className = 'pixel-avatar';
  avatar.alt = `P${slot}`;

  const name = document.createElement('span');
  name.textContent = taken ? `P${slot}: ${playerName}` : `P${slot}: En attente...`;

  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = taken ? 'PRÊT' : 'ATTENTE';

  li.append(avatar, name, status);
  return li;
}
