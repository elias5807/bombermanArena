import type { AppEvents } from '../core/AppEvents';
import type { PlayerInfo } from '../state/GameState';

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
  players: readonly Pick<PlayerInfo, 'playerId' | 'name'>[],
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
