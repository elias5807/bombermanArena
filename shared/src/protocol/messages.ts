// Messages envoyés par le client vers le serveur

export interface JoinLobbyMessage {
  type: 'JOIN_LOBBY';
  playerName: string;
}

export interface MoveMessage {
  type: 'MOVE';
  playerId: string;
  direction: 'up' | 'down' | 'left' | 'right';
}

export type ClientMessage = JoinLobbyMessage | MoveMessage;

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
 * Message de synchronisation d'état complet du jeu (au démarrage ou après reconnexion).
 */
export interface GameStateMessage {
  type: 'GAME_STATE';
  players: PlayerStateDTO[];
  grid?: {
    columns: number;
    rows: number;
  };
}

export type ServerMessage =
  | PlayerJoinedMessage
  | LobbyStatusMessage
  | GameStartedMessage
  | PositionUpdatedMessage
  | GameStateMessage;