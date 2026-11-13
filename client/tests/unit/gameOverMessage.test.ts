// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import { GameOverPanel, describeGameOver } from '../../src/ui/gameOverMessage';

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

describe('GameOverPanel', () => {
  let bus: EventBus<AppEvents>;
  let container: HTMLElement;
  let panel: GameOverPanel;

  const shown = () => container.querySelector('.game-over:not(.hidden)');
  const start = () => bus.emit('server:GAME_STARTED', { type: 'GAME_STARTED', players: [] });

  beforeEach(() => {
    bus = new EventBus<AppEvents>((error) => {
      throw error;
    });
    container = document.createElement('div');
    document.body.replaceChildren(container);
    panel = new GameOverPanel(container, bus, { players: PLAYERS });
  });

  it('est masqué tant que la partie n’est pas finie', () => {
    expect(container.querySelectorAll('.game-over')).toHaveLength(1);
    expect(shown()).toBeNull();
  });

  it('affiche le texte de la fin de partie, le nom du gagnant en texte', () => {
    bus.emit('state:gameOver', { winnerId: 'p2', outcome: 'defeat' });

    expect(shown()?.querySelector('h2')?.textContent).toBe('Défaite');
    expect(shown()?.querySelector('p')?.textContent).toBe('Bob remporte la partie.');
  });

  it('se masque au GAME_STARTED suivant', () => {
    bus.emit('state:gameOver', { winnerId: 'p1', outcome: 'victory' });
    start();

    expect(shown()).toBeNull();
  });

  it('dispose() retire l’encart et ne suit plus le bus', () => {
    panel.dispose();
    bus.emit('state:gameOver', { winnerId: null, outcome: 'draw' });

    expect(container.children).toHaveLength(0);
  });
});
