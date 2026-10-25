# Bomberman Arena — Client

Application cliente du projet Bomberman Arena, développée par le pôle Frontend.
Le serveur est dans `../server` et n'est pas nécessaire pour lancer le client
(mode mock prévu, voir plus bas).

## Prérequis

- Node.js 22 ou 24 LTS

## Démarrer

Le client est un workspace npm du dépôt : ses dépendances s'installent à la **racine**,
ses scripts se lancent depuis `client/`.

```bash
npm ci            # à la racine du dépôt
cd client
npm run dev       # avec le serveur, lancé à part (ws://localhost:3000)
npm run dev:mock  # ou sans serveur, avec le serveur simulé
```

Un `npm install` lancé dans `client/` n'installe pas les outils communs (TypeScript, ESLint,
Vitest, Prettier), déclarés à la racine : les scripts échouent alors faute de `tsc`.

## Scripts

| Script                 | Rôle                                               |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Serveur de développement Vite                      |
| `npm run dev:mock`     | Le même, hors ligne : avec le serveur simulé       |
| `npm run build`        | Vérification des types puis build de production    |
| `npm run preview`      | Sert le build de production en local               |
| `npm run typecheck`    | Vérification des types seule                       |
| `npm test`             | Tests unitaires et d'intégration (Vitest)          |
| `npm run lint`         | ESLint                                             |
| `npm run format`       | Prettier : réécrit les fichiers                    |
| `npm run format:check` | Prettier : vérifie le formatage sans rien modifier |
| `npm run tauri dev`    | Lance l'application desktop (fenêtre Tauri)        |
| `npm run tauri build`  | Produit l'exécutable et les installeurs Windows    |

Les scripts `build`, `typecheck`, `lint`, `format:check` et `test` sont ceux
attendus par le pipeline CI du pôle DevOps & Qualité
(`.github/workflows/ci-cd-client.yml`, à venir). Les fins de ligne sont fixées
à LF par `.gitattributes`, pour que `format:check` donne le même résultat sous
Windows et sous Linux.

## Application desktop (Tauri)

