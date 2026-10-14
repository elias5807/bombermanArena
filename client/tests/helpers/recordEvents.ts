import type { AppEventBus, AppEvents } from '../../src/core/AppEvents';

/** Un événement publié sur le bus : son nom et sa donnée. */
export type RecordedEvent = [name: keyof AppEvents, payload: unknown];

/** Les événements du catalogue, écrits en toutes lettres : un nom qui change fait échouer les tests. */
const EVENT_NAMES = [
  'connection:opened',
  'connection:closed',
  'connection:error',
  'server:PLAYER_JOINED',
  'server:LOBBY_STATUS',
  'server:GAME_STARTED',
  'server:POSITION_UPDATED',
  'server:GAME_STATE',
  'server:BOMB_PLACED',
  'server:BOMB_EXPLODED',
  'input:join',
  'input:move',
  'input:bomb',
  'input:start',
] as const satisfies readonly (keyof AppEvents)[];

/**
 * S'abonne à tous les événements du catalogue.
 *
 * @returns la liste, tenue à jour, de ce qui est publié sur `bus`, dans l'ordre.
 */
export function recordEvents(bus: AppEventBus): RecordedEvent[] {
  const events: RecordedEvent[] = [];
  for (const name of EVENT_NAMES) {
    bus.on(name, (payload) => {
      events.push([name, payload]);
    });
  }
  return events;
}
