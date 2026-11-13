# Bomberman Arena

Projet de **Qualité de Développement** (BUT 3 Informatique).  
Jeu multijoueur en réseau temps réel basé sur une architecture **Client-Serveur autoritaire** avec WebSockets.

---

## 🏗️ Architecture du Monorepo

Le projet est structuré sous forme de monorepo npm avec trois workspaces distincts :

```text
├── 📁 .github/workflows/          # Pipelines CI/CD (build, tests, docker)
├── 🐳 compose.yaml                # Configuration Docker Compose
├── ⚙️ package.json                 # Gestion des workspaces npm (client, server, shared)
├── 📁 shared/                     # Code et contrats partagés (Single Source of Truth)
│   ├── 📁 src/
│   │   ├── 📁 protocol/           # Définition stricte des messages réseau WebSocket
│   │   └── 📄 index.ts
│   ├── ⚙️ package.json
│   └── ⚙️ tsconfig.json
├── 📁 server/                     # Backend Node.js (Serveur autoritaire)
│   ├── 🐳 Dockerfile              # Image Docker du serveur
│   ├── 📁 src/
│   │   ├── 📁 game/               # Moteur de jeu (GameEngine, Grille, Collisions)
│   │   │   ├── 📄 GameEngine.ts   # Logique autoritaire, spawns, détonations, scores
│   │   │   └── 📄 grid.ts         # Génération de la carte et calcul des collisions
│   │   ├── 📁 network/            # Gestion des sockets et du lobby
│   │   │   ├── 📄 connectionManager.ts
│   │   │   └── 📄 lobbyManager.ts
│   │   └── 📄 index.ts            # Point d'entrée du serveur
│   └── 📁 tests/                  # Tests unitaires du moteur de jeu et serveur
├── 📁 client/                     # Frontend de bureau hybride (Vite / PixiJS / Tauri)
│   ├── 📁 src/
│   │   ├── 📁 core/               # Bus d'événements (EventBus, catalogue AppEvents)
│   │   ├── 📁 network/            # WebSocketClient, MockServerAdapter, connectionBridge
│   │   ├── 📁 render/             # Moteur de rendu PixiJS 8 (GameScene, GridLayout)
│   │   ├── 📁 ui/                 # Interface utilisateur (Menus, Lobby, HUD)
│   │   └── 📄 main.ts             # Point d'entrée du client
│   └── 📁 tests/                  # Tests unitaires et d'intégration (176 tests)
├── 📜 start.bat                   # Script de lancement tout-en-un (Windows)
├── 📝 CONTRIBUTING.md             # Règles de contribution et GitFlow
└── 📝 README.md
```

---

## ⚡ Démarrage Rapide (Windows)

Pour lancer le jeu complet (Serveur + Client) en un seul clic sous Windows :
- Double-cliquez sur **`start.bat`** à la racine, ou exécutez dans un terminal :
  ```cmd
  .\start.bat
  ```
Le script installe automatiquement les dépendances si nécessaire (`npm ci`), compile le TypeScript (`npm run build --workspaces`), démarre le serveur backend (port `3000`) et le client Vite (port `5173`) dans deux consoles distinctes, puis ouvre automatiquement le jeu dans votre navigateur.

---

## 🚀 Démarrer le Serveur Manuellement

### Prérequis
- **Node.js** 20+
- **Docker Desktop** (si vous lancez via conteneur)

### Option A : Avec Docker (Recommandé)
Depuis la **racine du projet** :
```bash
# 1. Construction de l'image (le contexte racine est requis pour le workspace shared)
docker build -f server/Dockerfile -t bomberman-server .

# 2. Lancement du conteneur
docker run -d -p 3000:3000 --name bomberman-server-instance bomberman-server
```

Vérifier les logs :
```bash
docker logs bomberman-server-instance
```
> Le serveur affiche : `Serveur démarré, en écoute sur le port 3000`

### Option B : Sans Docker (En local avec Node.js)
Depuis la **racine du projet** :
```bash
npm ci
npm run build --workspaces
npm run start --workspace=@bomberman-area/server
```

---

## 🎮 Démarrer le Client

Le client se lance depuis le dossier `client/` :
```bash
cd client
npm run dev
```
Ouvrez l'URL affichée (par défaut `http://localhost:5173`) :
1. Entrez un nom de code (pseudo) et rejoignez la salle d'attente.
2. Le statut des joueurs connectés s'actualise en temps réel.
3. Cliquez sur **Lancer la partie** (ou attendez que 4 joueurs rejoignent pour un lancement automatique).
4. Utilisez les flèches du clavier pour vous déplacer et la barre **Espace** pour poser des bombes.

