import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  return import('../../src/config');
}

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
