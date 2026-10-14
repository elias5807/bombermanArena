// Messages envoyés par le client vers le serveur

export interface JoinLobbyMessage {
  type: 'JOIN_LOBBY';
  playerName: string;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveMessage {
  type: 'MOVE';
  playerId: string;
  direction: Direction;
}

export interface PlaceBombMessage {
  type: 'PLACE_BOMB';
  playerId: string;
}

export interface StartGameMessage {
  type: 'START_GAME';
}

export type ClientMessage =
  | JoinLobbyMessage
  | MoveMessage
  | PlaceBombMessage
  | StartGameMessage;

// Messages envoyés par le serveur vers joueurs

export interface PlayerJoinedMessage {
  type: 'PLAYER_JOINED';
  playerId: string;
  playerName: string;
}

export interface LobbyStatusMessage {
  type: 'LOBBY_STATUS';
  players: { playerId: string; playerName: string }[];
}

export interface GameStartedMessage {
  type: 'GAME_STARTED';
  players: string[]; // liste des playerId au démarrage
}

/**
 * Coordonnées et état d'un joueur synchronisé sur la grille.
 */
export interface PlayerStateDTO {
  playerId: string;
  name?: string;
  col: number;
  row: number;
  alive: boolean;
  score?: number;
}

/**
 * Message envoyé lorsqu'un joueur se déplace avec validation autoritaire du serveur.
 */
export interface PositionUpdatedMessage {
  type: 'POSITION_UPDATED';
  playerId: string;
  col: number;
  row: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

/**
 * Message diffusé quand une bombe est posée.
 */
export interface BombPlacedMessage {
  type: 'BOMB_PLACED';
  bombId: string;
  playerId: string;
  col: number;
  row: number;
}

/**
 * Message diffusé quand une bombe explose.
 */
export interface BombExplodedMessage {
  type: 'BOMB_EXPLODED';
  bombId: string;
  col: number;
  row: number;
  affectedCells: { col: number; row: number }[];
  destroyedBricks?: { col: number; row: number }[];
  eliminatedPlayers?: string[];
}

/**
 * Message de synchronisation d'état complet du jeu (au démarrage ou après reconnexion).
 */
export interface GameStateMessage {
  type: 'GAME_STATE';
  players: PlayerStateDTO[];
  grid?: {
    columns: number;
    rows: number;
  };
  map?: number[][];
}

export type ServerMessage =
  | PlayerJoinedMessage
  | LobbyStatusMessage
  | GameStartedMessage
  | PositionUpdatedMessage
  | GameStateMessage
  | BombPlacedMessage
  | BombExplodedMessage;
