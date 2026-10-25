import { Container, Graphics, Sprite } from 'pixi.js';
import type {
  BombExplodedMessage,
  BombPlacedMessage,
  GameStateMessage,
  PositionUpdatedMessage,
} from '@shared/protocol/messages';
import type { AppEventBus } from '../../core/AppEvents';
import { GridLayout, type GridSize, type Viewport } from '../GridLayout';
import type { SpriteKey, SpriteTextures } from '../sprites/loadSprites';
import type { Scene } from './Scene';

/** Espace laissé autour de la grille, en pixels. */
const MARGIN = 16;
const BORDER_COLOR = 0x111315;
const BORDER_WIDTH = 4;

/** Délai après lequel une bombe posée se met à clignoter, en millisecondes. */
export const BOMB_TICKING_DELAY_MS = 1500;
/** Durée d'affichage du souffle d'une explosion, en millisecondes. */
export const EXPLOSION_DURATION_MS = 400;

const PLAYER_TEXTURE_KEYS: SpriteKey[] = ['player1', 'player2', 'player3', 'player4'];

/** Valeurs des cases de `GameStateMessage.map`. */
const CELL_WALL = 1;
const CELL_BRICK = 2;

/** Un joueur tel que le serveur l'a décrit : sa case (`r` = ligne, `c` = colonne) et son sprite. */
interface PlayerView {
  id: string;
  r: number;
  c: number;
  alive: boolean;
  textureKey: SpriteKey;
}

interface BombView {
  r: number;
  c: number;
  ticking: boolean;
}

/**
 * Scène de la partie : dessine l'état envoyé par le serveur (sol, murs, briques, bombes,
 * explosions, joueurs) avec les sprites PixiJS.
 *
 * La scène ne décide de rien : elle ne simule pas la partie et ne sait pas qui gagne. Elle
 * écoute `server:GAME_STATE`, `server:POSITION_UPDATED`, `server:BOMB_PLACED` et
 * `server:BOMB_EXPLODED` et projette leur contenu sur la grille via `GridLayout`. Ses
 * seules minuteries sont visuelles (bombe qui clignote, souffle effacé) ; `destroy()` les
 * annule. Tant qu'aucun `GAME_STATE` n'est arrivé, elle dessine une grille vide.
 */
export class GameScene implements Scene {
  readonly view = new Container();

  private readonly grid: GridSize;
  private readonly textures: SpriteTextures;
  private readonly border = new Graphics();

  // Ordre d'affichage (z-index des couches PixiJS)
  private readonly floorLayer = new Container();
  private readonly wallsLayer = new Container();
  private readonly entitiesLayer = new Container();
  // Dans `entitiesLayer` : bombes et explosions, refaites à chaque changement, puis joueurs.
  private readonly effectsLayer = new Container();
  private readonly playersLayer = new Container();

  private currentLayout: GridLayout | undefined;

  // 0 = vide, 1 = incassable, 2 = cassable ; vide tant que le serveur n'a rien envoyé.
  private map: number[][] = [];

  private players: PlayerView[] = [];

  /**
   * Sprites persistants des joueurs (clé : playerId), pour ne pas les réallouer à chaque
   * message du serveur.
   */
  private readonly playerSprites = new Map<string, Sprite>();

  /** Bombes posées, par `bombId`. */
  private readonly bombs = new Map<string, BombView>();
  private explosions: { r: number; c: number }[] = [];

  /** Minuteries visuelles en cours, annulées par `destroy()`. */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly unsubscribers: (() => void)[];

  /**
   * @param grid Dimensions du plateau, en cases.
   * @param textures Textures des sprites, chargées par `loadSprites`.
   * @param bus Bus d'événements de l'application : la scène y lit l'état du serveur.
   */
  constructor(grid: GridSize, textures: SpriteTextures, bus: AppEventBus) {
    this.grid = grid;
    this.textures = textures;

    this.view.addChild(this.floorLayer);
    this.view.addChild(this.wallsLayer);
    this.view.addChild(this.entitiesLayer);
    this.view.addChild(this.border);
    this.entitiesLayer.addChild(this.effectsLayer);
    this.entitiesLayer.addChild(this.playersLayer);

    this.unsubscribers = [
      bus.on('server:GAME_STATE', (message) => this.handleGameState(message)),
      bus.on('server:POSITION_UPDATED', (message) => this.handlePositionUpdated(message)),
      bus.on('server:BOMB_PLACED', (message) => this.handleBombPlaced(message)),
      bus.on('server:BOMB_EXPLODED', (message) => this.handleBombExploded(message)),
    ];
  }