Le client est livré comme application de bureau avec [Tauri 2](https://v2.tauri.app/)
(coquille native en Rust, interface en TypeScript). Il **n'est pas dockerisé** :
seul le serveur l'est.

Prérequis supplémentaires pour lancer ou construire l'application :

- Rust stable, via [rustup](https://rustup.rs/)
- Windows : Microsoft C++ Build Tools (charge « Développement Desktop en C++ ») et
  WebView2, déjà présent sur Windows 11

```bash
cd client
npm run tauri dev     # fenêtre native + rechargement à chaud
npm run tauri build   # exécutable + installeurs (MSI, NSIS)
```

Le premier `tauri build` compile toutes les dépendances Rust : compter plusieurs
minutes. Les fichiers produits se trouvent dans `src-tauri/target/release/` :

| Fichier                                 | Contenu         |
| --------------------------------------- | --------------- |
| `bomberman-arena.exe`                   | L'application   |
| `bundle/msi/*.msi`, `bundle/nsis/*.exe` | Les installeurs |

Points à connaître :

- Le port de développement est fixé à `5173` (`vite.config.ts`, `strictPort`) :
  Tauri charge cette URL exacte, un autre port donnerait une fenêtre blanche.
- La politique de sécurité (`csp`) est désactivée pour l'instant. Si elle est
  activée plus tard, elle devra autoriser la connexion au serveur
  (`connect-src ws://...`), sinon le WebSocket sera bloqué.
- Les icônes (`src-tauri/icons/`) sont celles générées par défaut : à remplacer.
- Le Cargo.lock est versionné (`src-tauri/Cargo.lock`) : c'est une application,
  pas une bibliothèque, et la CI doit compiler les mêmes versions que nous.

## Rendu (PixiJS)

L'affichage est dessiné avec [PixiJS 8](https://pixijs.com/) (WebGL), dans `src/render/`.
Au lancement, le client affiche l'écran de connexion puis la salle d'attente, en HTML
(`index.html`) ; le plateau PixiJS n'apparaît qu'au début de la partie (`server:GAME_STARTED`).

| Fichier                  | Rôle                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `PixiRenderer.ts`        | Moteur : possède l'application PixiJS, affiche une scène à la fois et la prévient des changements de taille |
| `scenes/Scene.ts`        | Interface d'un écran (`view`, `resize`, `destroy`) : le moteur ne connaît que celle-ci                      |
| `scenes/GameScene.ts`    | Scène de la partie : dessine la grille                                                                      |
| `sprites/loadSprites.ts` | Charge les images de `public/assets/sprites/` et rend les textures que la scène dessine                     |
| `GridLayout.ts`          | Géométrie de la grille, cases et pixels. Sans PixiJS, donc testable sans navigateur                         |

```ts
const renderer = await PixiRenderer.create(document.getElementById('canvas-container')!);
renderer.setScene(new GameScene({ columns: 15, rows: 13 }, await loadSprites(), app.bus));
```

Points à connaître :

- La grille tient dans la fenêtre avec une marge, en cases de taille entière, centrée, et
  elle est redessinée à chaque redimensionnement. `GridLayout` donne la position d'une case
  (`cellOrigin`) et la case sous un point (`cellAt`) : les sprites s'en serviront pour se placer.
- Repère : une case est repérée par sa colonne et sa ligne à partir de 0, en haut à gauche ;
  les colonnes vont vers la droite, les lignes vers le bas. Les dimensions de la grille
  viennent du serveur (`grid` dans `GAME_STATE`) ; à défaut, `main.ts` prend 15 × 13
  (`DEMO_GRID`). Ce repère est **provisoire**, à valider avec le Backend.
- Le moteur ne connaît ni le réseau ni l'état du jeu (règle ESLint de `render/`) : les scènes
  dessinent ce qu'on leur donne. La lecture de l'état viendra avec `GameState`.
- `GridLayout` et `GameScene` se testent sans navigateur : les objets PixiJS fonctionnent sans
  WebGL tant qu'on ne les affiche pas. Les images, elles, ne se chargent que dans un navigateur :
  `GameScene` reçoit donc ses textures de `loadSprites`, et les tests lui en donnent des vides.
  `PixiRenderer` se teste avec une fausse application PixiJS. Le rendu lui-même (couleurs,
  netteté) se contrôle à l'œil avec `npm run dev`.
- Sans WebGL, PixiJS ne démarre pas et `main.ts` affiche un message d'erreur. PixiJS propose un
  moteur de repli Canvas 2D (`preference: ['webgl', 'canvas']`), non activé pour l'instant.
- Si la politique de sécurité (`csp`) de Tauri est activée plus tard, PixiJS exigera
  `'unsafe-eval'` ou l'import de `pixi.js/unsafe-eval`, en plus de l'autorisation du WebSocket.

## Architecture

Le client est découpé en couches qui communiquent **uniquement** par le bus
d'événements. Règle d'or : une couche publie sur le bus et s'abonne à ce qui
l'intéresse, sans jamais appeler une autre couche directement.

| Dossier        | Responsabilité                                                                |
| -------------- | ----------------------------------------------------------------------------- |
| `src/core/`    | `EventBus` — publish/subscribe, aucune logique métier ; catalogue `AppEvents` |
| `src/network/` | Connexion WebSocket réelle ou simulée, derrière `IGameConnection`             |
| `src/state/`   | État local du jeu, alimenté par les événements serveur                        |
| `src/input/`   | Clavier/souris traduits en intentions de jeu                                  |
| `src/render/`  | Rendu PixiJS : lit l'état, dessine, ne le modifie jamais                      |
| `src/ui/`      | Menu, lobby, HUD                                                              |
| `src/mocks/`   | Scénarios de parties rejoués hors ligne                                       |

`src/App.ts` assemble ces couches (voir « Assemblage » plus bas) et `src/main.ts` le démarre.

Le client ne contient **aucune logique de jeu autoritaire** : collisions,
validation des déplacements et calcul des explosions appartiennent au serveur.
Le client affiche ce que le serveur confirme.

Ce découplage est vérifié automatiquement par la règle `no-restricted-imports`
configurée par dossier dans `.eslintrc.json` : `npm run lint` échoue si un
fichier de `render/` importe `network/`, ou si `network/` importe PixiJS. Les
règles de style et de qualité proprement dites relèvent du pôle DevOps &
Qualité, qui complètera ce fichier.

## Bus d'événements

`src/core/EventBus.ts` est le seul canal entre les couches. Il est générique : il
ne connaît ni les noms d'événements ni leur contenu, décrits par une carte
`nom → type de la donnée` que l'application lui fournit. Le compilateur vérifie
ainsi chaque publication et chaque abonnement.

```ts
interface ExampleEvents {
  'input:move': { direction: 'up' | 'down' | 'left' | 'right' };
  'input:bomb': undefined;
}

const bus = new EventBus<ExampleEvents>();

const unsubscribe = bus.on('input:move', ({ direction }) => console.log(direction));
bus.emit('input:move', { direction: 'up' });
bus.emit('input:bomb'); // pas de donnée à fournir
unsubscribe();
```

| Méthode                | Rôle                                                      |
| ---------------------- | --------------------------------------------------------- |
| `on(event, handler)`   | S'abonne ; retourne la fonction qui annule l'abonnement   |
| `once(event, handler)` | S'abonne pour une seule réception                         |
| `off(event, handler)`  | Retire un abonné                                          |
| `emit(event, payload)` | Publie l'événement : synchrone, dans l'ordre d'abonnement |

Points à connaître :

- Une seule instance, créée par `App.ts` (`app.bus`) et transmise aux couches : il n'y a
  pas de bus global, chaque test crée le sien.
- Une couche qui disparaît (changement de scène, par exemple) doit se désabonner,
  sinon elle continue de recevoir les événements.
- Un abonné qui lève une exception n'empêche pas les suivants de recevoir
  l'événement : l'erreur est écrite dans la console. Dans un test, passer au
  constructeur une fonction qui relance l'erreur pour qu'elle ne soit pas avalée :
  `new EventBus<Events>((error) => { throw error; })`.

### Catalogue des événements

Les événements de l'application sont décrits dans `src/core/AppEvents.ts` (`AppEvents`), et le
bus de l'application est un `EventBus<AppEvents>` (alias `AppEventBus`). Le préfixe dit d'où
vient l'information : `connection:` la liaison avec le serveur, `server:` ce que le serveur
annonce, `input:` ce que le joueur demande.

| Événement                 | Donnée                   | Publié par                                        | Écouté par                            |
| ------------------------- | ------------------------ | ------------------------------------------------- | ------------------------------------- |
| `connection:opened`       | —                        | `App`, une fois la connexion ouverte              | `main.ts`, `ui/`                      |
| `connection:closed`       | —                        | `App.stop()`, si la connexion était ouverte       | `ui/`                                 |
| `connection:error`        | `{ error }`              | `App` (ouverture impossible), pont (envoi échoué) | `ui/`                                 |
| `server:PLAYER_JOINED`    | `PlayerJoinedMessage`    | pont connexion ↔ bus, à la réception du message   | `state/`, pont (détection playerId)   |
| `server:LOBBY_STATUS`     | `LobbyStatusMessage`     | pont connexion ↔ bus, à la réception du message   | `main.ts` (affichage salon), `state/` |
| `server:GAME_STARTED`     | `GameStartedMessage`     | pont connexion ↔ bus, à la réception du message   | `main.ts` (lancement de partie)       |
| `server:GAME_STATE`       | `GameStateMessage`       | pont connexion ↔ bus, à la réception du message   | `GameScene` (carte et joueurs)        |
| `server:POSITION_UPDATED` | `PositionUpdatedMessage` | pont connexion ↔ bus, à la réception du message   | `GameScene` (déplacement du sprite)   |
| `server:BOMB_PLACED`      | `BombPlacedMessage`      | pont connexion ↔ bus, à la réception du message   | `GameScene` (affichage bombe posée)   |
| `server:BOMB_EXPLODED`    | `BombExplodedMessage`    | pont connexion ↔ bus, à la réception du message   | `GameScene` (souffle, briques, morts) |
| `input:join`              | `{ playerName }`         | `main.ts` (écran de connexion)                    | pont, qui envoie `JOIN_LOBBY`         |
| `input:move`              | `{ direction }`          | `GameScene` (clavier)                             | pont, qui envoie `MOVE`               |
| `input:bomb`              | —                        | `GameScene` (clavier)                             | pont, qui envoie `PLACE_BOMB`         |
| `input:start`             | —                        | `main.ts` (bouton lancer partie)                  | pont, qui envoie `START_GAME`         |

Points à connaître :

- Les événements `server:*` ne sont pas écrits à la main : il y en a un par message de
  `ServerMessage` (`shared/`), nommé `server:<TYPE>`, avec le message tel quel pour donnée. Un
  message ajouté au protocole a donc aussitôt son événement.
- Une couche reçoit le bus sous le type `AppEventBus` et ne publie que les événements de sa
  ligne dans le tableau. Pour un nouvel événement, l'ajouter au catalogue : le compilateur
  refuse un nom ou une donnée qui n'y figure pas.
- Ce catalogue est une première version, à faire évoluer avec les couches `state/`, `input/`
  et `ui/` quand elles arriveront.

## Types partagés avec le serveur

Le protocole WebSocket est défini une seule fois, dans `../shared/src/protocol/`,
et importé par le client via l'alias `@shared` (voir `tsconfig.json`) :

```ts
import type { ServerMessage } from '@shared/protocol/messages';
```

Toujours écrire `import type { ... }` (et non `import { type ... }`) : l'import
est alors effacé à la compilation et ne dépend pas de `shared/` à l'exécution.
Si un import de **valeur** devient nécessaire (constantes de grille, par
exemple), il faudra déclarer le même alias dans `vite.config.ts`.

Le client est un workspace npm du dépôt, comme `server` et `shared` : ses dépendances
propres sont déclarées dans `client/package.json`, les outils communs (TypeScript, ESLint,
Vitest, Prettier) dans le `package.json` racine, et tout s'installe à la racine, avec un seul
`package-lock.json` (voir « Démarrer »). Il ne déclare pas le paquet `@bomberman-area/shared` :
l'alias `@shared` lit directement `../shared/src`.

## Mode mock (hors ligne)

Le client doit pouvoir tourner et être testé sans serveur. Toutes les couches
parlent à une `IGameConnection` (`src/network/IGameConnection.ts`) sans savoir si
elle est réelle ou simulée ; le choix se fait en un seul point, au démarrage
(`createConnection`, dans `src/App.ts`).

| Méthode              | Rôle                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `connect()`          | Ouvre la connexion (promesse) ; sans effet si elle est déjà ouverte              |
| `send(message)`      | Envoie un message au serveur ; lève une erreur si la connexion n'est pas ouverte |
| `onMessage(handler)` | S'abonne aux messages du serveur ; retourne la fonction qui annule l'abonnement  |
| `disconnect()`       | Ferme la connexion ; les abonnements sont conservés                              |

`MockServerAdapter` est l'implémentation simulée. Il rejoue un **scénario** : une liste
d'étapes `{ delayMs, message }`, où `delayMs` est l'attente après l'étape précédente. Il en
existe deux sortes :

| Sorte          | Le rejeu démarre                          | Exemple        |
| -------------- | ----------------------------------------- | -------------- |
| `Scenario`     | dès la connexion                          | `lobby`        |
| `JoinScenario` | à chaque `JOIN_LOBBY`, pour le nom envoyé | `game-session` |

```ts
const connection: IGameConnection = new MockServerAdapter(gameSessionScenario);
connection.onMessage((message) => console.log(message.type)); // avant connect()
await connection.connect();
connection.send({ type: 'JOIN_LOBBY', playerName: 'Louka' }); // lance le rejeu
```

### Lancer le client hors ligne

```bash
cd client
npm run dev:mock
```

`npm run dev:mock` lance Vite en mode `mock` (`vite --mode mock`), qui lit `.env.mock` :
`VITE_CONNECTION_MODE=mock`. Le client rejoue alors `game-session` : on rejoint le salon sous
son pseudo, trois joueurs fictifs arrivent, la partie démarre quand le salon est plein, puis
les autres joueurs se déplacent et posent des bombes qui cassent des briques ; l'un d'eux est
éliminé par la sienne.

Scénarios fournis (`src/mocks/fixtures/`) :

| Scénario       | Contenu                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `lobby`        | Alice arrive, Bob et Chloé la rejoignent, puis Bob part ; la partie ne démarre pas      |
| `game-session` | Le joueur local rejoint le salon, qui se remplit ; la partie démarre, les autres jouent |

Ils sont construits avec `arrivalSteps` et `joinLobbySteps` (`src/mocks/lobbySteps.ts`, arrivées
dans le salon) et `gameStateMessage` (`src/mocks/mockArena.ts`, état du jeu sur un plateau fixe
de 15 × 13 cases, au format du serveur).

Points à connaître :

- Les scénarios sont écrits en TypeScript, pas en JSON : le protocole partagé les
  type, donc `npm run typecheck` signale ceux à corriger quand le Backend change un
  message.
- Ils suivent les règles du serveur : `tests/integration/mock-session.test.ts` rejoue chaque
  scénario et vérifie le salon, les cases de départ, les déplacements (une case, sur du sol),
  les bombes (posées sous le joueur, explosion 2,5 s plus tard, portée de 2 cases), les briques
  détruites et les joueurs éliminés. Un scénario modifié qui ne les respecte plus échoue à ce
  test. `game-session` doit en plus contenir chaque message du protocole.
- Le mock ne réagit qu'à `JOIN_LOBBY` : il ne répond ni aux déplacements ni aux bombes du
  joueur local (il faudrait refaire les règles du serveur dans le client), et il ignore
  `START_GAME` : la partie démarre quand le salon est plein, comme sur le serveur. En test,
  `sentMessages` donne la liste de ce qui a été envoyé.
- Le plateau du mock est fixe, pour que les scénarios restent valables ; celui du serveur est
  tiré au hasard.
- Les messages sont livrés de façon asynchrone, en copie neuve : un abonné peut la
  modifier sans altérer le scénario. Après `disconnect()`, le rejeu s'arrête ; il reprend du
  début à la connexion suivante, ou au `JOIN_LOBBY` suivant.
- En test, les minuteurs simulés de Vitest (`vi.useFakeTimers()`) évitent d'attendre
  les délais : voir `tests/integration/mock-session.test.ts`.

## Assemblage (`App.ts`)

`src/App.ts` est le seul endroit qui crée le bus et qui choisit la connexion. Il les relie
dans les deux sens, puis ouvre la connexion ; `src/main.ts` se contente de le démarrer.

```ts
const app = new App(); // connexion choisie par la configuration
app.bus.on('server:LOBBY_STATUS', ({ players }) => console.log(players)); // avant start()
await app.start();
// ...
app.stop();
```

| Élément                    | Rôle                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| `app.bus`                  | Le bus de l'application, à transmettre aux couches                           |
| `app.start()`              | Pose le pont connexion ↔ bus, ouvre la connexion, publie `connection:opened` |
| `app.stop()`               | Défait le pont, ferme la connexion, publie `connection:closed`               |
| `createConnection(mode)`   | Le point de choix entre serveur simulé et serveur réel                       |
| `network/connectionBridge` | Le pont : message reçu → `server:<TYPE>` ; `input:*` → message               |

La connexion se règle avec la variable `VITE_CONNECTION_MODE`, lue dans `src/config.ts` au
lancement de Vite (`npm run dev`, `npm run build`) :

| Valeur   | Connexion                                                                     | Utilisée par                          |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| `server` | Par défaut : `WebSocketClient`, vers le serveur réel à l'adresse `SERVER_URL` | `npm run dev`, `npm run build`, Tauri |
| `mock`   | `MockServerAdapter`, qui rejoue le scénario `game-session` (hors ligne)       | `npm run dev:mock` (`.env.mock`)      |

Pour changer de mode sans modifier le dépôt : une variable du shell, ou un fichier
`client/.env.local` (ignoré par Git). Un fichier propre à un mode (`.env.mock`) passe avant
`.env.local` : `npm run dev:mock` reste donc en mock.

Points à connaître :

- `start()` ne rejette jamais sa promesse : si la connexion ne s'ouvre pas,
  `connection:error` est publié et l'application reste arrêtée ; un nouveau `start()` réessaie.
  Après `stop()`, `start()` rouvre la connexion (le mock rejoue son scénario depuis le début).
- Un envoi qui échoue (connexion fermée) est publié sur `connection:error` : la couche qui a
  publié la demande ne reçoit pas d'exception.
- **Provisoire, à trancher avec le Backend** : `MOVE` exige un `playerId`, mais aucun message
  du serveur ne dit au client lequel est le sien. En attendant, le pont retient celui du
  premier `PLAYER_JOINED` reçu après l'envoi de `JOIN_LOBBY`, et n'envoie aucun `MOVE` avant.
  `input:move` et `input:bomb` partent avec cet identifiant (`MOVE`, `PLACE_BOMB`). Avec le
  mock, c'est celui du joueur local (`p1`), que `game-session` accueille aussitôt.
- `IGameConnection` ne signale pas une coupure venue du serveur : `connection:closed` n'est
  publié que par `stop()`. À compléter, dans le contrat et dans `WebSocketClient`.
- Le mode par défaut est `server`, y compris dans l'exécutable produit par `npm run tauri build`.
- Pour tester une couche, lui donner un `EventBus<AppEvents>` neuf ; pour tester l'assemblage,
  passer sa propre connexion : `new App(new MockServerAdapter(lobbyScenario))`. Voir
  `tests/integration/app-wiring.test.ts`.

## État d'avancement

En place : l'outillage, l'`EventBus` et son catalogue d'événements, la connexion simulée
(`MockServerAdapter`), le rendu PixiJS, les écrans (connexion, salle d'attente, partie) et
`App.ts`, qui relie la connexion au bus.

Pas encore relié : les écrans de `main.ts` et `GameScene` n'utilisent ni le bus ni la
connexion. La partie affichée est simulée dans `GameScene`, de façon provisoire ; les
événements du mock circulent sur le bus sans que personne ne les écoute. Les dossiers
`state/`, `input/` et `ui/` sont vides.

Arrivent dans des PR dédiées : l'état du jeu (`state/GameState`), le clavier (`input/`), les
écrans branchés sur le bus (`ui/`), la connexion WebSocket réelle (`WebSocketClient`), puis
`GameScene` réduite au dessin de l'état reçu.
