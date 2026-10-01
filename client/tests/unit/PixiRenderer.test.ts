import type { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PixiRenderer } from '../../src/render/PixiRenderer';
import type { Scene } from '../../src/render/scenes/Scene';

/**
 * Fausse application PixiJS : le vrai rendu demande WebGL, absent des tests et de la CI.
 * On vérifie ici le fonctionnement du moteur (ordre des opérations, cycle de vie), pas
 * le dessin : celui-ci se contrôle à l'écran, avec `npm run dev`.
 */
const pixi = vi.hoisted(() => {
  class FakeApplication {
    static created: FakeApplication[] = [];
    /** Ce que fait `init` pour les prochaines applications : chaque test peut le remplacer. */
    static initBehavior: () => Promise<void> = () => Promise.resolve();

    readonly canvas = { name: 'canvas' };
    readonly screen = { width: 800, height: 600 };
    readonly stage = { addChild: vi.fn() };
    readonly renderer = { on: vi.fn(), off: vi.fn() };
    readonly init = vi.fn<(options: unknown) => Promise<void>>(() =>
      FakeApplication.initBehavior(),
    );
    readonly destroy = vi.fn();

    constructor() {
      FakeApplication.created.push(this);
    }
  }

  return { FakeApplication };
});

vi.mock('pixi.js', () => ({ Application: pixi.FakeApplication }));

type FakeScene = Scene & { resize: Mock; destroy: Mock };

function createHost(): HTMLElement & { appendChild: Mock } {
  return { appendChild: vi.fn() } as unknown as HTMLElement & { appendChild: Mock };
}

function createScene(): FakeScene {
  return { view: { name: 'view' } as unknown as Container, resize: vi.fn(), destroy: vi.fn() };
}

/** L'application PixiJS que `PixiRenderer.create` vient de construire. */
function lastApp(): InstanceType<typeof pixi.FakeApplication> {
  const app = pixi.FakeApplication.created.at(-1);
  if (!app) {
    throw new Error("aucune application n'a été créée");
  }
  return app;
}

/** La fonction que le moteur a donnée à PixiJS pour être prévenu des changements de taille. */
function resizeHandler(): (width: number, height: number, resolution: number) => void {
  const call = lastApp().renderer.on.mock.calls.find(([event]) => event === 'resize');
  if (!call) {
    throw new Error("le moteur ne s'est pas abonné au redimensionnement");
  }
  return call[1] as (width: number, height: number, resolution: number) => void;
}