> [!TIP]
> Le client utilise `VITE_CONNECTION_MODE=server` par défaut dans `client/.env.development` pour se connecter au serveur réel (`ws://localhost:3000`). Pour tester le client hors-ligne sans serveur, réglez cette variable sur `mock`.

---

## 📡 Protocole WebSocket (`@bomberman-area/shared`)

Toutes les communications passent par des messages JSON typés sous `shared/src/protocol/messages.ts`.

### Messages Client ➔ Serveur

| Type | Paramètres | Rôle |
| :--- | :--- | :--- |
| `JOIN_LOBBY` | `{ playerName: string }` | Demande d'entrée dans la salle d'attente |
| `MOVE` | `{ playerId: string, direction: 'up'\|'down'\|'left'\|'right' }` | Intention de déplacement |
| `PLACE_BOMB` | `{ playerId: string }` | Intention de poser une bombe |
| `START_GAME` | `{}` | Demande de lancement de partie pour tous |

### Messages Serveur ➔ Client

| Type | Données | Rôle |
| :--- | :--- | :--- |
| `PLAYER_JOINED` | `{ playerId, playerName }` | Notifie l'arrivée d'un joueur |
| `LOBBY_STATUS` | `{ players: [...] }` | Liste complète des joueurs en attente |
| `GAME_STARTED` | `{ players: [...] }` | Déclenche le passage en jeu pour tous les clients |
| `GAME_STATE` | `{ players, grid, map }` | Synchronisation de la carte (murs/briques) et des joueurs |
| `POSITION_UPDATED` | `{ playerId, col, row, direction }` | Position autoritaire validée, diffusée à tous |
| `BOMB_PLACED` | `{ bombId, playerId, col, row }` | Diffuse la pose d'une bombe sur la grille |
| `BOMB_EXPLODED` | `{ bombId, affectedCells, destroyedBricks, eliminatedPlayers }` | Résultat de l'explosion, briques détruites et éliminations |

### Tester manuellement avec `wscat`
Dans un terminal séparé :
```bash
npm install -g wscat
wscat -c ws://localhost:3000
```
Puis envoyez :
```json
{"type":"JOIN_LOBBY","playerName":"Agent007"}
```
Le serveur répond immédiatement avec `PLAYER_JOINED`, `LOBBY_STATUS` et `GAME_STATE`.

---

## 🧪 Qualité & Tests

Le projet applique une politique stricte de tests automatisés et de vérification des types :

```bash
# Lancer les tests sur tous les workspaces
npm test --workspaces

# Vérification TypeScript sans émission
npm run typecheck

# Compilation de l'ensemble du monorepo
npm run build

# Analyse statique du code (linter)
npm run lint --workspace=@bomberman-area/client
```

---

## 🤝 Contribution & GitFlow

Le projet suit des règles de contribution et de qualité de code strictes. Merci de consulter le guide complet **[CONTRIBUTING.md](CONTRIBUTING.md)** avant toute intervention.

### Points clés à respecter :
- **Branches protégées** : Il est **interdit** de pousser directement sur `main` ou `develop`.
- **Nommage des branches** : Créez vos branches depuis `develop` avec un préfixe de type (`feature/*`, `fix/*`, `docs/*`, `test/*`, `refactor/*`, `ci/*`, `chore/*`).
- **Commits conventionnels** : Format obligatoire `<type>: <description>` (`feat:`, `fix:`, `chore:`, `refactor:`, `ci:`, `docs:`, `test:`).
- **Processus de Pull Request** :
  1. Toute PR doit cibler la branche **`develop`**.
  2. Elle doit être **approuvée par au moins 2 personnes** (dont au moins un membre du pôle DevOps & Qualité).
  3. L'ensemble des pipelines CI GitHub Actions doivent passer avec succès.
- **Validation locale obligatoire avant soumission** :
  ```bash
  npm run typecheck
  npm test --workspaces
  npm run build --workspaces
  npm run lint --workspace=@bomberman-area/client
  ```
- **Releases** : Lorsque `develop` est stabilisée, une PR vers `main` est effectuée avec la pose d'un **tag Git** (`vX.Y.Z`).
