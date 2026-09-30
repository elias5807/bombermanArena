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
