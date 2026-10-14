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

  it("utilise le serveur simulé, sans avertissement, quand VITE_CONNECTION_MODE n'est pas définie", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_CONNECTION_MODE', '');
    const { CONNECTION_MODE, DEFAULT_CONNECTION_MODE } = await loadConfig();

    expect(DEFAULT_CONNECTION_MODE).toBe('mock');
    expect(CONNECTION_MODE).toBe('mock');
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

  it('revient au serveur simulé, avec un avertissement, pour une valeur inconnue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_CONNECTION_MODE', 'serveur');
    const { CONNECTION_MODE } = await loadConfig();

    expect(CONNECTION_MODE).toBe('mock');
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"serveur"'));
  });
});
