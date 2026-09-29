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

export interface PositionUpdatedMessage {
  type: 'POSITION_UPDATED';
  playerId: string;
  position: string; // a affiner plus tard
}

export type ServerMessage =
  | PlayerJoinedMessage
  | LobbyStatusMessage
  | GameStartedMessage
  | PositionUpdatedMessage;