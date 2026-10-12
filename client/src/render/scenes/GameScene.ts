import { Container, Graphics, Sprite } from 'pixi.js';
import { GridLayout, type GridSize, type Viewport } from '../GridLayout';
import type { SpriteKey, SpriteTextures } from '../sprites/loadSprites';
import type { Scene } from './Scene';

const MARGIN = 16;
const BORDER_COLOR = 0x111315;
const BORDER_WIDTH = 4;

export interface PlayerState {
  id: string;
  name: string;
  r: number;
  c: number;
  alive: boolean;
  score: number;
  textureKey: SpriteKey;
}

export interface GameCallbacks {
  onScoreUpdate?: (scores: { id: string; score: number }[]) => void;
  onPlayerEliminated?: (playerId: string) => void;
  onGameOver?: (result: { winner: PlayerState | null; isVictory: boolean; reason: string }) => void;
}

export class GameScene implements Scene {
  readonly view = new Container();

  private readonly grid: GridSize;
  private readonly border = new Graphics();

  // Ordre d'affichage (z-index)
  private readonly floorLayer = new Container();
  private readonly wallsLayer = new Container();
  private readonly entitiesLayer = new Container();

  private currentLayout: GridLayout | undefined;

  // 0 = vide, 1 = incassable, 2 = cassable
  private map: number[][] = [];

  // Liste des 4 joueurs
  public players: PlayerState[] = [];

  private bombs: { r: number; c: number; ownerId: string; ticking: boolean }[] = [];
  private explosions: { r: number; c: number }[] = [];

  private readonly textures: SpriteTextures;

