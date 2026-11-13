import type { LobbyStatusMessage } from '@shared/protocol/messages';
import type { AppEventBus } from '../core/AppEvents';
import type { GameState } from '../state/GameState';

/** Nombre d'emplacements du salon, occupés ou non. */
const LOBBY_SLOTS = 4;

/** Nombre de joueurs à partir duquel la partie peut être lancée. */
export const MIN_PLAYERS_TO_START = 2;

type LobbyPlayers = LobbyStatusMessage['players'];

/**
 * Reconstruit les emplacements du salon d'attente à partir de la liste envoyée par le serveur.
 * L'emplacement de `localPlayerId`, s'il est connu, porte la mention « (vous) ».
 *
 * Les pseudos viennent des autres joueurs : ils passent par `textContent`, jamais par
 * `innerHTML`, pour qu'un pseudo contenant du HTML s'affiche tel quel au lieu de s'exécuter.
 */
export function renderLobbyPlayers(
  list: HTMLUListElement,
  players: LobbyPlayers,
  localPlayerId: string | null = null,
): void {
  const items: HTMLLIElement[] = [];
  for (let i = 0; i < LOBBY_SLOTS; i++) {
    const player = players[i];
    items.push(createSlot(i + 1, player?.playerName, player?.playerId === localPlayerId));
  }
  list.replaceChildren(...items);
}

/** Un emplacement : avatar, `P{n}: nom` (ou en attente) et statut. */
function createSlot(slot: number, playerName: string | undefined, isLocal: boolean): HTMLLIElement {
  const taken = playerName !== undefined;

  const li = document.createElement('li');
  li.className = taken ? 'lobby-player ready' : 'lobby-player waiting';

  const avatar = document.createElement('img');
  avatar.src = `/assets/sprites/joueur_${slot}.png`;
  avatar.className = 'pixel-avatar';
  avatar.alt = `P${slot}`;

  const name = document.createElement('span');
  if (!taken) {
    name.textContent = `P${slot}: En attente...`;
  } else {
    name.textContent = isLocal ? `P${slot}: ${playerName} (vous)` : `P${slot}: ${playerName}`;
  }

  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = taken ? 'PRÊT' : 'ATTENTE';

  li.append(avatar, name, status);
  return li;
}

/** Les éléments de l'écran du salon que `LobbyView` tient à jour. */
export interface LobbyElements {
  list: HTMLUListElement;
  startButton: HTMLButtonElement;
  /** Texte d'aide affiché tant que la partie ne peut pas être lancée. */
  startHint: HTMLElement;
}

/**
 * Écran du salon d'attente, tenu à jour d'après le bus : la liste des joueurs
 * (`server:LOBBY_STATUS`), le joueur local (`session:joined`) et le bouton
 * « Lancer la partie », actif à partir de `MIN_PLAYERS_TO_START` joueurs.
 *
 * Avant le premier `LOBBY_STATUS`, les 4 emplacements sont en attente.
 */
export class LobbyView {
  private readonly elements: LobbyElements;
  private readonly state: Pick<GameState, 'localPlayerId'>;
  private players: LobbyPlayers = [];
  private readonly unsubscribers: (() => void)[];

  constructor(elements: LobbyElements, bus: AppEventBus, state: Pick<GameState, 'localPlayerId'>) {
    this.elements = elements;
    this.state = state;
    this.unsubscribers = [
      bus.on('server:LOBBY_STATUS', ({ players }) => {
        this.players = players;
        this.render();
      }),
      // L'identifiant arrive avant le LOBBY_STATUS qui liste le joueur, mais rien ne le garantit.
      bus.on('session:joined', () => this.render()),
    ];
    this.render();
  }

  /** Se désabonne du bus. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  private render(): void {
    const { list, startButton, startHint } = this.elements;
    renderLobbyPlayers(list, this.players, this.state.localPlayerId);

    const canStart = this.players.length >= MIN_PLAYERS_TO_START;
    startButton.disabled = !canStart;
    startHint.textContent = `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs pour lancer la partie.`;
    startHint.hidden = canStart;
  }
}
