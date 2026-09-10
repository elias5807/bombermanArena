import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3000;

const wss = new WebSocketServer({ port: PORT });

console.log(`Serveur démarré, en écoute sur le port ${PORT}`);

wss.on('connection', (socket: WebSocket) => {
  console.log('Un joueur vient de se connecter');

  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Message reçu :', message);

      // Exemple minimal, on reconnaît le message MOVE défini dans le protocole
      if (message.type === 'MOVE') {
        const response = {
          type: 'POSITION_UPDATED',
          playerId: message.playerId,
          position: message.direction, // à remplacer par le vrai calcul de position plus tard
        };
        socket.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error('Message invalide reçu :', data.toString());
    }
  });

  socket.on('close', () => {
    console.log('Un joueur s\'est déconnecté');
  });
});