import { App } from './App';
import { SERVER_URL } from './config';
import { GameOverPanel } from './ui/gameOverMessage';
import { KeyboardInput } from './input/KeyboardInput';
import { GameView } from './render/GameView';
import { ConnectionStatus } from './ui/connectionStatus';
import { GameTimer } from './ui/gameTimer';
import { HelpPanel } from './ui/helpPanel';
import { Hud } from './ui/hud';
import { LobbyView } from './ui/lobbyList';
import { ScreenNavigator } from './ui/screenNavigator';
import './style.css';

/**
 * Point d'entrée de l'application : assemble le client sur la page `index.html`.
 *
 * `App` relie la connexion au bus. Les modules de `ui/` se tiennent à jour d'après le bus :
 * état de la connexion, salon, HUD, chrono et encart de fin de partie. `ScreenNavigator`
 * enchaîne les écrans, `GameView` dessine la partie et `HelpPanel` ouvre l'aide. Le clavier
 * pilote la partie tant que le joueur local est en vie.
 */

// DOM Elements
const loginScreen = document.getElementById('login-screen') as HTMLElement;
const lobbyScreen = document.getElementById('lobby-screen') as HTMLElement;
const gameScreen = document.getElementById('game-screen') as HTMLElement;
const helpPanel = document.getElementById('help-panel') as HTMLElement;
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const pseudoInput = document.getElementById('pseudo-input') as HTMLInputElement;
const connectionPanel = document.getElementById('connection-status') as HTMLElement;
const connectionMessage = document.getElementById('connection-message') as HTMLElement;
const lobbyPlayersList = document.querySelector('.lobby-players') as HTMLUListElement;
const startHint = document.getElementById('start-hint') as HTMLElement;
const timerDisplay = document.querySelector('.timer') as HTMLElement;
const hudPlayerList = document.querySelector('.player-list') as HTMLElement;

// Buttons
const btnLogin = document.getElementById('btn-login') as HTMLButtonElement;
const btnRetry = document.getElementById('btn-retry') as HTMLButtonElement;
const btnShowHelpLogin = document.getElementById('btn-show-help-login') as HTMLButtonElement;
const btnShowHelpGame = document.getElementById('btn-show-help-game') as HTMLButtonElement;
const btnCloseHelp = document.getElementById('btn-close-help') as HTMLButtonElement;
const btnStartGame = document.getElementById('btn-start-game') as HTMLButtonElement;
const btnLeaveLobby = document.getElementById('btn-leave-lobby') as HTMLButtonElement;
const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;

new HelpPanel({
  panel: helpPanel,
  openButtons: [btnShowHelpLogin, btnShowHelpGame],
  closeButton: btnCloseHelp,
});

// Initialisation du bus et de l'état de la connexion
const app = new App();
new ConnectionStatus(
  {
    panel: connectionPanel,
    message: connectionMessage,
    retryButton: btnRetry,
    joinButton: btnLogin,
  },
  app.bus,
  { serverUrl: SERVER_URL, retry: () => void app.start() },
);
const navigation = new ScreenNavigator(
  {
    screens: { login: loginScreen, lobby: lobbyScreen, game: gameScreen },
    pseudoInput,
    joinButton: btnLogin,
    startButton: btnStartGame,
    leaveLobbyButton: btnLeaveLobby,
    quitButton: btnQuit,
  },
  app.bus,
  {
    session: app,
    board: new GameView(canvasContainer, app.bus),
    // Salon, HUD, chrono et encart de fin de partie : recréés à neuf pour chaque session.
    mountSessionViews: () => [
      new LobbyView(
        { list: lobbyPlayersList, startButton: btnStartGame, startHint },
        app.bus,
        app.state,
      ),
      new Hud(hudPlayerList, app.bus, app.state),
      new GameTimer(timerDisplay, app.bus),
      new GameOverPanel(canvasContainer, app.bus, app.state),
    ],
  },
);

// Contrôles clavier en jeu, tant que le joueur local est en vie
new KeyboardInput(app.bus, () => navigation.screen === 'game' && app.state.isLocalPlayerAlive);

// Tout le client écoute le bus : aucun événement ne se perd à l'ouverture de la connexion.
void app.start();
