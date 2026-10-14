export const DEFAULT_COLUMNS = 15;
export const DEFAULT_ROWS = 13;

export function generateGrid(columns = DEFAULT_COLUMNS, rows = DEFAULT_ROWS): number[][] {
  const map: number[][] = [];

  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < columns; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === columns - 1) {
        map[r][c] = 1; // Murs incassables en bordure
      } else if (r % 2 === 0 && c % 2 === 0) {
        map[r][c] = 1; // Piliers incassables
      } else {
        // Laisser dégagées les zones de spawn dans les 4 coins
        const isP1Spawn = r < 3 && c < 3;
        const isP2Spawn = r < 3 && c >= columns - 3;
        const isP3Spawn = r >= rows - 3 && c < 3;
        const isP4Spawn = r >= rows - 3 && c >= columns - 3;

        if (!isP1Spawn && !isP2Spawn && !isP3Spawn && !isP4Spawn && Math.random() < 0.35) {
          map[r][c] = 2; // Bloc cassable
        } else {
          map[r][c] = 0; // Sol vide
        }
      }
    }
  }

  return map;
}

export function isWalkable(
  map: number[][],
  col: number,
  row: number,
  isBombAt?: (c: number, r: number) => boolean,
): boolean {
  if (row < 0 || row >= map.length) return false;
  const rowArr = map[row];
  if (!rowArr || col < 0 || col >= rowArr.length) return false;

  // 1 = mur incassable, 2 = brique destructible
  if (rowArr[col] !== 0) return false;

  if (isBombAt && isBombAt(col, row)) return false;

  return true;
}
