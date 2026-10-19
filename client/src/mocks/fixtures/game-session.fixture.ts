import type { Direction } from '@shared/protocol/messages';
import type { JoinScenario, ScenarioStep } from '../../network/MockServerAdapter';
import { gameStateMessage } from '../mockArena';
import { MOCK_PLAYERS, arrivalSteps, type LobbyPlayer } from '../lobbySteps';

const [, bob, chloe, david] = MOCK_PLAYERS;

/** Délai entre deux actions de la partie. */
const TICK_MS = 500;

type Cell = { col: number; row: number };

/** Déplacement accepté par le serveur, que tous les joueurs reçoivent. */
function move(
  { playerId }: LobbyPlayer,
  col: number,
  row: number,
  direction: Direction,
  delayMs = TICK_MS,
): ScenarioStep {
  return { delayMs, message: { type: 'POSITION_UPDATED', playerId, col, row, direction } };
}

/** Bombe posée par `player` sur sa case. */
function bomb(bombId: string, { playerId }: LobbyPlayer, col: number, row: number): ScenarioStep {
  return { delayMs: TICK_MS, message: { type: 'BOMB_PLACED', bombId, playerId, col, row } };
}

/** Explosion de la bombe `bombId`, telle que le serveur la calcule (portée de 2 cases). */
function explosion(
  delayMs: number,
  bombId: string,
  { col, row }: Cell,
  affectedCells: Cell[],
  destroyedBricks: Cell[],
  eliminatedPlayers: string[] = [],
): ScenarioStep {
  return {
    delayMs,
    message: {
      type: 'BOMB_EXPLODED',
      bombId,
      col,
      row,
      affectedCells,
      destroyedBricks,
      eliminatedPlayers,
    },
  };
}

/**
 * Partie hors ligne pour le joueur local : il rejoint le salon sous son nom (il est
 * `p1`), trois joueurs fictifs le rejoignent, la partie démarre quand le salon est
 * plein (comme sur le serveur, à 4 joueurs), puis les autres jouent : Bob et David
 * posent une bombe, des briques sautent, David est éliminé par la sienne.
 *
 * Le joueur local ne bouge pas : le serveur simulé ne répond pas à ses déplacements.
 * Le plateau est celui de `mockArena.ts`, et les messages suivent les règles du
 * serveur (vérifié par `tests/integration/mock-session.test.ts`).
 */
export const gameSessionScenario: JoinScenario = {
  name: 'game-session',
  stepsFor(playerName: string): ScenarioStep[] {
    const lobby = [{ playerId: 'p1', playerName }, bob, chloe, david];
    // Bombes posées à t = 2,0 s et 2,5 s de partie : elles explosent 2,5 s plus tard.
    const davidBomb = { col: 13, row: 11 };
    const bobBomb = { col: 13, row: 3 };

    return [
      // Réponse immédiate à JOIN_LOBBY : l'arrivée, le salon, puis l'état du jeu pour lui seul.
      ...arrivalSteps(lobby, 0, 0),
      { delayMs: 0, message: gameStateMessage(lobby.slice(0, 1)) },
      ...arrivalSteps(lobby, 1, 1000),
      ...arrivalSteps(lobby, 2, 1000),
      ...arrivalSteps(lobby, 3, 1000),
      { delayMs: 0, message: { type: 'GAME_STARTED', players: lobby.map((p) => p.playerId) } },
      { delayMs: 0, message: gameStateMessage(lobby) },

      move(bob, 13, 2, 'down'),
      move(chloe, 2, 11, 'right'),
      move(bob, 13, 3, 'down'),
      bomb('b1', david, davidBomb.col, davidBomb.row),
      bomb('b2', bob, bobBomb.col, bobBomb.row),
      move(david, 13, 10, 'up'),
      move(bob, 13, 2, 'up'),
      move(chloe, 3, 11, 'right'),
      move(bob, 13, 1, 'up'),
      explosion(
        0,
        'b1',
        davidBomb,
        [
          davidBomb,
          { col: 12, row: 11 },
          { col: 11, row: 11 },
          { col: 13, row: 10 },
          { col: 13, row: 9 },
        ],
        [
          { col: 11, row: 11 },
          { col: 13, row: 9 },
        ],
        [david.playerId],
      ),
      // Bob sort de la ligne de sa bombe juste avant qu'elle explose.
      move(bob, 12, 1, 'left', TICK_MS / 2),
      explosion(
        TICK_MS / 2,
        'b2',
        bobBomb,
        [
          bobBomb,
          { col: 12, row: 3 },
          { col: 11, row: 3 },
          { col: 13, row: 4 },
          { col: 13, row: 5 },
          { col: 13, row: 2 },
          { col: 13, row: 1 },
        ],
        [
          { col: 11, row: 3 },
          { col: 13, row: 5 },
        ],
      ),
      move(chloe, 3, 10, 'up'),
    ];
  },
};