  private callbacks: GameCallbacks | undefined;
  private isGameOver = false;
  private botInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    grid: GridSize,
    textures: SpriteTextures,
    callbacks?: GameCallbacks,
    initialPlayerName: string = 'Vous',
  ) {
    this.grid = grid;
    this.textures = textures;
    this.callbacks = callbacks;

    this.view.addChild(this.floorLayer);
    this.view.addChild(this.wallsLayer);
    this.view.addChild(this.entitiesLayer);
    this.view.addChild(this.border);

    this.initPlayers(initialPlayerName);
    this.generateMap();
    this.startBotAI();
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
          this.map[r][c] = 1; // Bordures
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = 1; // Piliers
        } else {
          // Zones de spawn dégagées dans les 4 coins
          const isP1Spawn = r < 3 && c < 3;
          const isP2Spawn = r < 3 && c >= this.grid.columns - 3;
          const isP3Spawn = r >= this.grid.rows - 3 && c < 3;
          const isP4Spawn = r >= this.grid.rows - 3 && c >= this.grid.columns - 3;

          if (!isP1Spawn && !isP2Spawn && !isP3Spawn && !isP4Spawn && Math.random() < 0.35) {
            this.map[r][c] = 2; // Bloc cassable
          } else {
            this.map[r][c] = 0; // Sol vide
          }
        }
      }
    }
  }

  /**
   * Intelligence Artificielle simple pour animer les rivaux P2, P3, P4
   */
  private startBotAI() {
    if (this.botInterval) clearInterval(this.botInterval);
    this.botInterval = setInterval(() => {
      if (this.isGameOver) return;
      this.updateBots();
    }, 750);
  }

  private updateBots() {
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (let i = 1; i < this.players.length; i++) {
      const bot = this.players[i];
      if (!bot.alive) continue;

      // Déplacements possibles
      const valid = dirs.filter((d) => {
        const nr = bot.r + d.dr;
        const nc = bot.c + d.dc;
        if (nr < 0 || nr >= this.grid.rows || nc < 0 || nc >= this.grid.columns) return false;
        if (this.map[nr][nc] !== 0) return false;
        if (this.bombs.some((b) => b.r === nr && b.c === nc)) return false;
        return true;
      });

      if (valid.length > 0) {
        const choice = valid[Math.floor(Math.random() * valid.length)];
        bot.r += choice.dr;
        bot.c += choice.dc;
      }

      // Possibilité de poser une bombe si adjacent à une brique cassable
      const nearBrick = dirs.some((d) => {
        const nr = bot.r + d.dr;
        const nc = bot.c + d.dc;
        return (
          nr >= 0 &&
          nr < this.grid.rows &&
          nc >= 0 &&
          nc < this.grid.columns &&
          this.map[nr][nc] === 2
        );
      });

      if (nearBrick && Math.random() < 0.2) {
        this.placeBomb(bot);
      }
    }

    this.redrawEntities();
  }

  public handleInput(key: string) {
    if (this.isGameOver) return;

    const p1 = this.players[0];
    if (!p1 || !p1.alive) return;

    let dc = 0;
    let dr = 0;

    if (key === 'ArrowUp') dr = -1;
    else if (key === 'ArrowDown') dr = 1;
    else if (key === 'ArrowLeft') dc = -1;
    else if (key === 'ArrowRight') dc = 1;
    else if (key === ' ') {
      this.placeBomb(p1);
      return;
    }

    if (dr !== 0 || dc !== 0) {
      const nr = p1.r + dr;
      const nc = p1.c + dc;

      if (nr >= 0 && nr < this.grid.rows && nc >= 0 && nc < this.grid.columns) {
        const isBomb = this.bombs.some((b) => b.r === nr && b.c === nc);
        if (this.map[nr][nc] === 0 && !isBomb) {
          p1.r = nr;
          p1.c = nc;
          this.redrawEntities();
        }
      }
    }
  }

  public placeBomb(player: PlayerState) {
    if (!player.alive || this.isGameOver) return;

    const exists = this.bombs.find((b) => b.r === player.r && b.c === player.c);
    if (exists) return;

    const r = player.r;
    const c = player.c;
    const bomb = { r, c, ownerId: player.id, ticking: false };
    this.bombs.push(bomb);
    this.redrawEntities();

    // Mèche qui clignote après 1.5s
    setTimeout(() => {
      bomb.ticking = true;
      this.redrawEntities();
    }, 1500);

    // Détonation après 2.5s
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
          // Bloqué par mur incassable
          continue;
        }
        if (this.map[nr][nc] === 2) {
          this.map[nr][nc] = 0; // Détruit la brique
          if (owner) {
            owner.score += 50; // +50 pts par bloc détruit
          }
        }
        newExplosions.push({ r: nr, c: nc });

        // Vérifier les joueurs touchés par le souffle
        for (const p of this.players) {
          if (p.alive && p.r === nr && p.c === nc) {
            p.alive = false;
            if (owner && owner.id !== p.id) {
              owner.score += 200; // +200 pts bonus d'élimination
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

    // Disparition du souffle après 400ms
    setTimeout(() => {
      this.explosions = this.explosions.filter((exp) => !newExplosions.includes(exp));
      this.redrawEntities();
    }, 400);

    this.checkGameConditions();
  }

  /**
   * Vérifie les conditions de victoire ou d'élimination
   */
  private checkGameConditions() {
    if (this.isGameOver) return;

    const p1 = this.players[0];
    const rivalsAlive = this.players.slice(1).filter((p) => p.alive);

    // Défaite si P1 est mort
    if (!p1.alive) {
      this.endGame(null, false, "Vous avez succombé au souffle d'une bombe !");
      return;
    }

    // Victoire si tous les autres rivaux sont morts
    if (rivalsAlive.length === 0) {
      this.endGame(p1, true, 'Braquage réussi ! Tous vos rivaux ont été éliminés !');
      return;
    }
  }

  public timeOut() {
    if (this.isGameOver) return;

    // Fin du chrono : le joueur en vie avec le plus de score gagne
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
    if (this.botInterval) clearInterval(this.botInterval);

    this.callbacks?.onGameOver?.({ winner, isVictory, reason });
  }

  public restartGame(p1Name?: string) {
    this.isGameOver = false;
    this.bombs = [];
    this.explosions = [];

    const name = p1Name || this.players[0].name;
    this.initPlayers(name);
    this.generateMap();

    if (this.currentLayout) {
      this.drawAll();
    }

    this.startBotAI();
    this.callbacks?.onScoreUpdate?.(this.players.map((p) => ({ id: p.id, score: 0 })));
  }

  get layout(): GridLayout | undefined {
    return this.currentLayout;
  }

  resize(viewport: Viewport): void {
    this.currentLayout = GridLayout.fit(this.grid, viewport, MARGIN);
    this.drawAll();
  }

  destroy(): void {
    if (this.botInterval) clearInterval(this.botInterval);
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

    // 3. Dessiner les joueurs vivants
    for (const p of this.players) {
      if (!p.alive) continue; // Les joueurs éliminés ne sont plus affichés

      const tex = this.textures[p.textureKey];
      if (!tex) continue;

      const pos = layout.cellOrigin({ column: p.c, row: p.r });
      const pSprite = new Sprite(tex);

      pSprite.width = (tex.width / 16) * size;
      pSprite.height = (tex.height / 16) * size;
      pSprite.x = pos.x + (size - pSprite.width) / 2;
      pSprite.y = pos.y + size - pSprite.height;

      this.entitiesLayer.addChild(pSprite);
    }
  }
}
