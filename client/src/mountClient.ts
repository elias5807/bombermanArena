import type { App } from './App';
import { SERVER_URL } from './config';
import { KeyboardInput, type KeyboardSource } from './input/KeyboardInput';
import { GameView, type GameViewOptions } from './render/GameView';
import { ConnectionStatus } from './ui/connectionStatus';
import { GameOverPanel } from './ui/gameOverMessage';
import { GameTimer } from './ui/gameTimer';
import { HelpPanel } from './ui/helpPanel';
import { Hud } from './ui/hud';
import { LobbyView } from './ui/lobbyList';
import { findPageElements } from './ui/pageElements';
import { ScreenNavigator } from './ui/screenNavigator';

/** Ce qu'un test remplace pour monter le client hors d'un navigateur. */
export interface MountOptions {
  /** Démarrage du rendu et chargement des sprites : PixiJS et `public/assets/` par défaut. */
  rendering?: GameViewOptions;
  /** Émetteur des touches du clavier : `window` par défaut. */
  keyboard?: KeyboardSource;
}

/**
 * Assemble le client sur `page` (la page `index.html`) autour de `app`, puis ouvre la connexion.
 *
 * Les modules de `ui/` se tiennent à jour d'après le bus : état de la connexion, salon, HUD,
 * chrono et encart de fin de partie, recréés à neuf pour chaque session. `ScreenNavigator`
 * enchaîne les écrans, `GameView` dessine la partie et `HelpPanel` ouvre l'aide. Le clavier
 * pilote la partie tant que le joueur local est en vie.
 *
 * @returns la promesse de `app.start()`, appelée une fois tout le client abonné au bus.
 * @throws Error si un élément manque à `page`, avec son sélecteur (voir `findPageElements`) :
 *   rien n'est alors monté, et la connexion n'est pas ouverte.
 *
 * @example
 * void mountClient(document, new App());
 */
export function mountClient(page: ParentNode, app: App, options: MountOptions = {}): Promise<void> {
  const elements = findPageElements(page);

  new HelpPanel(elements.help);
  new ConnectionStatus(elements.connection, app.bus, {
    serverUrl: SERVER_URL,
    retry: () => void app.start(),
  });
  const navigation = new ScreenNavigator(elements.navigation, app.bus, {
    session: app,
    board: new GameView(elements.board, app.bus, options.rendering),
    mountSessionViews: () => [
      new LobbyView(elements.lobby, app.bus, app.state),
      new Hud(elements.hudPlayers, app.bus, app.state),
      new GameTimer(elements.timer, app.bus),
      new GameOverPanel(elements.board, app.bus, app.state),
    ],
  });
  new KeyboardInput(
    app.bus,
    () => navigation.screen === 'game' && app.state.isLocalPlayerAlive,
    options.keyboard,
  );

  // Tout le client écoute le bus : aucun événement ne se perd à l'ouverture de la connexion.
  return app.start();
}
