import { App } from './App';
import { PixiRenderer } from './render/PixiRenderer';
import { GameScene } from './render/scenes/GameScene';
import { loadSprites } from './render/sprites/loadSprites';
import './style.css';

/**
 * Point d'entrée de l'application.
 *
 * Enchaîne les écrans décrits dans `index.html` (connexion, salle d'attente, partie, aide).
 * Au lancement de la partie, démarre le rendu PixiJS, charge les sprites, puis affiche
 * `GameScene` et lui transmet les touches du clavier.
 *
 * Provisoire : rien ne passe encore par le bus d'événements ni par le réseau. L'assemblage
 * des couches (App.ts, connexion simulée ou WebSocket) arrive dans une PR dédiée.
 */

/** Provisoire : les dimensions de la grille viendront du serveur, à valider avec le Backend. */
const DEMO_GRID = { columns: 15, rows: 13 };

// DOM Elements
const loginScreen = document.getElementById('login-screen') as HTMLElement;
const lobbyScreen = document.getElementById('lobby-screen') as HTMLElement;
const gameScreen = document.getElementById('game-screen') as HTMLElement;
const helpPanel = document.getElementById('help-panel') as HTMLElement;
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const pseudoInput = document.getElementById('pseudo-input') as HTMLInputElement;
const lobbyMyName = document.getElementById('lobby-my-name') as HTMLSpanElement;

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

// Actions Login -> Lobby
btnLogin.addEventListener('click', () => {
  const pseudo = pseudoInput.value.trim() || 'VoleurInconnu';
  lobbyMyName.textContent = `P1: ${pseudo}`;

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
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  // Initialisation du moteur de jeu et abonnement de la scène au bus d'événements
  if (!renderer && canvasContainer) {
    PixiRenderer.create(canvasContainer)
      .then(async (r) => {
        renderer = r;
        currentScene = new GameScene(DEMO_GRID, await loadSprites(), app.bus);
        r.setScene(currentScene);
      })
      .catch((error: unknown) => {
        console.error("Impossible d'initialiser le rendu :", error);
      });
  }
});

// Actions Game -> Login
btnQuit.addEventListener('click', () => {
  gameScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// Gestion des contrôles clavier en jeu
window.addEventListener('keydown', (e) => {
  if (!gameScreen.classList.contains('hidden') && currentScene) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
      currentScene.handleInput(e.key);
    }
  }
});
