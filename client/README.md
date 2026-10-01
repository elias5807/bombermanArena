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

| Script                 | Rôle                                               |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Serveur de développement Vite                      |
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
