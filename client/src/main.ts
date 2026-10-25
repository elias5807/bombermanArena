import type { GameStateMessage } from '@shared/protocol/messages';
import { App } from './App';
import { describeGameOver } from './ui/gameOverMessage';
import { KeyboardInput } from './input/KeyboardInput';
import { PixiRenderer } from './render/PixiRenderer';
import { GameScene } from './render/scenes/GameScene';
import { loadSprites } from './render/sprites/loadSprites';
import { renderLobbyPlayers } from './ui/lobbyList';
import './style.css';

/**
 * Point d'entrée de l'application.
 *
 * Enchaîne les écrans décrits dans `index.html` (connexion, salle d'attente, partie, aide).
 * Au lancement de la partie, démarre le rendu PixiJS, charge les sprites, puis affiche
 * `GameScene`. Le clavier pilote la partie tant que le joueur local est en vie.
 */

const DEMO_GRID = { columns: 15, rows: 13 };

// DOM Elements
const loginScreen = document.getElementById('login-screen') as HTMLElement;
const lobbyScreen = document.getElementById('lobby-screen') as HTMLElement;
const gameScreen = document.getElementById('game-screen') as HTMLElement;
const helpPanel = document.getElementById('help-panel') as HTMLElement;
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const pseudoInput = document.getElementById('pseudo-input') as HTMLInputElement;
const lobbyMyName = document.getElementById('lobby-my-name') as HTMLSpanElement;
const lobbyPlayersList = document.querySelector('.lobby-players') as HTMLUListElement;

// Buttons
const btnLogin = document.getElementById('btn-login') as HTMLButtonElement;
const btnShowHelpLogin = document.getElementById('btn-show-help-login') as HTMLButtonElement;
const btnShowHelpGame = document.getElementById('btn-show-help-game') as HTMLButtonElement;
const btnCloseHelp = document.getElementById('btn-close-help') as HTMLButtonElement;
const btnStartGame = document.getElementById('btn-start-game') as HTMLButtonElement;
const btnLeaveLobby = document.getElementById('btn-leave-lobby') as HTMLButtonElement;
const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;

let renderer: PixiRenderer | null = null;
let currentScene: GameScene | null = null;
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

// Initialisation du bus et de la connexion
const app = new App();
void app.start();

// Synchronisation de l'affichage du lobby avec le serveur
app.bus.on('server:LOBBY_STATUS', ({ players }) => {
  if (!lobbyPlayersList) return;
  renderLobbyPlayers(lobbyPlayersList, players);
});

function updateHUD(players: { name?: string; playerId: string }[]) {
  players.forEach((p, idx) => {
    const item = document.querySelector(`.player-item.p${idx + 1} .player-name`);
    if (item && p.name) {
      item.textContent = `${p.name} (P${idx + 1})`;
    }
  });
}

function launchGame() {
  if (gameScreen.classList.contains('hidden')) {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    if (!renderer && canvasContainer) {
      PixiRenderer.create(canvasContainer)
        .then(async (r) => {
          renderer = r;
          const grid = cachedGameState?.grid ?? DEMO_GRID;
          currentScene = new GameScene(grid, await loadSprites(), app.bus);
          r.setScene(currentScene);

          // La scène écoute le bus à partir de maintenant : l'état arrivé avant elle lui est
          // donné une fois, les suivants lui parviennent directement.
          if (cachedGameState) {
            currentScene.handleGameState(cachedGameState);
          }
        })
        .catch((error: unknown) => {
          console.error("Impossible d'initialiser le rendu :", error);
        });
    }
  }
}

// Mise en cache de l'état du jeu pour la GameScene créée après son arrivée
app.bus.on('server:GAME_STATE', (msg) => {
  cachedGameState = msg;
  updateHUD(msg.players);
});

// Lancement automatique synchronisé quand le serveur annonce le début de partie
app.bus.on('server:GAME_STARTED', () => {
  launchGame();
});

// Actions Login -> Lobby
btnLogin.addEventListener('click', () => {
  const pseudo = pseudoInput.value.trim() || 'VoleurInconnu';
  if (lobbyMyName) {
    lobbyMyName.textContent = `P1: ${pseudo}`;
  }

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
btnLeaveLobby.addEventListener('click', () => {
  lobbyScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

btnStartGame.addEventListener('click', () => {
  app.bus.emit('input:start');
  launchGame();
});

// Actions Game -> Login
btnQuit.addEventListener('click', () => {
  gameScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// Contrôles clavier en jeu, tant que le joueur local est en vie
new KeyboardInput(
  app.bus,
  () => !gameScreen.classList.contains('hidden') && app.state.isLocalPlayerAlive,
);

// Fin de partie, déduite de l'état du serveur : un encart par-dessus le plateau
const gameOverPanel = canvasContainer.appendChild(document.createElement('div'));
gameOverPanel.className = 'game-over hidden';
const gameOverTitle = gameOverPanel.appendChild(document.createElement('h2'));
const gameOverText = gameOverPanel.appendChild(document.createElement('p'));
app.bus.on('state:gameOver', (result) => {
  const { title, message } = describeGameOver(result, app.state.players);
  gameOverTitle.textContent = title;
  gameOverText.textContent = message;
  gameOverPanel.classList.remove('hidden');
});
app.bus.on('server:GAME_STARTED', () => gameOverPanel.classList.add('hidden'));
