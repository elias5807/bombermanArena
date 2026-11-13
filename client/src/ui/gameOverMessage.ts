import type { AppEventBus, AppEvents } from '../core/AppEvents';
import type { PlayerInfo } from '../state/GameState';

/** Ce qu'il faut savoir d'un joueur pour nommer le gagnant. */
type NamedPlayer = Pick<PlayerInfo, 'playerId' | 'name'>;

/** Texte de l'encart de fin de partie. */
export interface GameOverMessage {
  title: string;
  message: string;
}

/**
 * Texte à afficher pour une fin de partie, vue par le joueur local. Le nom du
 * gagnant est cherché dans `players` ; à afficher avec `textContent`, car il
 * vient d'un autre joueur.
 */
export function describeGameOver(
  { winnerId, outcome }: AppEvents['state:gameOver'],
  players: readonly NamedPlayer[],
): GameOverMessage {
  switch (outcome) {
    case 'victory':
      return { title: 'Victoire !', message: 'Vous êtes le dernier joueur en vie.' };
    case 'draw':
      return { title: 'Égalité', message: "Aucun joueur n'a survécu." };
    case 'defeat': {
      const winnerName = players.find((player) => player.playerId === winnerId)?.name;
      return {
        title: 'Défaite',
        message: winnerName
          ? `${winnerName} remporte la partie.`
          : 'Un autre joueur remporte la partie.',
      };
    }
  }
}

/**
 * Encart de fin de partie, par-dessus le plateau : affiché à `state:gameOver` avec le
 * texte de `describeGameOver`, masqué au `server:GAME_STARTED` suivant.
 */
export class GameOverPanel {
  private readonly panel: HTMLDivElement;
  private readonly unsubscribers: (() => void)[];

  /** @param container Élément qui reçoit l'encart (le conteneur du plateau). */
  constructor(
    container: HTMLElement,
    bus: AppEventBus,
    state: { readonly players: readonly NamedPlayer[] },
  ) {
    this.panel = container.appendChild(document.createElement('div'));
    this.panel.className = 'game-over hidden';
    const title = this.panel.appendChild(document.createElement('h2'));
    const text = this.panel.appendChild(document.createElement('p'));

    this.unsubscribers = [
      bus.on('state:gameOver', (result) => {
        const { title: titleText, message } = describeGameOver(result, state.players);
        title.textContent = titleText;
        text.textContent = message;
        this.panel.classList.remove('hidden');
      }),
      bus.on('server:GAME_STARTED', () => this.panel.classList.add('hidden')),
    ];
  }

  /** Se désabonne du bus et retire l'encart. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.panel.remove();
  }
}
