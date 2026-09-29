import { describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';

/**
 * Test de contrat : ces messages sont typés par le protocole partagé avec le
 * serveur (`shared/src/protocol/messages.ts`). Si le Backend modifie ou retire
 * un champ de manière incompatible, `npm run typecheck` échoue ici, avant que
 * le client et le serveur ne divergent en silence.
 */
describe('protocole partagé avec le serveur', () => {
  it('accepte les messages du lobby tels que définis par le serveur', () => {
    const join: ClientMessage = { type: 'JOIN_LOBBY', playerName: 'Alice' };
    const joined: ServerMessage = { type: 'PLAYER_JOINED', playerId: 'p1', playerName: 'Alice' };
    const status: ServerMessage = {
      type: 'LOBBY_STATUS',
      players: [{ playerId: 'p1', playerName: 'Alice' }],
    };
    const started: ServerMessage = { type: 'GAME_STARTED', players: ['p1', 'p2'] };

    expect([join.type, joined.type, status.type, started.type]).toEqual([
      'JOIN_LOBBY',
      'PLAYER_JOINED',
      'LOBBY_STATUS',
      'GAME_STARTED',
    ]);
  });
});