  /**
   * Applique un état complet du jeu : la carte, et les joueurs (créés, déplacés, ou retirés
   * de l'écran quand ils sont absents du message).
   *
   * La scène l'appelle pour chaque `server:GAME_STATE` ; `main.ts` l'appelle aussi une fois,
   * à sa création, avec l'état reçu avant qu'elle existe.
   */
  handleGameState(message: GameStateMessage): void {
    if (message.map && message.map.length > 0) {
      this.map = message.map.map((row) => [...row]);
      if (this.currentLayout) {
        this.drawWalls(this.currentLayout);
      }
    }

    const activePlayerIds = new Set(message.players.map((p) => p.playerId));
    for (const id of this.playerSprites.keys()) {
      if (!activePlayerIds.has(id)) {
        this.removePlayerSprite(id);
      }
    }

    this.players = message.players.map((dto, index) => {
      const existing = this.players.find((p) => p.id === dto.playerId);
      return {
        id: dto.playerId,
        r: dto.row,
        c: dto.col,
        alive: dto.alive,
        textureKey: existing?.textureKey ?? PLAYER_TEXTURE_KEYS[index % PLAYER_TEXTURE_KEYS.length],
      };
    });

    for (const player of this.players) {
      this.updatePlayerSprite(player);
    }
  }

  get layout(): GridLayout | undefined {
    return this.currentLayout;
  }

  /** @throws RangeError si les dimensions de la grille sont invalides. */
  resize(viewport: Viewport): void {
    this.currentLayout = GridLayout.fit(this.grid, viewport, MARGIN);
    this.drawAll();
  }

  /** Libère la scène : écouteurs du bus, minuteries, sprites et toute la hiérarchie PixiJS. */
  destroy(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }

    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Les sprites des joueurs sont détruits avec la vue, dont ils sont les enfants.
    this.playerSprites.clear();

