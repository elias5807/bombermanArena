import type { GameStateMessage, MoveMessage, ServerMessage } from '@shared/protocol/messages';
import type { EventBus } from './EventBus';

/** Direction d'un déplacement, telle que le protocole partagé la définit. */
export type Direction = MoveMessage['direction'];

/**
 * État de la connexion au serveur, réel ou simulé. Publié par `App`, qui ouvre
 * et ferme la connexion, et par le pont connexion ↔ bus pour un envoi qui échoue.
 */
export interface ConnectionEvents {
  /** La connexion est ouverte : les messages peuvent partir et arriver. */
  'connection:opened': undefined;
  /** Le client a fermé la connexion, qui était ouverte. */
  'connection:closed': undefined;
  /** La connexion n'a pas pu s'ouvrir, ou un message n'a pas pu être envoyé. */
  'connection:error': { error: unknown };
}

/**
 * Messages reçus du serveur : un événement `server:<TYPE>` par message du
 * protocole partagé, avec le message tel quel pour donnée. Par exemple
 * `server:LOBBY_STATUS` porte un `LobbyStatusMessage`.
 *
 * La liste est déduite de `ServerMessage` : un message ajouté à `shared/` a
 * aussitôt son événement, sans rien modifier ici.
 */
export type ServerEvents = {
  [Message in ServerMessage as `server:${Message['type']}`]: Message;
};

/**
 * Événements réseau haut niveau / sémantiques publiés sur le bus interne du client
 * pour découpler les modules de rendu (PixiJS) du protocole de transport brut.
 */
export interface NetworkEvents {
  /** Un joueur s'est déplacé selon l'état autoritaire du serveur. */
  'network:playerMoved': {
    playerId: string;
    col: number;
    row: number;
    direction?: Direction;
  };
  /** Synchronisation globale de l'état du jeu (initial ou après reconnexion). */
  'network:gameState': GameStateMessage;
}

/**
 * Ce que le joueur demande. Publié par les couches qui lisent ses actions
 * (`input/`, `ui/`) ; le pont connexion ↔ bus en fait des messages pour le serveur.
 */
export interface InputEvents {
  /** Rejoindre la salle d'attente sous ce nom. */
  'input:join': { playerName: string };
  /** Se déplacer d'une case. */
  'input:move': { direction: Direction };
  /** Poser une bombe. Transmis au serveur via PLACE_BOMB. */
  'input:bomb': undefined;
  /** Lancer la partie depuis la salle d'attente. */
  'input:start': undefined;
}

/**
 * Catalogue des événements du bus de l'application : nom de l'événement → type
 * de sa donnée. Le préfixe dit d'où vient l'information : `connection:` la
 * liaison avec le serveur, `server:` ce que le serveur annonce, `network:` les
 * événements de jeu synchronisés, `input:` ce que le joueur demande.
 */
export type AppEvents = ConnectionEvents & ServerEvents & NetworkEvents & InputEvents;

/** Le bus de l'application, tel que les couches le reçoivent de `App`. */
export type AppEventBus = EventBus<AppEvents>;
