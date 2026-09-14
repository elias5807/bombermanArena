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


