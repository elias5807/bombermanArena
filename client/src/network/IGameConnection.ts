import type { ClientMessage, ServerMessage } from '@shared/protocol/messages';

/** Fonction appelée pour chaque message reçu du serveur. */
export type MessageHandler = (message: ServerMessage) => void;

/** Fonction appelée quand la connexion se coupe sans que le client l'ait demandé. */
export type CloseHandler = () => void;

/**
 * Connexion au serveur de jeu, telle que le reste du client la voit.
 *
 * Deux implémentations se cachent derrière cette interface : la connexion
 * WebSocket réelle et le serveur simulé `MockServerAdapter`. Les autres couches
 * ne doivent jamais savoir laquelle est utilisée : le choix se fait en un seul
 * point, au démarrage de l'application.
 *
 * Les messages sont ceux du protocole partagé avec le serveur
 * (`shared/src/protocol/messages.ts`). Le contrat décrit ici vaut pour toutes
 * les implémentations.
 */
export interface IGameConnection {
  /**
   * Ouvre la connexion. La promesse se résout quand on peut envoyer et recevoir,
   * et elle est rejetée si le serveur est injoignable.
   *
   * Sans effet si la connexion est déjà ouverte. Après `disconnect()`, on peut
   * l'ouvrir à nouveau.
   */
  connect(): Promise<void>;

  /**
   * Envoie un message au serveur. L'appel ne renvoie aucune réponse : la réaction
   * du serveur, s'il y en a une, arrive par `onMessage`.
   *
   * @throws Error si la connexion n'est pas ouverte.
   */
  send(message: ClientMessage): void;

  /**
   * Abonne `handler` aux messages du serveur, dans l'ordre où ils arrivent.
   *
   * - S'abonner avant `connect()` : un message reçu sans abonné est perdu.
   * - Les messages sont toujours livrés de façon asynchrone, jamais pendant un
   *   appel à `connect()` ou à `send()`.
   * - Un abonné qui lève une exception n'empêche ni les autres abonnés ni les
   *   messages suivants d'être servis.
   * - Les abonnements survivent à `disconnect()` : ils n'ont pas à être refaits
   *   pour une nouvelle connexion.
   * - Un abonné retiré pendant une livraison ne reçoit plus rien, pas même le
   *   message en cours.
   * - Abonner deux fois la même fonction n'a pas d'effet supplémentaire.
   *
   * @returns la fonction qui annule cet abonnement.
   */
  onMessage(handler: MessageHandler): () => void;

  /**
   * Abonne `handler` aux coupures qui ne viennent pas du client : serveur arrêté,
   * réseau perdu...
   *
   * - Appelé seulement pour une connexion ouverte (`connect()` résolu) : un échec
   *   d'ouverture est signalé par le rejet de `connect()`.
   * - Jamais après `disconnect()`, même si la fermeture s'achève plus tard.
   * - Une fois au plus par connexion. La connexion est alors fermée : `send()` lève
   *   une erreur, et `connect()` en ouvre une nouvelle.
   * - Toujours de façon asynchrone, après les messages reçus avant la coupure.
   * - Les abonnements suivent les mêmes règles que ceux de `onMessage`.
   *
   * @returns la fonction qui annule cet abonnement.
   */
  onClose(handler: CloseHandler): () => void;

  /**
   * Ferme la connexion. Sans effet si elle est déjà fermée. Les messages qui
   * n'étaient pas encore arrivés ne sont jamais livrés.
   */
  disconnect(): void;
}
