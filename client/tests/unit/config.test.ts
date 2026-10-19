import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  return import('../../src/config');
}

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("utilise l'URL locale quand VITE_SERVER_URL n'est pas définie", async () => {
    vi.stubEnv('VITE_SERVER_URL', '');
    const { SERVER_URL, DEFAULT_SERVER_URL } = await loadConfig();

    expect(SERVER_URL).toBe(DEFAULT_SERVER_URL);
  });

  it('utilise VITE_SERVER_URL quand elle est définie', async () => {
    vi.stubEnv('VITE_SERVER_URL', 'ws://serveur:3000');
    const { SERVER_URL } = await loadConfig();

    expect(SERVER_URL).toBe('ws://serveur:3000');
  });

  it("utilise le serveur réel, sans avertissement, quand VITE_CONNECTION_MODE n'est pas définie", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_CONNECTION_MODE', '');
    const { CONNECTION_MODE, DEFAULT_CONNECTION_MODE } = await loadConfig();

    expect(DEFAULT_CONNECTION_MODE).toBe('server');
    expect(CONNECTION_MODE).toBe('server');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['mock', 'server'])(
    'utilise VITE_CONNECTION_MODE quand elle vaut « %s »',
    async (mode) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubEnv('VITE_CONNECTION_MODE', mode);
      const { CONNECTION_MODE } = await loadConfig();

      expect(CONNECTION_MODE).toBe(mode);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('revient au serveur réel, avec un avertissement, pour une valeur inconnue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_CONNECTION_MODE', 'moc');
    const { CONNECTION_MODE } = await loadConfig();

    expect(CONNECTION_MODE).toBe('server');
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"moc"'));
  });
});

/** Le dossier `client/`, où Vite cherche les fichiers `.env`. */
const CLIENT_DIR = fileURLToPath(new URL('../..', import.meta.url));

describe('fichiers .env du client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('npm run dev:mock (vite --mode mock) choisit le serveur simulé', () => {
    // Une variable du shell passe avant les fichiers : on l'écarte pour ne lire qu'eux.
    vi.stubEnv('VITE_CONNECTION_MODE', undefined);

    expect(loadEnv('mock', CLIENT_DIR, 'VITE_').VITE_CONNECTION_MODE).toBe('mock');
  });

  // Les fichiers partagés par tous ; `.env.local` reste le choix de chacun.
  it.each(['.env', '.env.development', '.env.production'])(
    '%s ne remplace pas la connexion par défaut',
    (file) => {
      const path = join(CLIENT_DIR, file);
      const content = existsSync(path) ? readFileSync(path, 'utf8') : '';

      expect(content).not.toMatch(/^\s*VITE_CONNECTION_MODE\s*=/m);
    },
  );
});
