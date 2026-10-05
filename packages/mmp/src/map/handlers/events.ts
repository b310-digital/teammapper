import Log from '../../utils/log.js';
import type { MmpEventPayloadMap, MmpEventType } from '@teammapper/shared';

export type MmpEventCallback<K extends MmpEventType> = (
  payload: MmpEventPayloadMap[K]
) => void;

type EventCallbacks<K extends MmpEventType> = {
  [P in K]?: Set<MmpEventCallback<P>>;
};

const EVENT_TYPES: readonly MmpEventType[] = [
  'nodeSelect',
  'nodeDeselect',
  'nodeProtected',
  'mapChange',
];

/**
 * Manage the events of the map. `@teammapper/shared` types each payload, and
 * each event holds any number of callbacks.
 */
export default class Events {
  private callbacks: EventCallbacks<MmpEventType> = {};

  /**
   * Call every callback registered for the event with its payload. The loop
   * runs over a copy, so a callback may remove itself without skipping the next.
   */
  public emit<K extends MmpEventType>(
    event: K,
    payload: MmpEventPayloadMap[K]
  ) {
    const callbacks = this.callbacks[event];
    if (callbacks) [...callbacks].forEach(callback => callback(payload));
  }

  /**
   * Add the callback to the event and return a function that removes it again.
   */
  public on = <K extends MmpEventType>(
    event: K,
    callback: MmpEventCallback<K>
  ): (() => void) => {
    if (!EVENT_TYPES.includes(event)) Log.error('The event does not exist');

    const callbacks: EventCallbacks<K> = this.callbacks;
    const set = callbacks[event] ?? new Set<MmpEventCallback<K>>();
    callbacks[event] = set;
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  };

  /**
   * Remove every callback.
   */
  public unsubscribeAll = () => {
    this.callbacks = {};
  };
}