    if (!this.view.destroyed) {
      this.view.destroy({ children: true });
    }
  }

  /** Déplacement validé par le serveur. Un joueur inconnu attend le prochain `GAME_STATE`. */
  private handlePositionUpdated(message: PositionUpdatedMessage): void {
    const player = this.players.find((p) => p.id === message.playerId);
    if (!player) return;

    player.c = message.col;
    player.r = message.row;
    this.updatePlayerSprite(player);
  }

  private handleBombPlaced(message: BombPlacedMessage): void {
    if (this.bombs.has(message.bombId)) return;

    const bomb: BombView = { r: message.row, c: message.col, ticking: false };
    this.bombs.set(message.bombId, bomb);
    this.redrawEntities();

    this.schedule(() => {
      bomb.ticking = true;
      this.redrawEntities();
    }, BOMB_TICKING_DELAY_MS);
  }

  private handleBombExploded(message: BombExplodedMessage): void {
    // Sa minuterie de clignotement, si elle tourne encore, ne retrouvera plus la bombe à l'écran.
    this.bombs.delete(message.bombId);

    if (message.destroyedBricks && message.destroyedBricks.length > 0) {
      for (const brick of message.destroyedBricks) {
        if (this.map[brick.row]) {
          this.map[brick.row][brick.col] = 0;
        }
      }
      if (this.currentLayout) {
        this.drawWalls(this.currentLayout);
      }
    }

    // Le redessin ci-dessous retire leur sprite.
    for (const id of message.eliminatedPlayers ?? []) {
      const player = this.players.find((p) => p.id === id);
      if (player) {
        player.alive = false;
      }
    }

    const blast = message.affectedCells.map((cell) => ({ r: cell.row, c: cell.col }));
    this.explosions.push(...blast);
    this.redrawEntities();

    this.schedule(() => {
      this.explosions = this.explosions.filter((cell) => !blast.includes(cell));
      this.redrawEntities();
    }, EXPLOSION_DURATION_MS);
  }

  /** `setTimeout` que `destroy()` annule. */
  private schedule(callback: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delayMs);
    this.timers.add(timer);
  }

  /**
   * Crée, place ou retire le sprite d'un joueur selon son état.
   *
   * Le sprite saute d'une case à l'autre. Pour un déplacement fluide, retenir ici la
   * position cible et l'approcher à chaque image (interpolation dans `app.ticker`) ;
   * la direction de `POSITION_UPDATED` servira alors à animer la marche.
   */
  private updatePlayerSprite(player: PlayerView): void {
    if (!player.alive) {
      this.removePlayerSprite(player.id);
      return;
    }
    if (!this.currentLayout) return;

    let sprite = this.playerSprites.get(player.id);
    if (!sprite) {
      sprite = new Sprite(this.textures[player.textureKey]);
      this.playerSprites.set(player.id, sprite);
      this.playersLayer.addChild(sprite);
    }

    this.applySpriteLayout(sprite, player, this.currentLayout);
  }

  private removePlayerSprite(id: string): void {
    const sprite = this.playerSprites.get(id);
    if (!sprite) return;

    this.playersLayer.removeChild(sprite);
    sprite.destroy();
    this.playerSprites.delete(id);
  }

  /**
   * Taille du sprite proportionnelle à la case (textures de référence en 16 px), centré
   * horizontalement et calé au sol (pieds du personnage en bas de case).
   */
  private applySpriteLayout(sprite: Sprite, player: PlayerView, layout: GridLayout): void {
    const tex = sprite.texture;
    const size = layout.cellSize;
    const cellOrigin = layout.cellOrigin({ column: player.c, row: player.r });

    const width = (tex.width / 16) * size;
    const height = (tex.height / 16) * size;
    sprite.width = width;
    sprite.height = height;
    sprite.x = cellOrigin.x + (size - width) / 2;
    sprite.y = cellOrigin.y + size - height;
  }

  private drawAll() {
    if (!this.currentLayout) return;
    this.drawFloor(this.currentLayout);
    this.drawWalls(this.currentLayout);
    this.drawEntities(this.currentLayout);

    this.border.clear();
    this.border
      .rect(
        this.currentLayout.originX,
        this.currentLayout.originY,
        this.currentLayout.width,
        this.currentLayout.height,
      )
      .stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, alignment: 1 });
  }

  private drawFloor(layout: GridLayout): void {
    clearLayer(this.floorLayer);

    for (let row = 0; row < layout.rows; row += 1) {
      for (let column = 0; column < layout.columns; column += 1) {
        this.floorLayer.addChild(this.cellSprite('floor', layout, column, row));
      }
    }
  }

  private drawWalls(layout: GridLayout): void {
    clearLayer(this.wallsLayer);

    for (let row = 0; row < layout.rows; row += 1) {
      for (let column = 0; column < layout.columns; column += 1) {
        const cell = this.map[row]?.[column];
        if (cell === CELL_WALL || cell === CELL_BRICK) {
          const key = cell === CELL_WALL ? 'wall' : 'brick';
          this.wallsLayer.addChild(this.cellSprite(key, layout, column, row));
        }
      }
    }
  }

  /** Sprite qui couvre exactement la case. */
  private cellSprite(key: SpriteKey, layout: GridLayout, column: number, row: number): Sprite {
    const { x, y } = layout.cellOrigin({ column, row });
    const sprite = new Sprite(this.textures[key]);
    sprite.x = x;
    sprite.y = y;
    sprite.width = layout.cellSize;
    sprite.height = layout.cellSize;
    return sprite;
  }

  private redrawEntities() {
    if (this.currentLayout) {
      this.drawEntities(this.currentLayout);
    }
  }

  /** Explosions, puis bombes, puis joueurs par-dessus. */
  private drawEntities(layout: GridLayout): void {
    clearLayer(this.effectsLayer);

    for (const { r, c } of this.explosions) {
      this.effectsLayer.addChild(this.centeredSprite('explosion', layout, c, r));
    }

    for (const { r, c, ticking } of this.bombs.values()) {
      this.effectsLayer.addChild(
        this.centeredSprite(ticking ? 'bomb_ticking' : 'bomb', layout, c, r),
      );
    }

    for (const player of this.players) {
      this.updatePlayerSprite(player);
    }
  }

  /** Sprite à la taille de sa texture (référence 16 px), centré dans la case. */
  private centeredSprite(key: SpriteKey, layout: GridLayout, column: number, row: number): Sprite {
    const texture = this.textures[key];
    const size = layout.cellSize;
    const { x, y } = layout.cellOrigin({ column, row });
    const sprite = new Sprite(texture);
    sprite.width = (texture.width / 16) * size;
    sprite.height = (texture.height / 16) * size;
    sprite.x = x + (size - sprite.width) / 2;
    sprite.y = y + (size - sprite.height) / 2;
    return sprite;
  }
}

/** Vide une couche en libérant ses sprites (les textures, partagées, sont gardées). */
function clearLayer(layer: Container): void {
  for (const child of layer.removeChildren()) {
    child.destroy();
  }
}
