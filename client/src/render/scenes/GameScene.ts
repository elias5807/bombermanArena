import { Container, Graphics, Sprite } from 'pixi.js';
import type { GameStateMessage } from '@shared/protocol/messages';
import type { AppEventBus, Direction } from '../../core/AppEvents';
import { GridLayout, type GridSize, type Viewport } from '../GridLayout';
import type { SpriteKey, SpriteTextures } from '../sprites/loadSprites';
import type { Scene } from './Scene';

/** Espace laissé autour de la grille, en pixels. */
const MARGIN = 16;
const BORDER_COLOR = 0x111315;
const BORDER_WIDTH = 4;

const PLAYER_TEXTURE_KEYS: SpriteKey[] = ['player1', 'player2', 'player3', 'player4'];

/** Un joueur de la partie : sa case (`r` = ligne, `c` = colonne), son score et son sprite. */
export interface PlayerState {
  id: string;
  name: string;
  r: number;
  c: number;
  alive: boolean;
  score: number;
  textureKey: SpriteKey;
}

/** Ce que la scène signale à l'interface pendant la partie. Chaque fonction est facultative. */
export interface GameCallbacks {
  /** Les scores de tous les joueurs, après chaque explosion et quand la partie est relancée. */
  onScoreUpdate?: (scores: { id: string; score: number }[]) => void;
  /** Un joueur vient d'être touché par une explosion. */
  onPlayerEliminated?: (playerId: string) => void;
  /**
   * La partie est terminée. `winner` vaut `null` si le joueur local est éliminé ou s'il ne
   * reste aucun survivant ; `isVictory` est vrai quand le gagnant est le joueur local.
   */
  onGameOver?: (result: { winner: PlayerState | null; isVictory: boolean; reason: string }) => void;
}

/**
 * Scène de la partie : affiche le plateau avec les sprites PixiJS (sol, murs, blocs,
 * bombes, explosions, joueurs) sous l'autorité stricte du serveur.
 *
 * Principes architecturaux (SOLID) :
 * - Séparation stricte : Aucun import réseau direct (règle ESLint respectée).
 * - Communication découplée : Écoute du bus d'événements interne (`network:playerMoved`, `network:gameState`).
 * - Autorité serveur : Suppression des déplacements locaux arbitraires ; la scène n'est qu'un récepteur
 *   d'affichage projetant l'état du serveur sur la grille via `GridLayout`.
 * - Gestion du cycle de vie : Instanciation, mise à jour, suppression et nettoyage (destruction) des Sprites.
 */
export class GameScene implements Scene {
  readonly view = new Container();

  private readonly grid: GridSize;
  private readonly border = new Graphics();

  // Ordre d'affichage (z-index des couches PixiJS)
  private readonly floorLayer = new Container();
  private readonly wallsLayer = new Container();
  private readonly entitiesLayer = new Container();

  private currentLayout: GridLayout | undefined;

  // 0 = vide, 1 = incassable, 2 = cassable
  private map: number[][] = [];

  /** Joueurs synchronisés par le serveur autoritaire. */
  public players: PlayerState[] = [];

  /**
   * Instances de Sprite persistantes associées aux joueurs (clé: playerId).
   * Évite de détruire et réallouer des sprites à chaque frame ou événement réseau.
   */
  private readonly playerSprites = new Map<string, Sprite>();

  private bombs: { r: number; c: number; ownerId: string; ticking: boolean }[] = [];
  private explosions: { r: number; c: number }[] = [];

  private readonly textures: SpriteTextures;

  private callbacks: GameCallbacks | undefined;
  private isGameOver = false;

  private bus: AppEventBus | undefined;
  private unregisterBusListeners: (() => void) | undefined;

  /**
   * @param grid Dimensions du plateau, en cases.
   * @param textures Textures des sprites, chargées par `loadSprites`.
   * @param busOrCallbacks Bus d'événements de l'application (ou callbacks pour rétrocompatibilité).
   * @param callbacks Fonctions prévenues des événements de jeu.
   * @param initialPlayerName Nom du joueur local.
   */
  constructor(
    grid: GridSize,
    textures: SpriteTextures,
    busOrCallbacks?: AppEventBus | GameCallbacks,
    callbacks?: GameCallbacks,
    initialPlayerName: string = 'Vous',
  ) {
    this.grid = grid;
    this.textures = textures;

    // Détection polymorphe pour supporter à la fois new GameScene(grid, textures, bus)
    // et l'ancienne signature new GameScene(grid, textures, callbacks)
    if (busOrCallbacks && 'on' in busOrCallbacks) {
      this.bus = busOrCallbacks;
      this.callbacks = callbacks;
    } else {
      this.callbacks = busOrCallbacks as GameCallbacks | undefined;
    }

    this.view.addChild(this.floorLayer);
    this.view.addChild(this.wallsLayer);
    this.view.addChild(this.entitiesLayer);
    this.view.addChild(this.border);

    this.initPlayers(initialPlayerName);
    this.generateMap();

    if (this.bus) {
      this.bindEventBus(this.bus);
    }
  }

