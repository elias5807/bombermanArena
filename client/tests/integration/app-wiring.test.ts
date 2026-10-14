import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { gameSessionScenario } from '../../src/mocks/fixtures/game-session.fixture';
import { lobbyScenario } from '../../src/mocks/fixtures/lobby.fixture';
import { MockServerAdapter, type Scenario } from '../../src/network/MockServerAdapter';
import { recordEvents, type RecordedEvent } from '../helpers/recordEvents';

/** Les événements que `scenario` doit produire sur le bus, un par message et dans l'ordre. */
function serverEventsOf(scenario: Scenario): RecordedEvent[] {
  return scenario.steps.map(({ message }) => [`server:${message.type}`, message]);
}

/** Charge `App` avec la variable `VITE_CONNECTION_MODE` donnée, comme au démarrage du client. */
async function loadAppWithMode(mode: string) {
  vi.stubEnv('VITE_CONNECTION_MODE', mode);
  vi.resetModules();
  return (await import('../../src/App')).App;
}

describe('application assemblée : serveur simulé → bus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe.each([lobbyScenario, gameSessionScenario])('scénario « $name »', (scenario) => {
    it('chaque message du serveur arrive sur le bus, dans l’ordre, après connection:opened', async () => {
      const app = new App(new MockServerAdapter(scenario));
      const events = recordEvents(app.bus);

      await app.start();
      await vi.runAllTimersAsync();

      expect(events).toEqual([['connection:opened', undefined], ...serverEventsOf(scenario)]);
    });
  });

  it('sans réglage, le client rejoue une partie simulée : le lobby se remplit puis la partie démarre', async () => {
    const DefaultApp = await loadAppWithMode('');
    const app = new DefaultApp();
    const lobbySizes: number[] = [];
    const startedWith: string[][] = [];
    app.bus.on('server:LOBBY_STATUS', ({ players }) => lobbySizes.push(players.length));
    app.bus.on('server:GAME_STARTED', ({ players }) => startedWith.push(players));

    await app.start();
    await vi.runAllTimersAsync();

    expect(lobbySizes).toEqual([1, 2, 3, 4]);
    expect(startedWith).toEqual([['p1', 'p2', 'p3', 'p4']]);
  });

  it('réglé sur le serveur réel, le client initialise la connexion WebSocket', async () => {
    const ServerApp = await loadAppWithMode('server');
    const app = new ServerApp();

    expect(app).toBeInstanceOf(ServerApp);
  });

  it('les demandes du joueur publiées sur le bus arrivent au serveur simulé', async () => {
    const connection = new MockServerAdapter(gameSessionScenario);
    const app = new App(connection);
    await app.start();

    app.bus.emit('input:join', { playerName: 'Louka' });
    // Le scénario annonce l'arrivée d'Alice (p1) : c'est l'identifiant retenu pour MOVE.
    await vi.advanceTimersByTimeAsync(1000);
    app.bus.emit('input:move', { direction: 'left' });

    expect(connection.sentMessages).toEqual([
      { type: 'JOIN_LOBBY', playerName: 'Louka' },
      { type: 'MOVE', playerId: 'p1', direction: 'left' },
    ]);
  });

  it('stop() en cours de scénario : la suite n’arrive jamais sur le bus', async () => {
    const app = new App(new MockServerAdapter(gameSessionScenario));
    const events = recordEvents(app.bus);
    await app.start();
    // Deux joueurs sont arrivés : PLAYER_JOINED et LOBBY_STATUS pour chacun.
    await vi.advanceTimersByTimeAsync(2500);

    app.stop();
    await vi.runAllTimersAsync();

    expect(events).toEqual([
      ['connection:opened', undefined],
      ...serverEventsOf(gameSessionScenario).slice(0, 4),
      ['connection:closed', undefined],
    ]);
  });

  it('redémarrée, l’application rejoue le scénario depuis le début', async () => {
    const app = new App(new MockServerAdapter(lobbyScenario));
    await app.start();
    await vi.advanceTimersByTimeAsync(2500);
    app.stop();
    const events = recordEvents(app.bus);

    await app.start();
    await vi.runAllTimersAsync();

    expect(events).toEqual([['connection:opened', undefined], ...serverEventsOf(lobbyScenario)]);
  });
});
