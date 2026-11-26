/** Les éléments du panneau d'aide (« Manuel tactique ») de `index.html`. */
export interface HelpPanelElements {
  panel: HTMLElement;
  /** Les boutons qui l'ouvrent : « Instructions de jeu » (connexion) et « ? » (partie). */
  openButtons: readonly HTMLButtonElement[];
  /** Le bouton ✕ du panneau. */
  closeButton: HTMLButtonElement;
}

/**
 * Panneau d'aide, affiché à côté de l'écran courant : ouvert par l'un des `openButtons`,
 * fermé par `closeButton`. Il ne dépend ni du bus ni de l'écran affiché.
 *
 * Il vit aussi longtemps que la page : il n'a rien à libérer.
 */
export class HelpPanel {
  constructor({ panel, openButtons, closeButton }: HelpPanelElements) {
    for (const button of openButtons) {
      button.addEventListener('click', () => panel.classList.remove('hidden'));
    }
    closeButton.addEventListener('click', () => panel.classList.add('hidden'));
  }
}