  /**
   * Abonne la scène aux événements du bus d'événements (EventBus).
   * Retourne la fonction de nettoyage permettant d'annuler les abonnements.
   */
  public bindEventBus(bus: AppEventBus): () => void {
    this.unbindEventBus();
    this.bus = bus;

    const unsubs = [
      bus.on('network:playerMoved', (payload) => this.handlePlayerMoved(payload)),
      bus.on('network:gameState', (message) => this.handleGameState(message)),
      // Prise en charge également des événements génériques server:*
      bus.on('server:POSITION_UPDATED', (message) =>
        this.handlePlayerMoved({
          playerId: message.playerId,
          col: message.col,
          row: message.row,
          direction: message.direction,
        }),
      ),
      bus.on('server:GAME_STATE', (message) => this.handleGameState(message)),
    ];

    const unbind = () => {
      for (const unsub of unsubs) {
        unsub();
      }
      this.unregisterBusListeners = undefined;
    };

    this.unregisterBusListeners = unbind;
    return unbind;
  }

  /**
   * Désabonne la scène du bus d'événements pour éviter les fuites mémoire.
   */
  public unbindEventBus(): void {
    if (this.unregisterBusListeners) {
      this.unregisterBusListeners();
      this.unregisterBusListeners = undefined;
    }
  }

  /**
   * Réception d'un déplacement validé par le serveur autoritaire.
   * Met à jour les coordonnées logiques et déplace le Sprite correspondant.
   */
  public handlePlayerMoved(payload: {
    playerId: string;
    col: number;
    row: number;
    direction?: Direction;
  }): void {
    let player = this.players.find((p) => p.id === payload.playerId);

    if (!player) {
      // Si le joueur n'a pas encore été déclaré via GAME_STATE, on crée son état
      const index = this.players.length;
      player = {
        id: payload.playerId,
        name: `Joueur ${index + 1}`,
        r: payload.row,
        c: payload.col,
        alive: true,
        score: 0,
        textureKey: PLAYER_TEXTURE_KEYS[index % PLAYER_TEXTURE_KEYS.length],
      };
      this.players.push(player);
    } else {
      // Mise à jour de la position logique dictée par le serveur
      player.c = payload.col;
      player.r = payload.row;
    }

    // Mise à jour de la position visuelle du Sprite
    this.updatePlayerSpritePosition(player, payload.direction);
  }

  /**
   * Synchronisation initiale ou périodique de l'état complet du jeu par le serveur autoritaire.
   * Crée, déplace ou supprime les sprites selon la présence des joueurs dans le message.
   */
  public handleGameState(message: GameStateMessage): void {
    const activePlayerIds = new Set(message.players.map((p) => p.playerId));

    // 1. Suppression des sprites des joueurs absents de l'état serveur
    for (const [id, sprite] of this.playerSprites.entries()) {
      if (!activePlayerIds.has(id)) {
        this.entitiesLayer.removeChild(sprite);
        sprite.destroy();
        this.playerSprites.delete(id);
      }
    }

    // 2. Mise à jour de la liste des joueurs
    this.players = message.players.map((dto, index) => {
      const existing = this.players.find((p) => p.id === dto.playerId);
      const textureKey = (existing?.textureKey ??
        PLAYER_TEXTURE_KEYS[index % PLAYER_TEXTURE_KEYS.length]) as SpriteKey;

      return {
        id: dto.playerId,
        name: dto.name ?? existing?.name ?? `Joueur ${index + 1}`,
        r: dto.row,
        c: dto.col,
        alive: dto.alive ?? true,
        score: dto.score ?? existing?.score ?? 0,
        textureKey,
      };
    });

    // 3. Synchronisation visuelle de tous les sprites avec la disposition actuelle
    this.syncPlayerSprites();
  }

