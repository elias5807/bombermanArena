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

| Script                | Rôle                                            |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Serveur de développement Vite                   |
| `npm run build`       | Vérification des types puis build de production |
| `npm run typecheck`   | Vérification des types seule                    |
| `npm test`            | Tests unitaires et d'intégration (Vitest)       |
| `npm run lint`        | ESLint                                          |
| `npm run format`      | Prettier                                        |
| `npm run tauri dev`   | Lance l'application desktop (fenêtre Tauri)     |
| `npm run tauri build` | Produit l'exécutable et les installeurs Windows |

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
Au lancement (`npm run dev` ou `npm run tauri dev`), le client affiche une grille de jeu vide.

| Fichier               | Rôle                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PixiRenderer.ts`     | Moteur : possède l'application PixiJS, affiche une scène à la fois et la prévient des changements de taille |
| `scenes/Scene.ts`     | Interface d'un écran (`view`, `resize`, `destroy`) : le moteur ne connaît que celle-ci                      |
| `scenes/GameScene.ts` | Scène de la partie : dessine la grille                                                                      |
| `GridLayout.ts`       | Géométrie de la grille, cases et pixels. Sans PixiJS, donc testable sans navigateur                         |

```ts
const renderer = await PixiRenderer.create(document.querySelector('#app'));
renderer.setScene(new GameScene({ columns: 13, rows: 11 }));
```

Points à connaître :

- La grille tient dans la fenêtre avec une marge, en cases de taille entière, centrée, et
  elle est redessinée à chaque redimensionnement. `GridLayout` donne la position d'une case
  (`cellOrigin`) et la case sous un point (`cellAt`) : les sprites s'en serviront pour se placer.
- Repère : une case est repérée par sa colonne et sa ligne à partir de 0, en haut à gauche ;
  les colonnes vont vers la droite, les lignes vers le bas. Les dimensions de la grille
  (13 × 11, dans `main.ts`) et ce repère sont **provisoires** : le serveur ne les envoie pas
  encore, ils sont à valider avec le Backend.
- Le moteur ne connaît ni le réseau ni l'état du jeu (règle ESLint de `render/`) : les scènes
  dessinent ce qu'on leur donne. La lecture de l'état viendra avec `GameState`.
- `GridLayout` et `GameScene` se testent sans navigateur : les objets PixiJS fonctionnent sans
  WebGL tant qu'on ne les affiche pas. `PixiRenderer` se teste avec une fausse application
  PixiJS. Le rendu lui-même (couleurs, netteté) se contrôle à l'œil avec `npm run dev`.
- Sans WebGL, PixiJS ne démarre pas et `main.ts` affiche un message d'erreur. PixiJS propose un
  moteur de repli Canvas 2D (`preference: ['webgl', 'canvas']`), non activé pour l'instant.
- Si la politique de sécurité (`csp`) de Tauri est activée plus tard, PixiJS exigera
  `'unsafe-eval'` ou l'import de `pixi.js/unsafe-eval`, en plus de l'autorisation du WebSocket.
- Vite n'utilise pas PostCSS (`css.postcss` dans `vite.config.ts`) : sinon il cherche sa
  configuration jusqu'à la racine du dépôt, dont le `package.json` est vide, et le build échoue
  dès qu'il y a du CSS.

## Architecture

Le client est découpé en couches qui communiquent **uniquement** par le bus
d'événements. Règle d'or : une couche publie sur le bus et s'abonne à ce qui
l'intéresse, sans jamais appeler une autre couche directement.

| Dossier        | Responsabilité                                                    |
| -------------- | ----------------------------------------------------------------- |
| `src/core/`    | `EventBus` — publish/subscribe, aucune logique métier             |
| `src/network/` | Connexion WebSocket réelle ou simulée, derrière `IGameConnection` |
| `src/state/`   | État local du jeu, alimenté par les événements serveur            |
| `src/input/`   | Clavier/souris traduits en intentions de jeu                      |
| `src/render/`  | Rendu PixiJS : lit l'état, dessine, ne le modifie jamais          |
| `src/ui/`      | Menu, lobby, HUD                                                  |
| `src/mocks/`   | Scénarios de parties rejoués hors ligne                           |

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

## État d'avancement

Ce squelette contient l'outillage et la structure. Arrivent dans des PR
dédiées : l'`EventBus`, la couche
réseau avec son `MockServerAdapter`, le rendu PixiJS, puis l'assemblage des
couches dans `App.ts`.
