import { Assets, type Texture } from 'pixi.js';

/** Image de chaque sprite, servie par Vite depuis `public/assets/sprites/`. */
const SPRITE_URLS = {
  floor: '/assets/sprites/sol.png',
  wall: '/assets/sprites/mur_incassable.png',
  brick: '/assets/sprites/mur_cassable.png',
  bomb: '/assets/sprites/bombe_poser.png',
  bomb_ticking: '/assets/sprites/bombe_qui_va_esploser.png',
  explosion: '/assets/sprites/explosion.png',
  player1: '/assets/sprites/joueur_1.png',
  player2: '/assets/sprites/joueur_2.png',
  player3: '/assets/sprites/joueur_3.png',
  player4: '/assets/sprites/joueur_4.png',
} as const;

/** Nom d'un sprite du jeu. */
export type SpriteKey = keyof typeof SPRITE_URLS;

/** Les textures du jeu, une par sprite. */
export type SpriteTextures = Record<SpriteKey, Texture>;

/**
 * Charge les images des sprites et rend leurs textures, prêtes à être dessinées.
 *
 * Le chargement a besoin d'un navigateur (PixiJS situe les images par rapport à l'adresse
 * de la page) : c'est pour cela qu'il est fait ici, une fois, et non par les scènes, qui
 * reçoivent les textures et se testent ainsi sans navigateur.
 *
 * @throws si une image est introuvable ou illisible : aucune texture n'est alors rendue.
 *
 * @example
 * const scene = new GameScene({ columns: 15, rows: 13 }, await loadSprites());
 */
export async function loadSprites(): Promise<SpriteTextures> {
  const entries = await Promise.all(
    Object.entries(SPRITE_URLS).map(async ([key, url]) => {
      const texture = await Assets.load<Texture>(url);
      // Pixel art : pas de lissage quand l'image est agrandie à la taille d'une case.
      texture.source.scaleMode = 'nearest';
      return [key, texture] as const;
    }),
  );

  return Object.fromEntries(entries) as SpriteTextures;
}