  /**
   * Positionne le sprite d'un joueur à l'écran en utilisant GridLayout pour convertir
   * les coordonnées de grille (col, row) en pixels réels (x, y).
   *
   * =========================================================================================
   * NOTE D'INTERPOLATION (Client-Side Interpolation / LERP) :
   * =========================================================================================
   * Dans une architecture multijoueur temps réel (ex: 20 ticks réseau par seconde), modifier
   * brutalement `sprite.x` et `sprite.y` produit des saccades visuelles ("snapping").
   *
   * Pour obtenir un déplacement fluide entre deux cases sans attendre le prochain tick :
   *
   * 1. Stocker la position cible sur une structure de données d'interpolation :
   *    ```ts
   *    entity.targetX = targetPixelX;
   *    entity.targetY = targetPixelY;
   *    ```
   *
   * 2. Dans la boucle de rendu PixiJS (via `app.ticker.add((ticker) => ...)` ou Scene.update) :
   *    ```ts
   *    const delta = ticker.deltaTime;
   *    const lerpFactor = 0.25; // Facteur de lissage exponentiel (ou vitesse * dt)
   *    sprite.x += (entity.targetX - sprite.x) * lerpFactor;
   *    sprite.y += (entity.targetY - sprite.y) * lerpFactor;
   *    ```
   *
   * 3. Animation de marche :
   *    Si `direction` est fournie ('up' | 'down' | 'left' | 'right'), commuter les textures
   *    ou frames d'un `AnimatedSprite` pour animer les pas tant que la distance > seuil.
   * =========================================================================================
   */
  private updatePlayerSpritePosition(player: PlayerState, direction?: Direction): void {
    if (!this.currentLayout) {
      return;
    }

    // L'orientation du joueur pourra adapter la texture lors de l'ajout des sprites animés
    if (direction) {
      // Ex: this.updateSpriteDirection(sprite, direction);
    }

    let sprite = this.playerSprites.get(player.id);

    // Si le joueur est éliminé, on supprime son sprite
    if (!player.alive) {
      if (sprite) {
        this.entitiesLayer.removeChild(sprite);
        sprite.destroy();
        this.playerSprites.delete(player.id);
      }
      return;
    }

    // Création à la volée du Sprite s'il n'existe pas encore
    if (!sprite) {
      const tex = this.textures[player.textureKey];
      if (!tex) return;
      sprite = new Sprite(tex);
      this.playerSprites.set(player.id, sprite);
      this.entitiesLayer.addChild(sprite);
    } else if (sprite.parent !== this.entitiesLayer) {
      this.entitiesLayer.addChild(sprite);
    }

    this.applySpriteLayout(sprite, player, this.currentLayout);
  }

  /**
   * Calcule et applique les dimensions et coordonnées pixels exactes du sprite
   * à l'aide de GridLayout.
   */
  private applySpriteLayout(sprite: Sprite, player: PlayerState, layout: GridLayout): void {
    const tex = sprite.texture;
    const size = layout.cellSize;
    const cellOrigin = layout.cellOrigin({ column: player.c, row: player.r });

    // Mise à l'échelle proportionnelle à la taille de case (textures de référence en 16px)
    const width = (tex.width / 16) * size;
    const height = (tex.height / 16) * size;
    sprite.width = width;
    sprite.height = height;

    // Centrage horizontal dans la case et calage au sol (pieds du personnage en bas de case)
    const targetPixelX = cellOrigin.x + (size - width) / 2;
    const targetPixelY = cellOrigin.y + size - height;

    sprite.x = targetPixelX;
    sprite.y = targetPixelY;
  }

  /**
   * Synchronise tous les sprites de joueurs avec le GridLayout courant.
   */
  private syncPlayerSprites(): void {
    if (!this.currentLayout) return;

    for (const player of this.players) {
      this.updatePlayerSpritePosition(player);
    }
  }

  private initPlayers(p1Name: string) {
    this.players = [
      { id: 'p1', name: p1Name, r: 1, c: 1, alive: true, score: 0, textureKey: 'player1' },
      {
        id: 'p2',
        name: 'BraqueurX',
        r: 1,
        c: this.grid.columns - 2,
        alive: true,
        score: 0,
        textureKey: 'player2',
      },
      {
        id: 'p3',
        name: 'Ennemi3',
        r: this.grid.rows - 2,
        c: 1,
        alive: true,
        score: 0,
        textureKey: 'player3',
      },
      {
        id: 'p4',
        name: 'Ennemi4',
        r: this.grid.rows - 2,
        c: this.grid.columns - 2,
        alive: true,
        score: 0,
        textureKey: 'player4',
      },
    ];
  }

