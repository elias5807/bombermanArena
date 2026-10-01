# Bomberman Arena — Client

Application cliente du projet Bomberman Arena, développée par le pôle Frontend.
Le serveur est dans `../server` et n'est pas nécessaire pour lancer le client
(mode mock prévu, voir plus bas).

## Prérequis

- Node.js 22 ou 24 LTS

## Démarrer

```bash
cd client
npm install
npm run dev
```

## Scripts

| Script              | Rôle                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Serveur de développement Vite                     |
| `npm run build`     | Vérification des types puis build de production    |
| `npm run typecheck` | Vérification des types seule                      |
| `npm test`          | Tests unitaires et d'intégration (Vitest)         |
| `npm run lint`      | ESLint                                            |
| `npm run format`    | Prettier                                          |
| `npm run tauri dev`   | Lance l'application desktop (fenêtre Tauri)     |
| `npm run tauri build` | Produit l'exécutable et les installeurs Windows  |

Ces quatre derniers scripts sont ceux attendus par le pipeline CI du pôle
DevOps & Qualité (`.github/workflows/ci-cd-client.yml`).

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

| Fichier                                   | Contenu                  |
| ----------------------------------------- | ------------------------ |
| `bomberman-arena.exe`                     | L'application            |
| `bundle/msi/*.msi`, `bundle/nsis/*.exe`   | Les installeurs          |

Points à connaître :

- Le port de développement est fixé à `5173` (`vite.config.ts`, `strictPort`) :
  Tauri charge cette URL exacte, un autre port donnerait une fenêtre blanche.
- La politique de sécurité (`csp`) est désactivée pour l'instant. Si elle est
  activée plus tard, elle devra autoriser la connexion au serveur
  (`connect-src ws://...`), sinon le WebSocket sera bloqué.
- Les icônes (`src-tauri/icons/`) sont celles générées par défaut : à remplacer.
- Le Cargo.lock est versionné (`src-tauri/Cargo.lock`) : c'est une application,
  pas une bibliothèque, et la CI doit compiler les mêmes versions que nous.

## Architecture

Le client est découpé en couches qui communiquent **uniquement** par le bus
d'événements. Règle d'or : une couche publie sur le bus et s'abonne à ce qui
l'intéresse, sans jamais appeler une autre couche directement.

| Dossier        | Responsabilité                                                  |
| -------------- | --------------------------------------------------------------- |
| `src/core/`    | `EventBus` — publish/subscribe, aucune logique métier            |
| `src/network/` | Connexion WebSocket réelle ou simulée, derrière `IGameConnection` |
| `src/state/`   | État local du jeu, alimenté par les événements serveur           |
| `src/input/`   | Clavier/souris traduits en intentions de jeu                     |
| `src/render/`  | Rendu PixiJS : lit l'état, dessine, ne le modifie jamais         |
| `src/ui/`      | Menu, lobby, HUD                                                 |
| `src/mocks/`   | Scénarios de parties rejoués hors ligne                          |

Le client ne contient **aucune logique de jeu autoritaire** : collisions,
validation des déplacements et calcul des explosions appartiennent au serveur.
Le client affiche ce que le serveur confirme.

Ce découplage est vérifié automatiquement par la règle `no-restricted-imports`
configurée par dossier dans `.eslintrc.json` : `npm run lint` échoue si un
fichier de `render/` importe `network/`, ou si `network/` importe PixiJS. Les
règles de style et de qualité proprement dites relèvent du pôle DevOps &
Qualité, qui complètera ce fichier.

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

Le client ne dépend d'aucun workspace npm : il garde son propre
`package.json` et son propre `package-lock.json`.

## Mode mock (hors ligne)

Le client doit pouvoir tourner et être testé sans serveur. Toutes les couches
parlent à une `IGameConnection` (`src/network/IGameConnection.ts`) sans savoir si
elle est réelle ou simulée ; le choix se fera en un seul point, au démarrage.

| Méthode              | Rôle                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `connect()`          | Ouvre la connexion (promesse) ; sans effet si elle est déjà ouverte              |
| `send(message)`      | Envoie un message au serveur ; lève une erreur si la connexion n'est pas ouverte |
| `onMessage(handler)` | S'abonne aux messages du serveur ; retourne la fonction qui annule l'abonnement  |
| `disconnect()`       | Ferme la connexion ; les abonnements sont conservés                              |

`MockServerAdapter` est l'implémentation simulée. Dès la connexion, il rejoue un
**scénario** : des messages du serveur, chacun avec son délai.

```ts
const connection: IGameConnection = new MockServerAdapter(gameSessionScenario);
connection.onMessage((message) => console.log(message.type)); // avant connect()
await connection.connect();
```

Scénarios fournis (`src/mocks/fixtures/`) :

| Scénario       | Contenu                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `lobby`        | Trois joueurs arrivent, puis l'un d'eux part ; la partie ne démarre pas   |
| `game-session` | Le lobby se remplit à quatre, la partie démarre, les joueurs se déplacent |

Un scénario est une liste d'étapes `{ delayMs, message }`, où `delayMs` est
l'attente après l'étape précédente. `joinLobbySteps` (`src/mocks/lobbySteps.ts`)
produit les messages d'arrivée dans un lobby, tels que le serveur les envoie.

Points à connaître :

- Les scénarios sont écrits en TypeScript, pas en JSON : le protocole partagé les
  type, donc `npm run typecheck` signale ceux à corriger quand le Backend change un
  message.
- Ils ne peuvent contenir que des messages définis dans `shared/` : bombes,
  explosions, murs détruits et fin de partie arriveront avec le protocole. Le champ
  `position`, encore une simple chaîne, reçoit comme sur le serveur la direction du
  déplacement.
- Le mock ne réagit pas à `send` : il rejoue son scénario quoi que le client
  envoie. En test, `sentMessages` donne la liste de ce qui a été envoyé.
- Les messages sont livrés de façon asynchrone, en copie neuve : un abonné peut la
  modifier sans altérer le scénario. Après `disconnect()`, une nouvelle connexion
  rejoue le scénario depuis le début.
- En test, les minuteurs simulés de Vitest (`vi.useFakeTimers()`) évitent d'attendre
  les délais : voir `tests/integration/mock-session.test.ts`.

## État d'avancement

Ce squelette contient l'outillage et la structure. Arrivent dans des PR
dédiées : l'`EventBus`, la couche
réseau avec son `MockServerAdapter`, le rendu PixiJS, puis l'assemblage des
couches dans `App.ts`.
