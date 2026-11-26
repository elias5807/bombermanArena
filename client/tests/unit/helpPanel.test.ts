// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { HelpPanel } from '../../src/ui/helpPanel';

/** Le panneau d'aide de `index.html`, masqué au départ, et ses trois boutons. */
function setup() {
  const panel = document.createElement('div');
  panel.className = 'hidden';
  const openFromLogin = document.createElement('button');
  const openFromGame = document.createElement('button');
  const closeButton = document.createElement('button');
  new HelpPanel({ panel, openButtons: [openFromLogin, openFromGame], closeButton });

  const isOpen = () => !panel.classList.contains('hidden');
  return { openFromLogin, openFromGame, closeButton, isOpen };
}

describe('HelpPanel', () => {
  it('reste masqué tant que personne ne le demande', () => {
    const { isOpen } = setup();

    expect(isOpen()).toBe(false);
  });

  it('s’ouvre depuis l’écran de connexion comme depuis la partie', () => {
    const fromLogin = setup();
    fromLogin.openFromLogin.click();
    expect(fromLogin.isOpen()).toBe(true);

    const fromGame = setup();
    fromGame.openFromGame.click();
    expect(fromGame.isOpen()).toBe(true);
  });

  it('se ferme avec ✕, puis peut être rouvert', () => {
    const { openFromGame, closeButton, isOpen } = setup();
    openFromGame.click();

    closeButton.click();
    expect(isOpen()).toBe(false);

    openFromGame.click();
    expect(isOpen()).toBe(true);
  });

  it('un bouton d’ouverture ne le referme pas', () => {
    const { openFromLogin, isOpen } = setup();

    openFromLogin.click();
    openFromLogin.click();

    expect(isOpen()).toBe(true);
  });
});