  private generateMap() {
    for (let r = 0; r < this.grid.rows; r++) {
      this.map[r] = [];
      for (let c = 0; c < this.grid.columns; c++) {
        if (r === 0 || r === this.grid.rows - 1 || c === 0 || c === this.grid.columns - 1) {
          this.map[r][c] = 1; // Bordures incassables
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = 1; // Piliers incassables
        } else {
          // Spawns dégagés dans les coins
          const isP1Spawn = r < 3 && c < 3;
          const isP2Spawn = r < 3 && c >= this.grid.columns - 3;
          const isP3Spawn = r >= this.grid.rows - 3 && c < 3;
          const isP4Spawn = r >= this.grid.rows - 3 && c >= this.grid.columns - 3;

          if (!isP1Spawn && !isP2Spawn && !isP3Spawn && !isP4Spawn && Math.random() < 0.35) {
            this.map[r][c] = 2; // Bloc destructible
          } else {
            this.map[r][c] = 0; // Sol vide
          }
        }
      }
    }
  }

  /**
   * Traitement des entrées joueur.
   * Architecture autoritaire : la scène N'APPLIQUE AUCUN déplacement localement.
   * Elle transmet l'intention du joueur sur le bus (`input:move`, `input:bomb`)
   * pour expédition vers le serveur.
   */
  public handleInput(key: string): void {
    if (this.isGameOver) return;

    if (key === ' ') {
      if (this.bus) {
        this.bus.emit('input:bomb');
      } else {
        // Fallback local uniquement si la scène est testée de manière isolée sans bus
        const p1 = this.players[0];
        if (p1 && p1.alive) this.placeBomb(p1);
      }
      return;
    }

    const keyToDirection: Record<string, Direction> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    const direction = keyToDirection[key];
    if (direction && this.bus) {
      this.bus.emit('input:move', { direction });
    }
  }

  /**
   * Dépose une bombe sur la case indiquée.
   */
  public placeBomb(player: PlayerState) {
    if (!player.alive || this.isGameOver) return;

    const exists = this.bombs.find((b) => b.r === player.r && b.c === player.c);
    if (exists) return;

    const r = player.r;
    const c = player.c;
    const bomb = { r, c, ownerId: player.id, ticking: false };
    this.bombs.push(bomb);
    this.redrawEntities();

    setTimeout(() => {
      bomb.ticking = true;
      this.redrawEntities();
    }, 1500);

    setTimeout(() => {
      this.bombs = this.bombs.filter((b) => b !== bomb);
      this.explode(r, c, player.id);
      this.redrawEntities();
    }, 2500);
  }

  private explode(r: number, c: number, ownerId: string) {
    if (this.isGameOver) return;

    const dirs = [
      [0, 0],
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    const newExplosions: { r: number; c: number }[] = [];
    const owner = this.players.find((p) => p.id === ownerId);

    for (const d of dirs) {
      const nr = r + d[0];
      const nc = c + d[1];
      if (nr >= 0 && nr < this.grid.rows && nc >= 0 && nc < this.grid.columns) {
        if (this.map[nr][nc] === 1) {
          continue;
        }
        if (this.map[nr][nc] === 2) {
          this.map[nr][nc] = 0;
          if (owner) {
            owner.score += 50;
          }
        }
        newExplosions.push({ r: nr, c: nc });

        for (const p of this.players) {
          if (p.alive && p.r === nr && p.c === nc) {
            p.alive = false;
            if (owner && owner.id !== p.id) {
              owner.score += 200;
            }
            this.callbacks?.onPlayerEliminated?.(p.id);
          }
        }
      }
    }

    this.callbacks?.onScoreUpdate?.(this.players.map((p) => ({ id: p.id, score: p.score })));
    this.explosions.push(...newExplosions);

    if (this.currentLayout) {
      this.drawWalls(this.currentLayout);
    }
    this.redrawEntities();

    setTimeout(() => {
      this.explosions = this.explosions.filter((exp) => !newExplosions.includes(exp));
      this.redrawEntities();
    }, 400);

    this.checkGameConditions();
  }

  private checkGameConditions() {
    if (this.isGameOver) return;

    const p1 = this.players[0];
    const rivalsAlive = this.players.slice(1).filter((p) => p.alive);

    if (p1 && !p1.alive) {
      this.endGame(null, false, "Vous avez succombé au souffle d'une bombe !");
      return;
    }

    if (rivalsAlive.length === 0 && p1) {
      this.endGame(p1, true, 'Braquage réussi ! Tous vos rivaux ont été éliminés !');
      return;
    }
  }

  public timeOut() {
    if (this.isGameOver) return;

    const alivePlayers = this.players.filter((p) => p.alive);
    if (alivePlayers.length === 0) {
      this.endGame(null, false, 'Temps écoulé ! Aucun survivant.');
      return;
    }

    alivePlayers.sort((a, b) => b.score - a.score);
    const winner = alivePlayers[0];
    const isP1Winner = winner.id === 'p1';

    this.endGame(
      winner,
      isP1Winner,
      isP1Winner
        ? `Temps écoulé ! Vous remportez le butin avec ${winner.score} points !`
        : `Temps écoulé ! ${winner.name} l'emporte avec ${winner.score} points.`,
    );
  }

  public endGame(winner: PlayerState | null, isVictory: boolean, reason: string) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.callbacks?.onGameOver?.({ winner, isVictory, reason });
  }

