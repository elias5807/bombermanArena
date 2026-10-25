import type { AppEventBus } from '../core/AppEvents';
import type { GameState, PlayerInfo } from '../state/GameState';

/** Nombre de couleurs de joueur (sprites `joueur_1` à `joueur_4`). */
const PLAYER_COLORS = 4;

/**
 * Liste des joueurs de la partie, à gauche du plateau : une ligne par joueur présent,
 * avec son sprite, son nom et son état (« En jeu » ou « Éliminé »). Le joueur local
 * est mis en évidence, les éliminés sont grisés.
 *
 * Lit `GameState`, déjà à jour quand `server:GAME_STATE` et `server:BOMB_EXPLODED`
 * arrivent ici (`App` l'abonne en premier). Les noms viennent des autres joueurs :
 * ils passent par `textContent`.
 *
 * Chaque joueur garde la couleur reçue à sa première apparition, selon son rang dans
 * le `GAME_STATE` : la même règle que `GameScene`, pour que la ligne et le sprite du
 * plateau aient la même couleur. Comme `GameScene`, créée au premier `GAME_STARTED`,
 * le HUD ignore les `GAME_STATE` du salon : il reste vide jusque-là.
 */
export class Hud {
  private readonly list: HTMLElement;
  private readonly state: Pick<GameState, 'players' | 'localPlayerId'>;
  private readonly colors = new Map<string, number>();
  private started = false;
  private readonly unsubscribers: (() => void)[];

  constructor(
    list: HTMLElement,
    bus: AppEventBus,
    state: Pick<GameState, 'players' | 'localPlayerId'>,
  ) {
    this.list = list;
    this.state = state;
    this.unsubscribers = [
      // Le GAME_STATE qui suit aussitôt GAME_STARTED donne les noms : il sera affiché.
      bus.on('server:GAME_STARTED', () => {
        this.started = true;
      }),
      bus.on('server:GAME_STATE', () => this.render()),
      bus.on('server:BOMB_EXPLODED', () => this.render()),
    ];
    this.render();
  }

  /** Se désabonne du bus. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  private render(): void {
    const players = this.started ? this.state.players : [];
    players.forEach((player, index) => {
      if (!this.colors.has(player.playerId)) {
        this.colors.set(player.playerId, (index % PLAYER_COLORS) + 1);
      }
    });
    this.list.replaceChildren(...players.map((player) => this.createRow(player)));
  }

  private createRow(player: PlayerInfo): HTMLElement {
    const color = this.colors.get(player.playerId) ?? 1;
    const isLocal = player.playerId === this.state.localPlayerId;

    const row = document.createElement('div');
    row.className = `player-item p${color}`;
    row.classList.toggle('local', isLocal);
    row.classList.toggle('eliminated', !player.alive);

    const info = document.createElement('div');
    info.className = 'player-info';

    const avatar = document.createElement('img');
    avatar.src = `/assets/sprites/joueur_${color}.png`;
    avatar.className = 'hud-avatar';
    avatar.alt = `P${color}`;

    const name = document.createElement('span');
    name.className = 'player-name';
    const displayName = player.name ?? `Joueur ${color}`;
    name.textContent = isLocal ? `${displayName} (vous)` : displayName;

    const status = document.createElement('div');
    status.className = 'player-status';
    status.textContent = player.alive ? 'En jeu' : 'Éliminé';

    info.append(avatar, name);
    row.append(info, status);
    return row;
  }
}
