import type { GameStateMessage } from '@shared/protocol/messages';
import type { LobbyPlayer } from './lobbySteps';

/** Dimensions du plateau, celles du serveur (`server/src/game/grid.ts`). */
export const MOCK_GRID = { columns: 15, rows: 13 } as const;

/** Valeur d'une case dans `GAME_STATE.map`, comme sur le serveur. */
const CELL_VALUES: Record<string, number> = { '.': 0, '#': 1, x: 2 };

/**
 * Plateau des scénarios, au format du serveur : murs en bordure et un pilier une
 * case sur deux, coins de départ dégagés, briques ailleurs. Le serveur tire ses
 * briques au hasard ; ici elles sont fixes, pour que les déplacements et les
 * explosions écrits dans les scénarios restent possibles.
 *
 * `#` mur, `x` brique, `.` sol ; une ligne par rangée, de haut en bas.
 */
const ARENA = [
  '###############',
  '#..xx..x..xx..#',
  '#.#x#.#x#.#x#.#',
  '#x.xx.x.xx.x..#',
  '#.#x#.#x#.#x#.#',
  '#.x..x.x..x..x#',
  '#x#.#x#.#x#.#.#',
  '#..x.x..x.x.x.#',
  '#.#.#x#.#.#x#.#',
  '#.x.x..x.x..xx#',
  '#.#.#x#.#x#.#.#',
  '#...x.x..x.x..#',
  '###############',
];

/** Le plateau des scénarios : `MOCK_MAP[row][col]` vaut 0 (sol), 1 (mur) ou 2 (brique). */
export const MOCK_MAP: readonly (readonly number[])[] = ARENA.map((line) =>
  [...line].map((cell) => CELL_VALUES[cell]),
);

/** Cases de départ, dans l'ordre d'arrivée des joueurs (`GameEngine.spawnPoints`). */
export const SPAWN_POINTS: readonly { col: number; row: number }[] = [
  { col: 1, row: 1 },
  { col: MOCK_GRID.columns - 2, row: 1 },
  { col: 1, row: MOCK_GRID.rows - 2 },
  { col: MOCK_GRID.columns - 2, row: MOCK_GRID.rows - 2 },
];

/**
 * `GAME_STATE` tel que le serveur l'envoie avant que quiconque ait bougé : chacun
 * des joueurs `arrived` (dans leur ordre d'arrivée) est sur sa case de départ,
 * sauf ceux de `left`, partis depuis. Le serveur l'envoie au nouveau venu, après
 * un départ, et au lancement de la partie.
 */
export function gameStateMessage(
  arrived: readonly LobbyPlayer[],
  left: readonly LobbyPlayer[] = [],
): GameStateMessage {
  return {
    type: 'GAME_STATE',
    players: arrived.flatMap(({ playerId, playerName }, index) =>
      left.some((player) => player.playerId === playerId)
        ? []
        : [{ playerId, name: playerName, ...SPAWN_POINTS[index], alive: true, score: 0 }],
    ),
    grid: { ...MOCK_GRID },
    map: MOCK_MAP.map((row) => [...row]),
  };
}
