/**
 * URL par défaut du serveur WebSocket (serveur lancé en local sur le port 3000).
 */
export const DEFAULT_SERVER_URL = 'ws://localhost:3000';

/**
 * URL du serveur WebSocket auquel le client se connecte.
 *
 * Surchargeable au build via la variable `VITE_SERVER_URL`
 * (ex. `VITE_SERVER_URL=ws://serveur:3000 npm run build`). Vite l'injecte à la
 * compilation : elle n'est pas modifiable une fois le client construit.
 */
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;

/** Connexions possibles : serveur simulé (`mock`, hors ligne) ou serveur réel (`server`). */
export type ConnectionMode = 'mock' | 'server';

/**
 * Connexion par défaut : le serveur réel, en développement comme dans l'exécutable.
 * Le serveur simulé se demande explicitement (`npm run dev:mock`).
 */
export const DEFAULT_CONNECTION_MODE: ConnectionMode = 'server';

function readConnectionMode(value: string | undefined): ConnectionMode {
  if (!value) {
    return DEFAULT_CONNECTION_MODE;
  }
  if (value === 'mock' || value === 'server') {
    return value;
  }
  console.warn(
    `[config] VITE_CONNECTION_MODE="${value}" n'est ni "mock" ni "server" : ` +
      `mode "${DEFAULT_CONNECTION_MODE}" utilisé.`,
  );
  return DEFAULT_CONNECTION_MODE;
}

/**
 * Connexion que l'application ouvre au démarrage. Seul `App.ts` la lit : le
 * reste du client ne sait pas si le serveur est réel ou simulé.
 *
 * Surchargeable via la variable `VITE_CONNECTION_MODE`, dans les mêmes
 * conditions que `SERVER_URL`. `npm run dev:mock` la règle sur `mock` (fichier
 * `.env.mock`, lu par `vite --mode mock`).
 */
export const CONNECTION_MODE: ConnectionMode = readConnectionMode(
  import.meta.env.VITE_CONNECTION_MODE,
);
