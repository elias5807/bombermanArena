import type {
  BombExplodedMessage,
  GameStartedMessage,
  GameStateMessage,
} from '@shared/protocol/messages';
import type { AppEventBus, GameOutcome } from '../core/AppEvents';

/** Un joueur de la partie, tel que le client le connaît. */
export interface PlayerInfo {
  readonly playerId: string;
  /** Nom du joueur, inconnu tant qu'aucun `GAME_STATE` ne l'a donné. */
  readonly name?: string;
  readonly alive: boolean;
}

/**
 * Ce que le client sait de la partie, tenu à jour d'après le bus : l'identifiant
 * du joueur local (`session:joined`) et les joueurs annoncés par le serveur.
 *
 * Publie `state:gameOver` une fois par partie, quand il ne reste qu'un joueur en vie,
 * ou aucun, après un `GAME_STARTED`. Les éliminations (`BOMB_EXPLODED`) comptent, tout
 * comme les départs : un joueur absent d'un `GAME_STATE` a quitté la partie.
 *
 * Tout est oublié quand la connexion se ferme (`connection:closed`) ou se coupe
 * (`connection:lost`) : le serveur retire alors le joueur, qui aura un nouvel identifiant
 * à la connexion suivante.
 *
 * PROVISOIRE : le serveur n'annonce pas la fin de partie. Quand il enverra un message
 * `GAME_OVER`, c'est lui qui déclenchera `state:gameOver` ; les abonnés n'auront rien à changer.
 *
 * @example
 * const state = new GameState(bus);
 * bus.on('state:gameOver', ({ outcome }) => console.log(outcome, state.isLocalPlayerAlive));
 */
export class GameState {
  private readonly bus: AppEventBus;
  private ownPlayerId: string | null = null;
  private readonly roster = new Map<string, PlayerInfo>();
  /** `idle` avant le premier `GAME_STARTED`, `over` une fois la fin publiée. */
  private phase: 'idle' | 'playing' | 'over' = 'idle';
  private startingPlayerCount = 0;

  constructor(bus: AppEventBus) {
    this.bus = bus;
    bus.on('session:joined', ({ playerId }) => {
      this.ownPlayerId = playerId;
    });
    bus.on('server:GAME_STARTED', (message) => this.start(message));
    bus.on('server:GAME_STATE', (message) => this.synchronize(message));
    bus.on('server:BOMB_EXPLODED', (message) => this.eliminate(message));
    bus.on('connection:closed', () => this.reset());
    bus.on('connection:lost', () => this.reset());
  }

  /** Identifiant du joueur local, `null` tant qu'il n'a pas rejoint la salle d'attente. */
  get localPlayerId(): string | null {
    return this.ownPlayerId;
  }

  /** `true` si le joueur local est connu, dans la partie et en vie. */
  get isLocalPlayerAlive(): boolean {
    return this.ownPlayerId !== null && this.roster.get(this.ownPlayerId)?.alive === true;
  }

  /** Les joueurs de la partie, dans l'ordre où le serveur les a donnés. */
  get players(): readonly PlayerInfo[] {
    return [...this.roster.values()];
  }

  private start({ players }: GameStartedMessage): void {
    this.roster.clear();
    for (const playerId of players) {
      this.roster.set(playerId, { playerId, alive: true });
    }
    this.startingPlayerCount = players.length;
    this.phase = 'playing';
  }

  /**
   * Oublie la session. Sans cela, quitter en pleine partie laisserait la phase à `playing` :
   * le premier `GAME_STATE` du salon suivant, où le joueur est seul, passerait pour une victoire.
   */
  private reset(): void {
    this.ownPlayerId = null;
    this.roster.clear();
    this.phase = 'idle';
  }

  private synchronize({ players }: GameStateMessage): void {
    // L'état du serveur fait foi : qui n'y figure plus a quitté la partie.
    const known = new Map(this.roster);
    this.roster.clear();
    for (const { playerId, name, alive } of players) {
      this.roster.set(playerId, { playerId, name: name ?? known.get(playerId)?.name, alive });
    }
    this.checkGameOver();
  }

  private eliminate({ eliminatedPlayers = [] }: BombExplodedMessage): void {
    for (const playerId of eliminatedPlayers) {
      const player = this.roster.get(playerId);
      if (player) {
        this.roster.set(playerId, { ...player, alive: false });
      }
    }
    this.checkGameOver();
  }

  private checkGameOver(): void {
    if (this.phase !== 'playing') {
      return;
    }
    const survivors = [...this.roster.values()].filter((player) => player.alive);
    // Une partie lancée seul (le serveur l'accepte) ne se termine qu'à la mort de ce joueur.
    const lastOneStanding = survivors.length === 1 && this.startingPlayerCount > 1;
    if (survivors.length > 0 && !lastOneStanding) {
      return;
    }

    this.phase = 'over';
    const winnerId = survivors[0]?.playerId ?? null;
    let outcome: GameOutcome = 'defeat';
    if (winnerId === null) {
      outcome = 'draw';
    } else if (winnerId === this.ownPlayerId) {
      outcome = 'victory';
    }
    this.bus.emit('state:gameOver', { winnerId, outcome });
  }
}
