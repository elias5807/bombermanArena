import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/GameEngine.js';
import type { WebSocket } from 'ws';

function createMockSocket(): WebSocket {
  const messages: string[] = [];
  return {
    readyState: 1, // WebSocket.OPEN
    send: (data: string) => messages.push(data),
    messages,
  } as unknown as WebSocket;
}

describe('GameEngine', () => {
  it('ajoute des joueurs et leur attribue un identifiant et un spawn', () => {
    const engine = new GameEngine();
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();

    const p1 = engine.addPlayer(socket1, 'Alice');
    const p2 = engine.addPlayer(socket2, 'Bob');

    expect(p1).toBeTruthy();
    expect(p2).toBeTruthy();
    expect(engine.getPlayersCount()).toBe(2);

    const player1 = engine.getPlayer(p1!);
    const player2 = engine.getPlayer(p2!);

    expect(player1?.col).toBe(1);
    expect(player1?.row).toBe(1);
    expect(player2?.col).toBe(engine.columns - 2);
    expect(player2?.row).toBe(1);
  });

  it('valide les déplacements et bloque les collisions avec les murs', () => {
    const engine = new GameEngine();
    const socket = createMockSocket();
    const p1 = engine.addPlayer(socket, 'Alice')!;

    // Déplacement vers le haut (bloqué par le mur du haut en row 0)
    const movedUp = engine.movePlayer(p1, 'up');
    expect(movedUp).toBe(false);
    expect(engine.getPlayer(p1)?.row).toBe(1);

    // Déplacement vers la gauche (bloqué par le mur de gauche en col 0)
    const movedLeft = engine.movePlayer(p1, 'left');
    expect(movedLeft).toBe(false);
    expect(engine.getPlayer(p1)?.col).toBe(1);
  });

  it('pose une bombe et diffuse BOMB_PLACED', () => {
    const engine = new GameEngine();
    const socket = createMockSocket();
    const p1 = engine.addPlayer(socket, 'Alice')!;

    const placed = engine.placeBomb(p1);
    expect(placed).toBe(true);

    // Impossible de poser une 2ème bombe sur la même case
    const placedAgain = engine.placeBomb(p1);
    expect(placedAgain).toBe(false);
  });
});
