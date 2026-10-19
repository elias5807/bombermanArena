import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { gameSessionScenario } from '../../src/mocks/fixtures/game-session.fixture';
import { lobbyScenario } from '../../src/mocks/fixtures/lobby.fixture';
import { MockServerAdapter, type ScenarioStep } from '../../src/network/MockServerAdapter';
import { recordEvents, type RecordedEvent } from '../helpers/recordEvents';

/** Les événements que `steps` doivent produire sur le bus, un par message et dans l'ordre. */
function serverEventsOf(steps: readonly ScenarioStep[]): RecordedEvent[] {
  return steps.map(({ message }) => [`server:${message.type}`, message]);
}

/** Recharge le client avec la variable `VITE_CONNECTION_MODE` donnée, comme à son démarrage. */
async function loadClientWithMode(mode: string) {
  vi.stubEnv('VITE_CONNECTION_MODE', mode);
  vi.resetModules();
  const { App: ConfiguredApp } = await import('../../src/App');
  return { ConfiguredApp };
}

describe('application assemblée : serveur simulé → bus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('scénario « lobby » : chaque message arrive sur le bus, dans l’ordre, après connection:opened', async () => {
    const app = new App(new MockServerAdapter(lobbyScenario));
    const events = recordEvents(app.bus);

    await app.start();
    await vi.runAllTimersAsync();

    expect(events).toEqual([
      ['connection:opened', undefined],
      ...serverEventsOf(lobbyScenario.steps),
    ]);
  });

  describe('partie hors ligne (scénario « game-session »)', () => {
    it('rien n’arrive tant que le joueur n’a pas rejoint le salon', async () => {
      const app = new App(new MockServerAdapter(gameSessionScenario));
      const events = recordEvents(app.bus);

      await app.start();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(events).toEqual([['connection:opened', undefined]]);
    });

    it('une fois le joueur dans le salon, chaque message arrive sur le bus, dans l’ordre', async () => {
      const app = new App(new MockServerAdapter(gameSessionScenario));
      await app.start();
      const events = recordEvents(app.bus);

      app.bus.emit('input:join', { playerName: 'Louka' });
      await vi.runAllTimersAsync();

      expect(events).toEqual([
        ['input:join', { playerName: 'Louka' }],
        ...serverEventsOf(gameSessionScenario.stepsFor('Louka')),
      ]);
    });

    it('le salon se remplit, puis la partie démarre avec l’état complet du jeu', async () => {
      const app = new App(new MockServerAdapter(gameSessionScenario));
      const lobbySizes: number[] = [];
      const statePlayers: (string | undefined)[][] = [];
      app.bus.on('server:LOBBY_STATUS', ({ players }) => lobbySizes.push(players.length));
      app.bus.on('server:GAME_STATE', ({ players }) =>
        statePlayers.push(players.map(({ name }) => name)),
      );
      await app.start();

      app.bus.emit('input:join', { playerName: 'Louka' });
      await vi.runAllTimersAsync();

      expect(lobbySizes).toEqual([1, 2, 3, 4]);
      // L'état reçu à l'arrivée, puis celui du lancement de la partie.
      expect(statePlayers).toEqual([['Louka'], ['Louka', 'Bob', 'Chloé', 'David']]);
    });

    it('le joueur local est reconnu : ses demandes partent avec son identifiant', async () => {
      const connection = new MockServerAdapter(gameSessionScenario);
      const app = new App(connection);
      await app.start();

      app.bus.emit('input:join', { playerName: 'Louka' });
      // Le serveur simulé annonce aussitôt l'arrivée du joueur local : p1.
      await vi.advanceTimersByTimeAsync(10);
      app.bus.emit('input:move', { direction: 'right' });
      app.bus.emit('input:bomb');
      app.bus.emit('input:start');

      expect(connection.sentMessages).toEqual([
        { type: 'JOIN_LOBBY', playerName: 'Louka' },
        { type: 'MOVE', playerId: 'p1', direction: 'right' },
        { type: 'PLACE_BOMB', playerId: 'p1' },
        { type: 'START_GAME' },
      ]);
    });

    it('stop() en cours de scénario : la suite n’arrive jamais sur le bus', async () => {
      const app = new App(new MockServerAdapter(gameSessionScenario));
      await app.start();
      const events = recordEvents(app.bus);
      app.bus.emit('input:join', { playerName: 'Louka' });
      // Le joueur local est accueilli (3 messages), puis Bob arrive (2 messages).
      await vi.advanceTimersByTimeAsync(1500);

      app.stop();
      await vi.runAllTimersAsync();

      expect(events).toEqual([
        ['input:join', { playerName: 'Louka' }],
        ...serverEventsOf(gameSessionScenario.stepsFor('Louka')).slice(0, 5),
        ['connection:closed', undefined],
      ]);
    });
  });

  describe('choix de la connexion', () => {
    it('en mode mock, le client rejoue une partie hors ligne quand le joueur rejoint le salon', async () => {
      const { ConfiguredApp } = await loadClientWithMode('mock');
      const app = new ConfiguredApp();
      const startedWith: string[][] = [];
      app.bus.on('server:GAME_STARTED', ({ players }) => startedWith.push(players));
      await app.start();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(startedWith).toEqual([]);

      app.bus.emit('input:join', { playerName: 'Louka' });
      await vi.runAllTimersAsync();

      expect(startedWith).toEqual([['p1', 'p2', 'p3', 'p4']]);
    });
  });

  it('redémarrée, l’application rejoue le scénario depuis le début', async () => {
    const app = new App(new MockServerAdapter(lobbyScenario));
    await app.start();
    await vi.advanceTimersByTimeAsync(2500);
    app.stop();
    const events = recordEvents(app.bus);

    await app.start();
    await vi.runAllTimersAsync();

    expect(events).toEqual([
      ['connection:opened', undefined],
      ...serverEventsOf(lobbyScenario.steps),
    ]);
  });
});
