import { describe, expect, it } from 'vitest';
import { describeGameOver } from '../../src/ui/gameOverMessage';

const PLAYERS = [
  { playerId: 'p1', name: 'Alice' },
  { playerId: 'p2', name: 'Bob' },
  { playerId: 'p3' },
];

describe('describeGameOver', () => {
  it('victoire', () => {
    expect(describeGameOver({ winnerId: 'p1', outcome: 'victory' }, PLAYERS)).toEqual({
      title: 'Victoire !',
      message: 'Vous êtes le dernier joueur en vie.',
    });
  });

  it('défaite : nomme le gagnant', () => {
    expect(describeGameOver({ winnerId: 'p2', outcome: 'defeat' }, PLAYERS)).toEqual({
      title: 'Défaite',
      message: 'Bob remporte la partie.',
    });
  });

  it('défaite : reste lisible quand le nom du gagnant est inconnu', () => {
    const expected = { title: 'Défaite', message: 'Un autre joueur remporte la partie.' };

    expect(describeGameOver({ winnerId: 'p3', outcome: 'defeat' }, PLAYERS)).toEqual(expected);
    expect(describeGameOver({ winnerId: 'p9', outcome: 'defeat' }, PLAYERS)).toEqual(expected);
    expect(describeGameOver({ winnerId: 'p2', outcome: 'defeat' }, [])).toEqual(expected);
  });

  it('égalité', () => {
    expect(describeGameOver({ winnerId: null, outcome: 'draw' }, PLAYERS)).toEqual({
      title: 'Égalité',
      message: "Aucun joueur n'a survécu.",
    });
  });

  it('garde le nom tel quel : le texte est à afficher avec textContent', () => {
    const players = [{ playerId: 'p2', name: '<img src=x onerror=alert(1)>' }];

    expect(describeGameOver({ winnerId: 'p2', outcome: 'defeat' }, players).message).toBe(
      '<img src=x onerror=alert(1)> remporte la partie.',
    );
  });
});
