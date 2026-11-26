import { App } from './App';
import { SERVER_URL } from './config';
import { KeyboardInput } from './input/KeyboardInput';
import { GameView } from './render/GameView';
import { ConnectionStatus } from './ui/connectionStatus';
import { GameOverPanel } from './ui/gameOverMessage';
import { GameTimer } from './ui/gameTimer';
import { HelpPanel } from './ui/helpPanel';
import { Hud } from './ui/hud';
import { LobbyView } from './ui/lobbyList';
import { findPageElements } from './ui/pageElements';
import { ScreenNavigator } from './ui/screenNavigator';
import './style.css';

/**
 * Point d'entrée de l'application : assemble le client sur la page `index.html`.
 *
 * `App` relie la connexion au bus. Les modules de `ui/` se tiennent à jour d'après le bus :
 * état de la connexion, salon, HUD, chrono et encart de fin de partie. `ScreenNavigator`
 * enchaîne les écrans, `GameView` dessine la partie et `HelpPanel` ouvre l'aide. Le clavier
 * pilote la partie tant que le joueur local est en vie.
 *
 * Un élément absent de `index.html` arrête le démarrage avec un message qui le nomme.
 */

const page = findPageElements(document);
const app = new App();

new HelpPanel(page.help);
new ConnectionStatus(page.connection, app.bus, {
  serverUrl: SERVER_URL,
  retry: () => void app.start(),
});
const navigation = new ScreenNavigator(page.navigation, app.bus, {
  session: app,
  board: new GameView(page.board, app.bus),
  // Salon, HUD, chrono et encart de fin de partie : recréés à neuf pour chaque session.
  mountSessionViews: () => [
    new LobbyView(page.lobby, app.bus, app.state),
    new Hud(page.hudPlayers, app.bus, app.state),
    new GameTimer(page.timer, app.bus),
    new GameOverPanel(page.board, app.bus, app.state),
  ],
});

// Contrôles clavier en jeu, tant que le joueur local est en vie
new KeyboardInput(app.bus, () => navigation.screen === 'game' && app.state.isLocalPlayerAlive);

// Tout le client écoute le bus : aucun événement ne se perd à l'ouverture de la connexion.
void app.start();
