import Log from '../../utils/log.js';
import type { MmpEventPayloadMap } from '@teammapper/shared';

/**
 * The payload of each event mmp emits: the events `@teammapper/shared`
 * types, plus `mapChange`, which fires after every change of the map data.
 */
export interface MapEventPayloadMap extends MmpEventPayloadMap {
  mapChange: void;
}

export type MapEventType = keyof MapEventPayloadMap;

export type MmpEventCallback<K extends MapEventType> = (
  payload: MapEventPayloadMap[K]
) => void;

type EventCallbacks<K extends MapEventType> = {
  [P in K]?: MmpEventCallback<P>;
};

const EVENT_TYPES: readonly MapEventType[] = [
  'nodeSelect',
  'nodeDeselect',
  'nodeProtected',
  'viewStateChange',
  'mapChange',
  // Mirror compatibility, removed in PR 7: the frontend writes local edits
  // to the Y.Doc from these events.
  'create',
  'nodeUpdate',
  'nodeCreate',
  'nodePaste',
  'nodeRemove',
  'distribute',
];

/**
 * Manage the events of the map. `@teammapper/shared` types each payload, and
 * each event holds at most one callback.
 */
export default class Events {
  private callbacks: EventCallbacks<MapEventType> = {};

  /**
   * Call the callback registered for the event with its payload.
   */
  public emit<K extends MapEventType>(
    event: K,
    payload: MapEventPayloadMap[K]
  ) {
    this.callbacks[event]?.(payload);
  }

  /**
   * Register the callback for the event, replacing an earlier one.
   */
  public on = <K extends MapEventType>(
    event: K,
    callback: MmpEventCallback<K>
  ) => {
    if (!EVENT_TYPES.includes(event)) Log.error('The event does not exist');

    const callbacks: EventCallbacks<K> = this.callbacks;
    callbacks[event] = callback;
  };

  /**
   * Remove every callback.
   */
  public unsubscribeAll = () => {
    this.callbacks = {};
  };
}