describe('PixiRenderer', () => {
  beforeEach(() => {
    pixi.FakeApplication.created.length = 0;
    pixi.FakeApplication.initBehavior = () => Promise.resolve();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('create', () => {
    it("n'ajoute le canvas à la page qu'une fois PixiJS démarré", async () => {
      let finishInit = () => {};
      pixi.FakeApplication.initBehavior = () =>
        new Promise<void>((resolve) => {
          finishInit = resolve;
        });
      const host = createHost();

      const creation = PixiRenderer.create(host);
      await Promise.resolve();
      expect(host.appendChild).not.toHaveBeenCalled();

      finishInit();
      await creation;
      expect(host.appendChild).toHaveBeenCalledWith(lastApp().canvas);
    });

    it("demande à PixiJS de suivre la taille de l'élément qui l'accueille", async () => {
      const host = createHost();

      await PixiRenderer.create(host);

      expect(lastApp().init).toHaveBeenCalledWith(
        expect.objectContaining({ resizeTo: host, antialias: true, autoDensity: true }),
      );
    });

    it("utilise la densité de pixels de l'écran, ou 1 à défaut", async () => {
      vi.stubGlobal('devicePixelRatio', 1.5);
      await PixiRenderer.create(createHost());
      expect(lastApp().init).toHaveBeenCalledWith(expect.objectContaining({ resolution: 1.5 }));

      vi.stubGlobal('devicePixelRatio', undefined);
      await PixiRenderer.create(createHost());
      expect(lastApp().init).toHaveBeenCalledWith(expect.objectContaining({ resolution: 1 }));
    });

    it('échoue sans toucher à la page quand PixiJS ne peut pas démarrer', async () => {
      pixi.FakeApplication.initBehavior = () => Promise.reject(new Error('WebGL indisponible'));
      const host = createHost();

      await expect(PixiRenderer.create(host)).rejects.toThrow('WebGL indisponible');

      expect(host.appendChild).not.toHaveBeenCalled();
    });
  });

  describe('setScene', () => {
    it("ajoute la vue de la scène et lui donne la taille de la zone d'affichage", async () => {
      const renderer = await PixiRenderer.create(createHost());
      const scene = createScene();

      renderer.setScene(scene);

      expect(lastApp().stage.addChild).toHaveBeenCalledWith(scene.view);
      expect(scene.resize).toHaveBeenCalledOnce();
      expect(scene.resize).toHaveBeenCalledWith(
        expect.objectContaining({ width: 800, height: 600 }),
      );
    });

    it("détruit la scène précédente avant d'afficher la nouvelle", async () => {
      const renderer = await PixiRenderer.create(createHost());
      const first = createScene();
      const second = createScene();
      renderer.setScene(first);

      renderer.setScene(second);

      const { addChild } = lastApp().stage;
      expect(first.destroy).toHaveBeenCalledOnce();
      expect(second.destroy).not.toHaveBeenCalled();
      expect(addChild).toHaveBeenLastCalledWith(second.view);
      expect(first.destroy.mock.invocationCallOrder[0]).toBeLessThan(
        addChild.mock.invocationCallOrder[1],
      );
    });

    it('ne fait rien quand on redonne la scène déjà affichée', async () => {
      const renderer = await PixiRenderer.create(createHost());
      const scene = createScene();
      renderer.setScene(scene);

      renderer.setScene(scene);

      expect(scene.destroy).not.toHaveBeenCalled();
      expect(scene.resize).toHaveBeenCalledOnce();
      expect(lastApp().stage.addChild).toHaveBeenCalledOnce();
    });

    it('refuse une scène quand le moteur est détruit', async () => {
      const renderer = await PixiRenderer.create(createHost());
      renderer.destroy();

      expect(() => renderer.setScene(createScene())).toThrow(/détruit/);
    });
  });

  describe('redimensionnement', () => {
    it('prévient la scène affichée de la nouvelle taille', async () => {
      const renderer = await PixiRenderer.create(createHost());
      const scene = createScene();
      renderer.setScene(scene);

      resizeHandler()(1024, 768, 1);

      expect(scene.resize).toHaveBeenLastCalledWith({ width: 1024, height: 768 });
    });

    it('ne prévient que la scène courante, pas les précédentes', async () => {
      const renderer = await PixiRenderer.create(createHost());
      const first = createScene();
      const second = createScene();
      renderer.setScene(first);
      renderer.setScene(second);

      resizeHandler()(1024, 768, 1);

      expect(first.resize).toHaveBeenCalledOnce();
      expect(second.resize).toHaveBeenLastCalledWith({ width: 1024, height: 768 });
    });

    it("ne fait rien quand aucune scène n'est affichée", async () => {
      await PixiRenderer.create(createHost());

      expect(() => resizeHandler()(1024, 768, 1)).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('détruit la scène, se désabonne, puis détruit PixiJS en retirant le canvas', async () => {
      const renderer = await PixiRenderer.create(createHost());
      const scene = createScene();
      renderer.setScene(scene);
      const handler = resizeHandler();

      renderer.destroy();

      const app = lastApp();
      expect(scene.destroy).toHaveBeenCalledOnce();
      expect(app.renderer.off).toHaveBeenCalledWith('resize', handler);
      expect(app.destroy).toHaveBeenCalledWith(true, { children: true });
      // L'ordre compte : une fois détruit, PixiJS ne doit plus être utilisé.
      const destroyOrder = app.destroy.mock.invocationCallOrder[0];
      expect(scene.destroy.mock.invocationCallOrder[0]).toBeLessThan(destroyOrder);
      expect(app.renderer.off.mock.invocationCallOrder[0]).toBeLessThan(destroyOrder);
    });

    it('fonctionne sans scène affichée', async () => {
      const renderer = await PixiRenderer.create(createHost());

      expect(() => renderer.destroy()).not.toThrow();
      expect(lastApp().destroy).toHaveBeenCalledOnce();
    });

    it('est sans effet la deuxième fois', async () => {
      const renderer = await PixiRenderer.create(createHost());
      const scene = createScene();
      renderer.setScene(scene);

      renderer.destroy();
      renderer.destroy();

      expect(lastApp().destroy).toHaveBeenCalledOnce();
      expect(scene.destroy).toHaveBeenCalledOnce();
    });

    it("n'avertit plus la scène détruite d'un redimensionnement tardif", async () => {
      const renderer = await PixiRenderer.create(createHost());
      const scene = createScene();
      renderer.setScene(scene);
      const handler = resizeHandler();
      renderer.destroy();

      handler(1024, 768, 1);

      expect(scene.resize).toHaveBeenCalledOnce();
    });
  });
});
