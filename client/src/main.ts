import { PixiRenderer } from './render/PixiRenderer';
import { GameScene } from './render/scenes/GameScene';
import './style.css';

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

// Actions Login -> Lobby
btnLogin.addEventListener('click', () => {
  const pseudo = pseudoInput.value.trim() || 'VoleurInconnu';
  lobbyMyName.textContent = `P1: ${pseudo}`; // Met à jour le nom dans le lobby

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

  // Initialisation du moteur de jeu
  if (!renderer && canvasContainer) {
    PixiRenderer.create(canvasContainer)
      .then((r) => {
        renderer = r;
        currentScene = new GameScene(DEMO_GRID);
        renderer.setScene(currentScene);
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
