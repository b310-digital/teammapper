import Log from '../../utils/log.js';
import type { MmpEventPayloadMap, MmpEventType } from '@teammapper/shared';

export type MmpEventCallback<K extends MmpEventType> = (
  payload: MmpEventPayloadMap[K]
) => void;

type EventCallbacks<K extends MmpEventType> = {
  [P in K]?: MmpEventCallback<P>;
};

const EVENT_TYPES: readonly MmpEventType[] = [
  'create',
  'nodeSelect',
  'nodeDeselect',
  'nodeUpdate',
  'nodeCreate',
  'nodePaste',
  'nodeRemove',
  'distribute',
  'nodeProtected',
];

/**
 * Manage the events of the map. `@teammapper/shared` types each payload, and
 * each event holds at most one callback.
 */
export default class Events {
  private callbacks: EventCallbacks<MmpEventType> = {};

  /**
   * Call the callback registered for the event with its payload.
   */
  public emit<K extends MmpEventType>(
    event: K,
    payload: MmpEventPayloadMap[K]
  ) {
    this.callbacks[event]?.(payload);
  }

  /**
   * Register the callback for the event, replacing an earlier one.
   */
  public on = <K extends MmpEventType>(
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
