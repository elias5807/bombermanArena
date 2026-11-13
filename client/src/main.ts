import type { GameStateMessage } from '@shared/protocol/messages';
import { App } from './App';
import { SERVER_URL } from './config';
import { GameOverPanel } from './ui/gameOverMessage';
import { KeyboardInput } from './input/KeyboardInput';
import { PixiRenderer } from './render/PixiRenderer';
import { GameScene } from './render/scenes/GameScene';
import { loadSprites, type SpriteTextures } from './render/sprites/loadSprites';
import { ConnectionStatus } from './ui/connectionStatus';
import { GameTimer } from './ui/gameTimer';
import { Hud } from './ui/hud';
import { LobbyView } from './ui/lobbyList';
import './style.css';

/**
 * Point d'entrée de l'application.
 *
 * Enchaîne les écrans décrits dans `index.html` (connexion, salle d'attente, partie, aide)
 * et y branche les modules de `ui/`, qui se tiennent à jour d'après le bus : état de la
 * connexion, salon, HUD, chrono et encart de fin de partie. Au premier lancement de partie,
 * démarre le rendu PixiJS et charge les sprites ; chaque partie a ensuite sa `GameScene`
 * neuve. Le clavier pilote la partie tant que le joueur local est en vie.
 *
 * « Retour au login » et « Quitter » ferment la connexion, ce qui retire le joueur du
 * serveur, puis en ouvrent une neuve. Une coupure ramène aussi à l'écran de connexion.
 */

const DEMO_GRID = { columns: 15, rows: 13 };

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

/** Moteur de rendu et sprites, préparés au premier lancement de partie puis réutilisés. */
let rendering: Promise<{ renderer: PixiRenderer; sprites: SpriteTextures }> | null = null;
let cachedGameState: GameStateMessage | null = null;

// Interactions Help Panel
function showHelp() {
  helpPanel.classList.remove('hidden');
}
function hideHelp() {
  helpPanel.classList.add('hidden');
}
btnShowHelpLogin.addEventListener('click', showHelp);
btnShowHelpGame.addEventListener('click', showHelp);
btnCloseHelp.addEventListener('click', hideHelp);

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

/** Écrans tenus à jour d'après le bus, recréés à neuf pour chaque session. */
function mountScreens(): { dispose(): void }[] {
  return [
    new LobbyView(
      { list: lobbyPlayersList, startButton: btnStartGame, startHint },
      app.bus,
      app.state,
    ),
    new Hud(hudPlayerList, app.bus, app.state),
    new GameTimer(timerDisplay, app.bus),
    new GameOverPanel(canvasContainer, app.bus, app.state),
  ];
}
let screens = mountScreens();

// Les écrans écoutent le bus avant l'ouverture : ils ne manquent aucun événement.
void app.start();

/** Revient à l'écran de connexion, avec le salon, le HUD, le chrono et l'encart remis à zéro. */
function showLoginScreen() {
  for (const screen of screens) {
    screen.dispose();
  }
  screens = mountScreens();
  cachedGameState = null;

  lobbyScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

/** Quitte le salon ou la partie : le serveur retire le joueur quand sa connexion se ferme. */
function leaveSession() {
  app.stop();
  showLoginScreen();
  void app.start();
}

app.bus.on('connection:lost', showLoginScreen);

function startRendering() {
  return PixiRenderer.create(canvasContainer).then(async (renderer) => ({
    renderer,
    sprites: await loadSprites(),
  }));
}

function launchGame() {
  if (gameScreen.classList.contains('hidden')) {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    rendering ??= startRendering().catch((error: unknown) => {
      rendering = null; // nouvel essai à la partie suivante
      throw error;
    });
    rendering
      .then(({ renderer, sprites }) => {
        // Une scène neuve à chaque partie : `setScene` détruit la précédente, ses sprites
        // et ses bombes. Elle écoute le bus à partir de maintenant : l'état arrivé avant
        // elle lui est donné une fois, les suivants lui parviennent directement.
        const scene = new GameScene(cachedGameState?.grid ?? DEMO_GRID, sprites, app.bus);
        renderer.setScene(scene);
        if (cachedGameState) {
          scene.handleGameState(cachedGameState);
        }
      })
      .catch((error: unknown) => {
        console.error("Impossible d'initialiser le rendu :", error);
      });
  }
}

// Mise en cache de l'état du jeu pour la GameScene créée après son arrivée
app.bus.on('server:GAME_STATE', (msg) => {
  cachedGameState = msg;
});

// Lancement automatique synchronisé quand le serveur annonce le début de partie
app.bus.on('server:GAME_STARTED', () => {
  launchGame();
});

// Actions Login -> Lobby (bouton actif seulement connexion ouverte, voir ConnectionStatus)
btnLogin.addEventListener('click', () => {
  const pseudo = pseudoInput.value.trim() || 'VoleurInconnu';

  // Notification au serveur via le bus d'événements
  app.bus.emit('input:join', { playerName: pseudo });

  // Transition vers la salle d'attente
  loginScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
});

pseudoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnLogin.click();
});

// Actions Lobby -> Game ou Login
btnLeaveLobby.addEventListener('click', leaveSession);

btnStartGame.addEventListener('click', () => {
  app.bus.emit('input:start');
  launchGame();
});

// Actions Game -> Login
btnQuit.addEventListener('click', leaveSession);

// Contrôles clavier en jeu, tant que le joueur local est en vie
new KeyboardInput(
  app.bus,
  () => !gameScreen.classList.contains('hidden') && app.state.isLocalPlayerAlive,
);
