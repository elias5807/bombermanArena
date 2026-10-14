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
├── 📝 CONTRIBUTING.md             # Règles de contribution et GitFlow
└── 📝 README.md
```

---

## 🚀 Démarrer le Serveur

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

Merci de consulter le guide [CONTRIBUTING.md](CONTRIBUTING.md) pour les règles de nommage des branches (`feature/*`, `fix/*`, `test/*`, `ci/*`) et la structure des messages de commit conventionnels. Tout code doit passer par une Pull Request validée vers la branche `develop`.
