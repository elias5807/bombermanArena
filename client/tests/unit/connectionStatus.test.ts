// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvents } from '../../src/core/AppEvents';
import { EventBus } from '../../src/core/EventBus';
import {
  CONNECTION_LOST_MESSAGE,
  ConnectionStatus,
  unreachableMessage,
} from '../../src/ui/connectionStatus';

const SERVER_URL = 'ws://serveur.test:3000';

/** L'encart de `index.html`, le bouton « Rejoindre » et un statut branché sur un bus neuf. */
function setup(serverUrl = SERVER_URL) {
  const bus = new EventBus<AppEvents>((error) => {
    throw error;
  });
  const panel = document.createElement('div');
  const message = panel.appendChild(document.createElement('p'));
  const retryButton = panel.appendChild(document.createElement('button'));
  const joinButton = document.createElement('button');
  document.body.append(panel, joinButton);
  const retry = vi.fn();
  const status = new ConnectionStatus({ panel, message, retryButton, joinButton }, bus, {
    serverUrl,
    retry,
  });

  return { bus, panel, message, retryButton, joinButton, retry, status };
}

describe('ConnectionStatus', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('pendant la connexion : encart masqué, « Rejoindre » désactivé', () => {
    const { panel, joinButton } = setup();

    expect(panel.hidden).toBe(true);
    expect(joinButton.disabled).toBe(true);
  });

  it('connexion ouverte : « Rejoindre » devient actif', () => {
    const { bus, panel, joinButton } = setup();

    bus.emit('connection:opened');

    expect(panel.hidden).toBe(true);
    expect(joinButton.disabled).toBe(false);
  });

  describe('serveur injoignable', () => {
    it("affiche l'adresse du serveur et « Réessayer » ; « Rejoindre » reste désactivé", () => {
      const { bus, panel, message, retryButton, joinButton } = setup();

      bus.emit('connection:error', { error: new Error('injoignable') });

      expect(panel.hidden).toBe(false);
      expect(message.textContent).toBe(unreachableMessage(SERVER_URL));
      expect(message.textContent).toContain(SERVER_URL);
      expect(retryButton.disabled).toBe(false);
      expect(joinButton.disabled).toBe(true);
    });

    it('« Réessayer » relance la connexion et attend son issue', () => {
      const { bus, message, retryButton, retry } = setup();
      bus.emit('connection:error', { error: new Error('injoignable') });

      retryButton.click();

      expect(retry).toHaveBeenCalledTimes(1);
      expect(message.textContent).toBe(`Connexion à ${SERVER_URL}...`);
      expect(retryButton.disabled).toBe(true);
    });

    it('après « Réessayer », un nouvel échec réaffiche le message et le bouton', () => {
      const { bus, message, retryButton } = setup();
      bus.emit('connection:error', { error: new Error('injoignable') });
      retryButton.click();

      bus.emit('connection:error', { error: new Error('toujours injoignable') });

      expect(message.textContent).toBe(unreachableMessage(SERVER_URL));
      expect(retryButton.disabled).toBe(false);
    });

    it('après « Réessayer », la connexion ouverte masque l’encart et active « Rejoindre »', () => {
      const { bus, panel, retryButton, joinButton } = setup();
      bus.emit('connection:error', { error: new Error('injoignable') });
      retryButton.click();

      bus.emit('connection:opened');

      expect(panel.hidden).toBe(true);
      expect(joinButton.disabled).toBe(false);
    });

    it('affiche une adresse contenant du HTML comme du texte', () => {
      const address = `ws://<img src=x onerror="document.title='XSS'">`;
      const { bus, message } = setup(address);

      bus.emit('connection:error', { error: new Error('injoignable') });

      expect(message.textContent).toContain(address);
      expect(message.children).toHaveLength(0);
    });
  });

  it('ignore une erreur connexion ouverte (un envoi qui échoue)', () => {
    const { bus, panel, joinButton } = setup();
    bus.emit('connection:opened');

    bus.emit('connection:error', { error: new Error('envoi impossible') });

    expect(panel.hidden).toBe(true);
    expect(joinButton.disabled).toBe(false);
  });

  it('connexion perdue : message, « Réessayer », et « Rejoindre » désactivé', () => {
    const { bus, panel, message, retryButton, joinButton } = setup();
    bus.emit('connection:opened');

    bus.emit('connection:lost');

    expect(panel.hidden).toBe(false);
    expect(message.textContent).toBe(CONNECTION_LOST_MESSAGE);
    expect(retryButton.disabled).toBe(false);
    expect(joinButton.disabled).toBe(true);
  });

  it('après une coupure, une erreur de reconnexion indique que le serveur est injoignable', () => {
    const { bus, message } = setup();
    bus.emit('connection:opened');
    bus.emit('connection:lost');

    bus.emit('connection:error', { error: new Error('injoignable') });

    expect(message.textContent).toBe(unreachableMessage(SERVER_URL));
  });

  it('connexion fermée par le client : « Rejoindre » désactivé, sans message', () => {
    const { bus, panel, joinButton } = setup();
    bus.emit('connection:opened');

    bus.emit('connection:closed');

    expect(panel.hidden).toBe(true);
    expect(joinButton.disabled).toBe(true);
  });

  it('dispose() se désabonne du bus et du bouton « Réessayer »', () => {
    const { bus, panel, retryButton, retry, status } = setup();

    status.dispose();
    bus.emit('connection:lost');
    retryButton.click();

    expect(panel.hidden).toBe(true);
    expect(retry).not.toHaveBeenCalled();
  });
});
