import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type {
  ServerMessage,
  GameStateMessage,
  LobbyStatusMessage,
  Direction,
} from '@bomberman-area/shared';
import { DEFAULT_COLUMNS, DEFAULT_ROWS, generateGrid, isWalkable } from './grid.js';

export const MAX_PLAYERS = 4;

export interface ServerPlayer {
  playerId: string;
  playerName: string;
  socket: WebSocket;
  col: number;
  row: number;
  alive: boolean;
  score: number;
}

export interface ServerBomb {
  bombId: string;
  col: number;
  row: number;
  ownerId: string;
  timer: NodeJS.Timeout;
}

export class GameEngine {
  readonly columns: number;
  readonly rows: number;
  map: number[][];

  private readonly players = new Map<string, ServerPlayer>();
  private readonly bombs = new Map<string, ServerBomb>();

  private readonly spawnPoints: { col: number; row: number }[];

  constructor(columns = DEFAULT_COLUMNS, rows = DEFAULT_ROWS) {
    this.columns = columns;
    this.rows = rows;
    this.map = generateGrid(columns, rows);

    this.spawnPoints = [
      { col: 1, row: 1 },
      { col: columns - 2, row: 1 },
      { col: 1, row: rows - 2 },
      { col: columns - 2, row: rows - 2 },
    ];
  }

  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.socket.readyState === 1 /* WebSocket.OPEN */) {
        player.socket.send(data);
      }
    }
  }

  sendTo(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === 1 /* WebSocket.OPEN */) {
      socket.send(JSON.stringify(message));
    }
  }

  addPlayer(socket: WebSocket, playerName: string): string | null {
    if (this.players.size >= MAX_PLAYERS) {
      console.warn(`Lobby plein, ${playerName} ne peut pas rejoindre.`);
      return null;
    }

    const playerId = randomUUID();
    const spawnIndex = this.players.size;
    const spawn = this.spawnPoints[spawnIndex % this.spawnPoints.length] ?? { col: 1, row: 1 };

    const player: ServerPlayer = {
      playerId,
      playerName,
      socket,
      col: spawn.col,
      row: spawn.row,
      alive: true,
      score: 0,
    };

    this.players.set(playerId, player);

    // Annoncer à tout le monde l'arrivée du joueur et l'état du lobby
    this.broadcast({ type: 'PLAYER_JOINED', playerId, playerName });
    this.broadcast(this.buildLobbyStatus());

    // Envoyer l'état de jeu actuel (y compris la carte synchronisée) au joueur qui vient de se connecter
    this.sendTo(socket, this.buildGameState());

    // Si le lobby est plein, on lance automatiquement la partie
    if (this.players.size >= MAX_PLAYERS) {
      this.startGame();
    }

    return playerId;
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      this.broadcast(this.buildLobbyStatus());
      this.broadcast(this.buildGameState());
    }
  }

  getPlayer(playerId: string): ServerPlayer | undefined {
    return this.players.get(playerId);
  }

  getPlayersCount(): number {
    return this.players.size;
  }

  buildLobbyStatus(): LobbyStatusMessage {
    return {
      type: 'LOBBY_STATUS',
      players: Array.from(this.players.values()).map(({ playerId, playerName }) => ({
        playerId,
        playerName,
      })),
    };
  }

  buildGameState(): GameStateMessage {
    return {
      type: 'GAME_STATE',
      players: Array.from(this.players.values()).map((p) => ({
        playerId: p.playerId,
        name: p.playerName,
        col: p.col,
        row: p.row,
        alive: p.alive,
        score: p.score,
      })),
      grid: {
        columns: this.columns,
        rows: this.rows,
      },
      map: this.map.map((row) => [...row]),
    };
  }

  startGame(): void {
    // Régénérer une carte fraîche pour la nouvelle partie
    this.map = generateGrid(this.columns, this.rows);

    // Nettoyer les bombes existantes
    for (const bomb of this.bombs.values()) {
      clearTimeout(bomb.timer);
    }
    this.bombs.clear();

    // Replacer chaque joueur sur son point de départ
    let i = 0;
    for (const player of this.players.values()) {
      const spawn = this.spawnPoints[i % this.spawnPoints.length] ?? { col: 1, row: 1 };
      player.col = spawn.col;
      player.row = spawn.row;
      player.alive = true;
      player.score = 0;
      i++;
    }

    const playerIds = Array.from(this.players.keys());
    this.broadcast({ type: 'GAME_STARTED', players: playerIds });
    this.broadcast(this.buildGameState());
  }

  movePlayer(playerId: string, direction: Direction): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.alive) {
      return false;
    }

    let targetCol = player.col;
    let targetRow = player.row;

    if (direction === 'up') targetRow -= 1;
    else if (direction === 'down') targetRow += 1;
    else if (direction === 'left') targetCol -= 1;
    else if (direction === 'right') targetCol += 1;

    // Validation autoritaire des collisions (murs, briques, bombes)
    if (!isWalkable(this.map, targetCol, targetRow, (c, r) => this.hasBomb(c, r))) {
      return false;
    }

    player.col = targetCol;
    player.row = targetRow;

    // Diffuser la nouvelle position à TOUS les joueurs du serveur
    this.broadcast({
      type: 'POSITION_UPDATED',
      playerId,
      col: player.col,
      row: player.row,
      direction,
    });

    return true;
  }

  placeBomb(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.alive) {
      return false;
    }

    const bombCol = player.col;
    const bombRow = player.row;

    if (this.hasBomb(bombCol, bombRow)) {
      return false;
    }

    const bombId = randomUUID();
    const timer = setTimeout(() => {
      this.explodeBomb(bombId);
    }, 2500);

    const bomb: ServerBomb = {
      bombId,
      col: bombCol,
      row: bombRow,
      ownerId: playerId,
      timer,
    };

    this.bombs.set(bombId, bomb);

    // Diffuser la pose de la bombe à tout le monde
    this.broadcast({
      type: 'BOMB_PLACED',
      bombId,
      playerId,
      col: bombCol,
      row: bombRow,
    });

    return true;
  }

  private hasBomb(col: number, row: number): boolean {
    for (const bomb of this.bombs.values()) {
      if (bomb.col === col && bomb.row === row) {
        return true;
      }
    }
    return false;
  }

  private explodeBomb(bombId: string): void {
    const bomb = this.bombs.get(bombId);
    if (!bomb) return;

    this.bombs.delete(bombId);

    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];

    const affectedCells: { col: number; row: number }[] = [{ col: bomb.col, row: bomb.row }];
    const destroyedBricks: { col: number; row: number }[] = [];
    const owner = this.players.get(bomb.ownerId);

    // Portée de la bombe (2 cases)
    const range = 2;
    for (const d of dirs) {
      for (let step = 1; step <= range; step++) {
        const nr = bomb.row + (d[0] ?? 0) * step;
        const nc = bomb.col + (d[1] ?? 0) * step;

        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.columns) {
          break;
        }

        const cell = this.map[nr]?.[nc];
        if (cell === 1) {
          // Mur incassable bloque le souffle
          break;
        }

        affectedCells.push({ col: nc, row: nr });

        if (cell === 2) {
          // Brique détruite par l'explosion
          if (this.map[nr]) {
            this.map[nr][nc] = 0;
          }
          destroyedBricks.push({ col: nc, row: nr });
          if (owner) {
            owner.score += 50;
          }
          break; // Le souffle s'arrête à la première brique détruite
        }
      }
    }

    // Détection des joueurs touchés
    const eliminatedPlayers: string[] = [];
    for (const player of this.players.values()) {
      if (player.alive) {
        const isHit = affectedCells.some((cell) => cell.col === player.col && cell.row === player.row);
        if (isHit) {
          player.alive = false;
          eliminatedPlayers.push(player.playerId);
          if (owner && owner.playerId !== player.playerId) {
            owner.score += 200;
          }
        }
      }
    }

    // Diffuser l'explosion à tous les joueurs
    this.broadcast({
      type: 'BOMB_EXPLODED',
      bombId,
      col: bomb.col,
      row: bomb.row,
      affectedCells,
      destroyedBricks,
      eliminatedPlayers,
    });
  }
}