  public restartGame(p1Name?: string) {
    this.isGameOver = false;
    this.bombs = [];
    this.explosions = [];

    const name = p1Name || this.players[0]?.name || 'Vous';
    this.initPlayers(name);
    this.generateMap();

    if (this.currentLayout) {
      this.drawAll();
    }

    this.callbacks?.onScoreUpdate?.(this.players.map((p) => ({ id: p.id, score: 0 })));
  }

  get layout(): GridLayout | undefined {
    return this.currentLayout;
  }

  /** @throws RangeError si les dimensions de la grille sont invalides. */
  resize(viewport: Viewport): void {
    this.currentLayout = GridLayout.fit(this.grid, viewport, MARGIN);
    this.drawAll();
  }

  /** Libère la scène, les écouteurs de bus, les sprites et toute la hiérarchie PixiJS. */
  destroy(): void {
    this.unbindEventBus();

    for (const sprite of this.playerSprites.values()) {
      sprite.destroy();
    }
    this.playerSprites.clear();

    this.view.destroy({ children: true });
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
    this.floorLayer.removeChildren();

    for (let row = 0; row < layout.rows; row += 1) {
      for (let column = 0; column < layout.columns; column += 1) {
        const { x, y } = layout.cellOrigin({ column, row });
        const sprite = new Sprite(this.textures['floor']);
        sprite.x = x;
        sprite.y = y;
        sprite.width = layout.cellSize;
        sprite.height = layout.cellSize;
        this.floorLayer.addChild(sprite);
      }
    }
  }

  private drawWalls(layout: GridLayout): void {
    this.wallsLayer.removeChildren();

    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.columns; c++) {
        const { x, y } = layout.cellOrigin({ column: c, row: r });
        if (this.map[r][c] === 1 || this.map[r][c] === 2) {
          const type = this.map[r][c] === 1 ? 'wall' : 'brick';
          const sprite = new Sprite(this.textures[type]);
          sprite.x = x;
          sprite.y = y;
          sprite.width = layout.cellSize;
          sprite.height = layout.cellSize;
          this.wallsLayer.addChild(sprite);
        }
      }
    }
  }

  private redrawEntities() {
    if (this.currentLayout) {
      this.drawEntities(this.currentLayout);
    }
  }

  private drawEntities(layout: GridLayout): void {
    this.entitiesLayer.removeChildren();

    const size = layout.cellSize;

    // 1. Dessiner les explosions
    for (const exp of this.explosions) {
      const pos = layout.cellOrigin({ column: exp.c, row: exp.r });
      const expTex = this.textures['explosion'];
      if (expTex) {
        const expSprite = new Sprite(expTex);
        const eW = (expTex.width / 16) * size;
        const eH = (expTex.height / 16) * size;
        expSprite.width = eW;
        expSprite.height = eH;
        expSprite.x = pos.x + (size - eW) / 2;
        expSprite.y = pos.y + (size - eH) / 2;
        this.entitiesLayer.addChild(expSprite);
      }
    }

    // 2. Dessiner les bombes
    for (const b of this.bombs) {
      const pos = layout.cellOrigin({ column: b.c, row: b.r });
      const bombTex = b.ticking ? this.textures['bomb_ticking'] : this.textures['bomb'];
      if (bombTex) {
        const bombSprite = new Sprite(bombTex);
        const bW = (bombTex.width / 16) * size;
        const bH = (bombTex.height / 16) * size;
        bombSprite.width = bW;
        bombSprite.height = bH;
        bombSprite.x = pos.x + (size - bW) / 2;
        bombSprite.y = pos.y + (size - bH) / 2;
        this.entitiesLayer.addChild(bombSprite);
      }
    }

    // 3. Ré-attacher et repositionner les sprites de joueurs persistants
    for (const player of this.players) {
      if (!player.alive) continue;

      let sprite = this.playerSprites.get(player.id);
      if (!sprite) {
        const tex = this.textures[player.textureKey];
        if (tex) {
          sprite = new Sprite(tex);
          this.playerSprites.set(player.id, sprite);
        }
      }

      if (sprite) {
        this.entitiesLayer.addChild(sprite);
        this.applySpriteLayout(sprite, player, layout);
      }
    }
  }
}
