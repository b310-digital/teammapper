import Log from '../../utils/log.js';
import type {
  ArrowRefusal,
  ExportNodeProperties,
  MapArrow,
} from '@teammapper/shared';

/** The payload each map event passes to its callbacks. */
export interface MmpEventPayloadMap {
  nodeSelect: ExportNodeProperties;
  nodeDeselect: ExportNodeProperties;
  nodeProtected: ExportNodeProperties;
  /** The map data changed, by a local, a peer's or an undo write. */
  mapChange: void;
  /** An arrow took the selection. */
  arrowSelect: MapArrow;
  /** The selected arrow lost the selection. */
  arrowDeselect: MapArrow;
  /** Arrow mode started (true) or ended (false). */
  arrowMode: boolean;
  /** Arrow mode refused a target node, and why. */
  arrowRefused: ArrowRefusal;
}

export type MmpEventType = keyof MmpEventPayloadMap;

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
  'arrowSelect',
  'arrowDeselect',
  'arrowMode',
  'arrowRefused',
];

/**
 * Manage the events of the map. `MmpEventPayloadMap` types each payload, and
 * each event holds any number of callbacks.
 */
export default class Events {
  private callbacks: EventCallbacks<MmpEventType> = {};

  /**
   * Call every callback registered for the event with its payload. The loop
   * runs over a copy, so a callback may remove itself without skipping the next.
   * A callback that throws stops neither the others nor the caller: a timer
   * rethrows its error after the loop.
   */
  public emit<K extends MmpEventType>(
    event: K,
    payload: MmpEventPayloadMap[K]
  ) {
    const callbacks = this.callbacks[event];
    if (!callbacks) return;

    for (const callback of [...callbacks]) {
      try {
        callback(payload);
      } catch (error) {
        setTimeout(() => {
          throw error;
        });
      }
    }
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
