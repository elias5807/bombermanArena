import { Assets, Texture, TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { loadSprites } from '../../src/render/sprites/loadSprites';

/** Les images réellement présentes dans `public/`, par l'adresse où Vite les sert. */
const servedImages = Object.keys(import.meta.glob('../../public/assets/sprites/*.png')).map(
  (path) => path.replace('../../public', ''),
);

/**
 * Le vrai chargement demande un navigateur : `Assets.load` est remplacé par un chargeur
 * qui rend une texture vide par image. Rend l'adresse d'où vient chaque texture.
 */
function fakeAssetsLoad(): Map<Texture, string> {
  const origin = new Map<Texture, string>();
  // `Assets.load` a plusieurs signatures : seule celle qui charge une image sert ici.
  const load = vi.spyOn(Assets, 'load') as unknown as Mock<(url: string) => Promise<Texture>>;
  load.mockImplementation(async (url) => {
    const texture = new Texture({ source: new TextureSource({ width: 16, height: 16 }) });
    origin.set(texture, url);
    return texture;
  });
  return origin;
}

describe('loadSprites', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rend sous chaque nom la texture de son image', async () => {
    const origin = fakeAssetsLoad();

    const sprites = await loadSprites();

    const imageOf = Object.fromEntries(
      Object.entries(sprites).map(([name, texture]) => [name, origin.get(texture)]),
    );
    expect(imageOf).toEqual({
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
    });
  });

  it('ne demande que des images présentes dans public/', async () => {
    const origin = fakeAssetsLoad();

    await loadSprites();

    expect(origin.size).toBeGreaterThan(0);
    expect(servedImages).toEqual(expect.arrayContaining([...origin.values()]));
  });

  it("n'adoucit pas les sprites quand ils sont agrandis", async () => {
    fakeAssetsLoad();

    const sprites = await loadSprites();

    for (const texture of Object.values(sprites)) {
      expect(texture.source.scaleMode).toBe('nearest');
    }
  });

  it('échoue si une image ne se charge pas', async () => {
    const failure = new Error('image introuvable');
    fakeAssetsLoad();
    vi.mocked(Assets.load).mockRejectedValueOnce(failure);

    await expect(loadSprites()).rejects.toBe(failure);
  });
});
