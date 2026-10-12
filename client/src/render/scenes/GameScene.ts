import { Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';
import { GridLayout, type GridSize, type Viewport } from '../GridLayout';
import type { Scene } from './Scene';

const MARGIN = 16;
const BORDER_COLOR = 0x111315;
const BORDER_WIDTH = 4;

export class GameScene implements Scene {
  readonly view = new Container();

  private readonly grid: GridSize;
  private readonly border = new Graphics();
  
  // Containers pour organiser l'ordre d'affichage (z-index)
  private readonly floorLayer = new Container();
  private readonly wallsLayer = new Container();
  private readonly entitiesLayer = new Container();
  
  private currentLayout: GridLayout | undefined;

  // 0 = vide, 1 = incassable, 2 = cassable
  private map: number[][] = [];
  
  // Positions des 4 joueurs (1 dans chaque coin)
  private player = { r: 1, c: 1 };
  private player2 = { r: 1, c: 13 };
  private player3 = { r: 11, c: 1 };
  private player4 = { r: 11, c: 13 };

  private bombs: { r: number; c: number; ticking: boolean }[] = [];
  private explosions: { r: number; c: number }[] = [];

  // Textures des sprites individuels chargés
  private texturesReady = false;
  private textures: Record<string, Texture> = {};

  constructor(grid: GridSize) {
    this.grid = grid;
    
    // Ordre d'affichage : Sol < Murs < Entités < Bordure
    this.view.addChild(this.floorLayer);
    this.view.addChild(this.wallsLayer);
    this.view.addChild(this.entitiesLayer);
    this.view.addChild(this.border);

    this.generateMap();
    this.loadSprites();
  }

  /**
   * Charge tous les sprites séparés depuis /assets/sprites/
   * Plus aucun découpage manuel de spritesheet n'est nécessaire.
   */
  private async loadSprites() {
    const [
      floor,
      wall,
      brick,
      bomb,
      bombTicking,
      explosion,
      player1,
      player2,
      player3,
      player4,
    ] = await Promise.all([
      Assets.load<Texture>('/assets/sprites/sol.png'),
      Assets.load<Texture>('/assets/sprites/mur_incassable.png'),
      Assets.load<Texture>('/assets/sprites/mur_cassable.png'),
      Assets.load<Texture>('/assets/sprites/bombe_poser.png'),
      Assets.load<Texture>('/assets/sprites/bombe_qui_va_esploser.png'),
      Assets.load<Texture>('/assets/sprites/explosion.png'),
      Assets.load<Texture>('/assets/sprites/joueur_1.png'),
      Assets.load<Texture>('/assets/sprites/joueur_2.png'),
      Assets.load<Texture>('/assets/sprites/joueur_3.png'),
      Assets.load<Texture>('/assets/sprites/joueur_4.png'),
    ]);

    // Conserver le pixel art net sans flou de redimensionnement
    const all = [floor, wall, brick, bomb, bombTicking, explosion, player1, player2, player3, player4];
    for (const tex of all) {
      if (tex?.source) {
        tex.source.scaleMode = 'nearest';
      }
    }

    this.textures['floor'] = floor;
    this.textures['wall'] = wall;
    this.textures['brick'] = brick;
    this.textures['bomb'] = bomb;
    this.textures['bomb_ticking'] = bombTicking;
    this.textures['explosion'] = explosion;
    this.textures['player1'] = player1;
    this.textures['player2'] = player2;
    this.textures['player3'] = player3;
    this.textures['player4'] = player4;

    this.texturesReady = true;

    // Forcer le rendu si le layout est déjà initialisé
    if (this.currentLayout) {
      this.drawAll();
    }
  }

  private generateMap() {
    for (let r = 0; r < this.grid.rows; r++) {
      this.map[r] = [];
      for (let c = 0; c < this.grid.columns; c++) {
        if (r === 0 || r === this.grid.rows - 1 || c === 0 || c === this.grid.columns - 1) {
          this.map[r][c] = 1; // Bordures extérieures
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = 1; // Piliers fixes
        } else {
          // Zones de spawn dégagées pour les 4 joueurs dans les coins
          const isP1Spawn = r < 3 && c < 3;
          const isP2Spawn = r < 3 && c >= this.grid.columns - 3;
          const isP3Spawn = r >= this.grid.rows - 3 && c < 3;
          const isP4Spawn = r >= this.grid.rows - 3 && c >= this.grid.columns - 3;

          if (!isP1Spawn && !isP2Spawn && !isP3Spawn && !isP4Spawn && Math.random() < 0.35) {
            this.map[r][c] = 2; // Mur destructible
          } else {
            this.map[r][c] = 0; // Sol vide
          }
        }
      }
    }
  }

  public handleInput(key: string) {
    if (!this.texturesReady) return;

    let dc = 0;
    let dr = 0;
    
    if (key === 'ArrowUp') dr = -1;
    else if (key === 'ArrowDown') dr = 1;
    else if (key === 'ArrowLeft') dc = -1;
    else if (key === 'ArrowRight') dc = 1;
    else if (key === ' ') {
      this.placeBomb();
      return;
    }
    
    if (dr !== 0 || dc !== 0) {
      const nr = this.player.r + dr;
      const nc = this.player.c + dc;
      
      if (nr >= 0 && nr < this.grid.rows && nc >= 0 && nc < this.grid.columns) {
        const isBomb = this.bombs.some(b => b.r === nr && b.c === nc);
        if (this.map[nr][nc] === 0 && !isBomb) {
          this.player.r = nr;
          this.player.c = nc;
          this.redrawEntities();
        }
      }
    }
  }

  private placeBomb() {
    const exists = this.bombs.find(b => b.r === this.player.r && b.c === this.player.c);
    if (exists) return;
    
    const r = this.player.r;
    const c = this.player.c;
    const bomb = { r, c, ticking: false };
    this.bombs.push(bomb);
    this.redrawEntities();
    
    // Après 1.5s, la bombe s'anime (sprite bombe qui va exploser)
    setTimeout(() => {
      bomb.ticking = true;
      this.redrawEntities();
    }, 1500);

    // Détonation après 2.5s
    setTimeout(() => {
      this.bombs = this.bombs.filter(b => b !== bomb);
      this.explode(r, c);
      this.redrawEntities();
    }, 2500);
  }

  private explode(r: number, c: number) {
    const dirs = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]];
    const newExplosions: { r: number; c: number }[] = [];

    for (const d of dirs) {
      const nr = r + d[0];
      const nc = c + d[1];
      if (nr >= 0 && nr < this.grid.rows && nc >= 0 && nc < this.grid.columns) {
        if (this.map[nr][nc] === 1) {
          // Mur incassable bloque l'explosion
          continue;
        }
        if (this.map[nr][nc] === 2) {
          this.map[nr][nc] = 0; // Détruit la brique cassable
        }
        newExplosions.push({ r: nr, c: nc });
      }
    }

    this.explosions.push(...newExplosions);
    
    if (this.currentLayout) {
      this.drawWalls(this.currentLayout);
    }
    this.redrawEntities();

    // Disparition de l'explosion après 400ms
    setTimeout(() => {
      this.explosions = this.explosions.filter(exp => !newExplosions.includes(exp));
      this.redrawEntities();
    }, 400);
  }

  get layout(): GridLayout | undefined {
    return this.currentLayout;
  }

  resize(viewport: Viewport): void {
    this.currentLayout = GridLayout.fit(this.grid, viewport, MARGIN);
    this.drawAll();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private drawAll() {
    if (!this.currentLayout) return;
    this.drawFloor(this.currentLayout);
    this.drawWalls(this.currentLayout);
    this.drawEntities(this.currentLayout);
    
    // Dessin de la bordure extérieure
    this.border.clear();
    this.border
      .rect(this.currentLayout.originX, this.currentLayout.originY, this.currentLayout.width, this.currentLayout.height)
      .stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, alignment: 1 });
  }

  private drawFloor(layout: GridLayout): void {
    this.floorLayer.removeChildren();
    if (!this.texturesReady) return;

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
    if (!this.texturesReady) return;

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
    if (!this.texturesReady) return;

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
    
    // 3. Fonction d'affichage et de centrage d'un joueur
    const drawPlayer = (pCoords: { r: number; c: number }, textureName: string) => {
      const tex = this.textures[textureName];
      if (!tex) return;

      const pos = layout.cellOrigin({ column: pCoords.c, row: pCoords.r });
      const pSprite = new Sprite(tex);
      
      // Mise à l'échelle proportionnelle selon les dimensions exactes du sprite
      pSprite.width = (tex.width / 16) * size;
      pSprite.height = (tex.height / 16) * size;
      
      // Centrage horizontal parfait sur la case
      pSprite.x = pos.x + (size - pSprite.width) / 2;
      
      // Alignement sur le bas de la case (les pieds au sol)
      pSprite.y = pos.y + size - pSprite.height;
      
      this.entitiesLayer.addChild(pSprite);
    };

    // Dessin des 4 joueurs (P1 Jaune, P2 Bleu, P3 Rouge, P4 Vert)
    drawPlayer(this.player, 'player1');
    drawPlayer(this.player2, 'player2');
    drawPlayer(this.player3, 'player3');
    drawPlayer(this.player4, 'player4');
  }
}
