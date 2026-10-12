import { PixiRenderer } from './render/PixiRenderer';
import { GameScene, type PlayerState } from './render/scenes/GameScene';
import './style.css';

const DEMO_GRID = { columns: 15, rows: 13 };
const MATCH_DURATION = 120; // 2 minutes par match

// Écrans principaux
const loginScreen = document.getElementById('login-screen') as HTMLElement;
const lobbyScreen = document.getElementById('lobby-screen') as HTMLElement;
const gameScreen = document.getElementById('game-screen') as HTMLElement;
const helpPanel = document.getElementById('help-panel') as HTMLElement;
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const pseudoInput = document.getElementById('pseudo-input') as HTMLInputElement;
const lobbyMyName = document.getElementById('lobby-my-name') as HTMLSpanElement;

// Éléments du HUD
const gameTimerEl = document.getElementById('game-timer') as HTMLElement;
const hudPlayers: Record<string, { item: HTMLElement; score: HTMLElement; name?: HTMLElement }> = {
  p1: {
    item: document.getElementById('hud-player-p1') as HTMLElement,
    score: document.getElementById('hud-score-p1') as HTMLElement,
    name: document.getElementById('hud-name-p1') as HTMLElement,
  },
  p2: {
    item: document.getElementById('hud-player-p2') as HTMLElement,
    score: document.getElementById('hud-score-p2') as HTMLElement,
  },
  p3: {
    item: document.getElementById('hud-player-p3') as HTMLElement,
    score: document.getElementById('hud-score-p3') as HTMLElement,
  },
  p4: {
    item: document.getElementById('hud-player-p4') as HTMLElement,
    score: document.getElementById('hud-score-p4') as HTMLElement,
  },
};

// Modal Fin de Partie
const gameOverModal = document.getElementById('game-over-modal') as HTMLElement;
const gameOverBadge = document.getElementById('game-over-badge') as HTMLElement;
const gameOverTitle = document.getElementById('game-over-title') as HTMLElement;
const gameOverDesc = document.getElementById('game-over-desc') as HTMLElement;
const finalScoreEl = document.getElementById('final-score') as HTMLElement;
const finalTimeEl = document.getElementById('final-time') as HTMLElement;
const btnReplay = document.getElementById('btn-replay') as HTMLButtonElement;
const btnModalLobby = document.getElementById('btn-modal-lobby') as HTMLButtonElement;

// Boutons
const btnLogin = document.getElementById('btn-login') as HTMLButtonElement;
const btnShowHelpLogin = document.getElementById('btn-show-help-login') as HTMLButtonElement;
const btnShowHelpGame = document.getElementById('btn-show-help-game') as HTMLButtonElement;
const btnCloseHelp = document.getElementById('btn-close-help') as HTMLButtonElement;
const btnStartGame = document.getElementById('btn-start-game') as HTMLButtonElement;
const btnLeaveLobby = document.getElementById('btn-leave-lobby') as HTMLButtonElement;
const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;

let renderer: PixiRenderer | null = null;
let currentScene: GameScene | null = null;
let currentPseudo = 'Vous';

// Chronomètre
let timeLeft = MATCH_DURATION;
let timerInterval: number | null = null;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  timeLeft = MATCH_DURATION;
  gameTimerEl.textContent = formatTime(timeLeft);
  gameTimerEl.classList.remove('warning');

  timerInterval = window.setInterval(() => {
    timeLeft -= 1;
    gameTimerEl.textContent = formatTime(Math.max(0, timeLeft));

    if (timeLeft <= 30) {
      gameTimerEl.classList.add('warning');
    }

    if (timeLeft <= 0) {
      stopTimer();
      currentScene?.timeOut();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetHUD() {
  for (const key of Object.keys(hudPlayers)) {
    const p = hudPlayers[key];
    if (p.item) p.item.classList.remove('eliminated');
    if (p.score) p.score.textContent = '00000';
  }
  if (hudPlayers.p1.name) {
    hudPlayers.p1.name.textContent = `P1: ${currentPseudo}`;
  }
}

// Panneau d'aide
function showHelp() {
  helpPanel.classList.remove('hidden');
}
function hideHelp() {
  helpPanel.classList.add('hidden');
}
btnShowHelpLogin.addEventListener('click', showHelp);
btnShowHelpGame.addEventListener('click', showHelp);
btnCloseHelp.addEventListener('click', hideHelp);

// Login -> Lobby
btnLogin.addEventListener('click', () => {
  currentPseudo = pseudoInput.value.trim() || 'Braqueur1';
  lobbyMyName.textContent = `P1: ${currentPseudo}`;
  if (hudPlayers.p1.name) {
    hudPlayers.p1.name.textContent = `P1: ${currentPseudo}`;
  }

  loginScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
});

pseudoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnLogin.click();
});

// Lobby -> Login
btnLeaveLobby.addEventListener('click', () => {
  lobbyScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// Lobby -> Game
btnStartGame.addEventListener('click', () => {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameOverModal.classList.add('hidden');

  resetHUD();
  startTimer();

  // Callbacks pour les événements de jeu
  const gameCallbacks = {
    onScoreUpdate: (scores: { id: string; score: number }[]) => {
      for (const s of scores) {
        if (hudPlayers[s.id]?.score) {
          hudPlayers[s.id].score.textContent = String(s.score).padStart(5, '0');
        }
      }
    },

    onPlayerEliminated: (playerId: string) => {
      if (hudPlayers[playerId]?.item) {
        hudPlayers[playerId].item.classList.add('eliminated');
      }
    },

    onGameOver: (result: { winner: PlayerState | null; isVictory: boolean; reason: string }) => {
      stopTimer();
      const elapsed = MATCH_DURATION - timeLeft;
      const p1Score = currentScene?.players[0]?.score || 0;

      gameOverBadge.textContent = result.isVictory ? '🏆' : '💀';
      gameOverTitle.textContent = result.isVictory ? 'CASSE RÉUSSI !' : 'ÉCHEC DU CASSE !';
      gameOverTitle.style.color = result.isVictory ? 'var(--gold)' : 'var(--red)';
      gameOverDesc.textContent = result.reason;

      finalScoreEl.textContent = String(p1Score).padStart(5, '0');
      finalTimeEl.textContent = formatTime(elapsed);

      gameOverModal.classList.remove('hidden');
    },
  };

  if (!renderer && canvasContainer) {
    PixiRenderer.create(canvasContainer)
      .then((r) => {
        renderer = r;
        currentScene = new GameScene(DEMO_GRID, gameCallbacks, currentPseudo);
        renderer.setScene(currentScene);
      })
      .catch((error: unknown) => {
        console.error("Impossible d'initialiser le moteur de rendu :", error);
      });
  } else if (currentScene) {
    currentScene.restartGame(currentPseudo);
  }
});

// Rejouer depuis la modal
btnReplay.addEventListener('click', () => {
  gameOverModal.classList.add('hidden');
  resetHUD();
  startTimer();
  currentScene?.restartGame(currentPseudo);
});

// Retour au lobby depuis la modal
btnModalLobby.addEventListener('click', () => {
  gameOverModal.classList.add('hidden');
  gameScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  stopTimer();
});

// Quitter le jeu -> Login
btnQuit.addEventListener('click', () => {
  stopTimer();
  gameOverModal.classList.add('hidden');
  gameScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// Contrôles clavier en jeu
window.addEventListener('keydown', (e) => {
  if (
    !gameScreen.classList.contains('hidden') &&
    gameOverModal.classList.contains('hidden') &&
    currentScene
  ) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
      currentScene.handleInput(e.key);
    }
  }
});
