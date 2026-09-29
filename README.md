# BombermanArena
Projet de qualité de developement

# Serveur Setup

## Prérequis

- Node.js 20+
- Docker desktop d'installé et de lancé

## Démarrer

```bash
git clone https://github.com/elias5807/bombermanArena.git
cd bombermanArena/server
git checkout develop
docker build -t bomberman-server .
docker run -p 3000:3000 bomberman-server
```

Si on voit ce texte dans le terminal c'est carré :
```
Serveur démarré, en écoute sur le port 3000
```
 
## Tester (ouvrir un autre terminal sans fermer l'autre)
 
```bash
npm install -g wscat
wscat -c ws://localhost:3000
```

On doit voir :
```
Connected (press CTRL+C to quit)
```
et dans le terminal principal : 
```
Un joueur vient de se connecter
```

Envoyer :
```json
{"type":"MOVE","playerId":"p1","direction":"up"}
```
 
Recevoir :
```json
{"type":"POSITION_UPDATED","playerId":"p1","position":"up"}
```
 
Si ça répond, le serveur fonctionne.

# Architecture

'''
├── 📁 .github/ workflows/ ...
├── 🐳 docker-compose.yml       <-- NOUVEAU : Lance le client et le serveur ensemble
├── ⚙️ package.json             <-- NOUVEAU : Gère les workspaces (client, server, shared)
├── 📁 shared                   <-- NOUVEAU : Code commun
│   ├── 📁 src
│   │   ├── 📁 constants        (Taille de la grille, vitesse, timers des bombes)
│   │   ├── 📁 types            (Interfaces communes : Player, GameState, etc.)
│   │   ├── 📁 protocol         (Définition stricte des messages réseau)
│   │   └── 📁 math             (Utilitaires de collision ou de grille partagés)
│   ├── ⚙️ package.json
│   └── ⚙️ tsconfig.json
├── 📁 client                   (Ton frontend Vite)
│   ├── 🐳 Dockerfile           <-- NOUVEAU : Pour conteneuriser le build Vite (Nginx)
│   ├── 📁 src
│   │   ├── 📁 core             (Boucle de jeu côté client, interpolation)
│   │   ├── 📁 input            (Gestion clavier/manette)
│   │   ├── 📁 network          (Socket.io ou WebSockets, écoute du serveur)
│   │   ├── 📁 render           (Moteur de rendu, ex: Canvas/PixiJS)
│   │   │   ├── 📁 scenes
│   │   │   └── 📁 sprites
│   │   ├── 📁 state            (Stockage local de l'état du jeu)
│   │   └── 📁 ui               (Menus, HUD, scores en React/Vue ou HTML pur)
│   └── ... (fichiers de config)
├── 📁 server                   (Ton backend Node.js)
│   ├── 📁 src
│   │   ├── 📁 game             <-- NOUVEAU : Le moteur de jeu du serveur
│   │   │   ├── 📄 engine.ts    (Boucle de jeu "Authoritative")
│   │   │   ├── 📄 grid.ts      (Gestion de la carte et destructions)
│   │   │   └── 📄 entities.ts  (Joueurs, Bombes, Bonus)
│   │   ├── 📁 network          <-- RÉORGANISÉ
│   │   │   ├── 📄 connectionManager.ts
│   │   │   └── 📄 lobbyManager.ts
│   │   └── 📄 index.ts
│   └── 🐳 Dockerfile           (Déjà présent)
└── 📝 README.md

'''


