/**
 * Point d'entrée de l'application.
 *
 * Se limite pour l'instant à vérifier que la chaîne de build fonctionne.
 * L'assemblage des couches (App.ts, injection Mock vs WebSocket) arrive
 * dans une PR dédiée.
 */
const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.textContent = 'Bomberman Arena — client';
}
