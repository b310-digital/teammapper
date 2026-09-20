import { dispatch, Dispatch } from 'd3';
import Utils from '../../utils/utils';
import Log from '../../utils/log';

export type MmpEventCallback = (...args: unknown[]) => void;

/**
 * Manage the events of the map.
 */
export default class Events {
  private dispatcher: Dispatch<object>;

  /**
   * Initialize the events.
   */
  constructor() {
    const events = Utils.fromObjectToArray(Event);

    this.dispatcher = dispatch(...events);
  }

  /**
   * Call all registered callbacks for specified map event.
   * @param {Event} event
   * @param {object} that
   * @param parameters
   */
  public call(event: Event, that?: object, ...parameters: unknown[]) {
    return this.dispatcher.call(event, that, ...parameters);
  }

  /**
   * Add a callback for specific map event.
   * @param {string} event
   * @param {Function} callback
   */
  public on = (event: string, callback: MmpEventCallback) => {
    if (typeof event !== 'string') {
      Log.error('The event must be a string', 'type');
    }

    const eventName = Event[event as keyof typeof Event];

    if (!eventName) {
      Log.error('The event does not exist');
    }

    this.dispatcher.on(eventName, callback);
  };

  /**
   * Removes / resets all callbacks
   */
  public unsubscribeAll = () => {
    Object.values(Event).forEach((event: string) => {
      this.dispatcher.on(event, null);
    });
  };
}

export enum Event {
  create = 'mmp-create',
  center = 'mmp-center',
  undo = 'mmp-undo',
  redo = 'mmp-redo',
  exportJSON = 'mmp-export-json',
  exportImage = 'mmp-export-image',
  zoomIn = 'mmp-zoom-in',
  zoomOut = 'mmp-zoom-out',
  nodeSelect = 'mmp-node-select',
  nodeDeselect = 'mmp-node-deselect',
  nodeUpdate = 'mmp-node-update',
  nodeCreate = 'mmp-node-create',
  nodePaste = 'mmp-node-paste',
  nodeRemove = 'mmp-node-remove',
  distribute = 'mmp-distribute',
}
