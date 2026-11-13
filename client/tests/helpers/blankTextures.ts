import { Texture, TextureSource } from 'pixi.js';
import type { SpriteTextures } from '../../src/render/sprites/loadSprites';

/**
 * Textures vides, aux dimensions des images de `public/assets/sprites/` : les images ne se
 * chargent que dans un navigateur, mais les sprites PixiJS fonctionnent sans.
 */
export function blankTextures(): SpriteTextures {
  const blank = (width: number, height: number) =>
    new Texture({ source: new TextureSource({ width, height }) });

  return {
    floor: blank(16, 16),
    wall: blank(16, 16),
    brick: blank(16, 16),
    bomb: blank(15, 15),
    bomb_ticking: blank(14, 15),
    explosion: blank(14, 13),
    player1: blank(15, 23),
    player2: blank(15, 23),
    player3: blank(15, 23),
    player4: blank(15, 23),
  };
}
