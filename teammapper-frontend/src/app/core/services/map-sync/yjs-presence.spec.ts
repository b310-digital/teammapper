import { BehaviorSubject } from 'rxjs';
import {
  AwarenessUser,
  ExportNodeProperties,
  UserSettings,
} from '@teammapper/shared';
import { MmpService } from '../mmp/mmp.service';
import { MapSyncContext } from './map-sync-context';
import { PRESENCE_THROTTLE_MS, YjsSyncService } from './yjs-sync.service';
import {
  capturingMmpService,
  createMockContext,
  createMockSettingsService,
  createYjsSyncService,
  MmpHandlers,
  userSettingsNamed,
} from '../../../../test/mocks/yjs-sync.mock';

/**
 * Presence carries each client's selected node and display name. A client
 * with nothing selected broadcasts an empty selection, and peers draw no ring
 * for it. A client without a display name broadcasts the empty string.
 */

/**
 * Replaces y-websocket's WebsocketProvider. Each test writes peer awareness
 * states into `states`. A local write stores the state in `states` under the
 * doc's client id, as in y-protocols.
 */
class FakeWebsocketProvider {
  public static latest: FakeWebsocketProvider | null = null;

  public readonly states = new Map<number, { user: AwarenessUser }>();
  public readonly awareness = {
    getStates: () => this.states,
    setLocalStateField: jest.fn((_field: string, user: AwarenessUser) => {
      this.states.set(this.localClientId, { user });
    }),
    on: jest.fn(),
    off: jest.fn(),
  };

  public readonly on = jest.fn();
  public readonly disconnect = jest.fn();
  public readonly destroy = jest.fn();

  constructor(public readonly localClientId: number) {
    FakeWebsocketProvider.latest = this;
  }
}

jest.mock('y-websocket', () => ({
  WebsocketProvider: jest
    .fn()
    .mockImplementation(
      (_url: string, _room: string, doc: { clientID: number }) =>
        new FakeWebsocketProvider(doc.clientID)
    ),
}));

interface PresenceInternals {
  createListeners: () => void;
  setupAwareness: () => void;
  updateFromAwareness: () => void;
}

const PEER_ID = 7;

describe('YjsSyncService presence', () => {
  let handlers: MmpHandlers;
  let context: MapSyncContext;
  let mmpService: jest.Mocked<MmpService>;
  let userSettings$: BehaviorSubject<UserSettings | null>;
  let service: YjsSyncService;

  function provider(): FakeWebsocketProvider {
    if (!FakeWebsocketProvider.latest) throw new Error('No provider created');
    return FakeWebsocketProvider.latest;
  }

  function lastBroadcast(): unknown {
    return provider().awareness.setLocalStateField.mock.lastCall;
  }

  function internals(): PresenceInternals {
    return service as unknown as PresenceInternals;
  }

  /** Lets the presence throttle send the update it holds back. */
  function afterThrottle(): void {
    jest.advanceTimersByTime(PRESENCE_THROTTLE_MS);
  }

  function rename(displayName: unknown): void {
    userSettings$.next(userSettingsNamed(displayName));
  }

  /** The client list mapping the service handed to the context last. */
  function lastMapping(): unknown {
    return (context.setColorMapping as jest.Mock).mock.lastCall?.[0];
  }

  beforeEach(() => {
    jest.useFakeTimers();
    handlers = {};
    context = createMockContext();
    mmpService = capturingMmpService(handlers);
    userSettings$ = new BehaviorSubject<UserSettings | null>(
      userSettingsNamed('')
    );
    service = createYjsSyncService(
      mmpService,
      context,
      createMockSettingsService(userSettings$)
    );
    service.initMap('test-uuid');
    // attachMap subscribes once the map exists; these tests set awareness up
    // on their own.
    internals().createListeners();
  });

  afterEach(() => {
    service.destroy();
    jest.useRealTimers();
  });

  describe('before awareness setup', () => {
    it('broadcasts nothing on a select and attaches the node', () => {
      handlers['nodeSelect']({ id: 'root' } as ExportNodeProperties);

      expect(provider().awareness.setLocalStateField).not.toHaveBeenCalled();
      expect(context.setAttachedNode).toHaveBeenLastCalledWith({ id: 'root' });
    });

    it('broadcasts nothing on a rename', () => {
      rename('Vorname');

      expect(provider().awareness.setLocalStateField).not.toHaveBeenCalled();
    });

    it('keeps the client colour and publishes the selection on setup', () => {
      handlers['nodeSelect']({ id: 'root' } as ExportNodeProperties);

      internals().setupAwareness();

      expect(context.setClientColor).toHaveBeenLastCalledWith('#ff0000');
      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: 'root', displayName: '' },
      ]);
    });
  });

  describe('attachMap', () => {
    it('publishes the node the map selected when it was created', () => {
      mmpService.selectNode.mockReturnValue({
        id: 'main-root',
      } as ExportNodeProperties);

      service.attachMap();

      expect(context.setAttachedNode).toHaveBeenLastCalledWith({
        id: 'main-root',
      });
      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: 'main-root', displayName: '' },
      ]);
    });

    it('announces the normalized display name on connect', () => {
      rename('  Vorname   Test ');

      service.attachMap();

      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: null, displayName: 'Vorname Test' },
      ]);
    });

    it('announces no display name while no settings are cached', () => {
      userSettings$.next(null);

      service.attachMap();

      expect(lastBroadcast()).toEqual([
        'user',
        expect.objectContaining({ displayName: '' }),
      ]);
    });

    it('draws the ring of a peer that selected a node before the map existed', () => {
      provider().states.set(PEER_ID, {
        user: {
          color: '#0000ff',
          selectedNodeId: 'peer-node',
          displayName: '',
        },
      });

      service.attachMap();

      expect(mmpService.highlightNode).toHaveBeenCalledWith('peer-node', '');
    });
  });

  describe('after awareness setup', () => {
    beforeEach(() => {
      internals().setupAwareness();
    });

    it('broadcasts the id of a selected node', () => {
      handlers['nodeSelect']({ id: 'branch' } as ExportNodeProperties);

      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: 'branch', displayName: '' },
      ]);
    });

    it('broadcasts an empty selection on deselect', () => {
      handlers['nodeSelect']({ id: 'branch' } as ExportNodeProperties);

      handlers['nodeDeselect']({ id: 'branch' } as ExportNodeProperties);
      afterThrottle();

      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: null, displayName: '' },
      ]);
    });

    it('sends a burst of selections as two updates ending on the last one', () => {
      for (const id of ['a', 'b', 'c', 'd'])
        handlers['nodeSelect']({ id } as ExportNodeProperties);
      afterThrottle();

      // setupAwareness sent the first update, before the burst.
      expect(provider().awareness.setLocalStateField).toHaveBeenCalledTimes(3);
      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: 'd', displayName: '' },
      ]);
    });

    it('attaches no node on deselect', () => {
      handlers['nodeDeselect']({ id: 'branch' } as ExportNodeProperties);

      expect(context.setAttachedNode).toHaveBeenLastCalledWith(null);
    });

    describe('on a rename', () => {
      it('broadcasts the new name and keeps colour and selection', () => {
        handlers['nodeSelect']({ id: 'node-1' } as ExportNodeProperties);
        afterThrottle();

        rename('Vorname Test');

        expect(lastBroadcast()).toEqual([
          'user',
          {
            color: '#ff0000',
            selectedNodeId: 'node-1',
            displayName: 'Vorname Test',
          },
        ]);
      });

      it('keeps the name in later selection updates', () => {
        rename('Vorname Test');
        afterThrottle();

        handlers['nodeSelect']({ id: 'node-2' } as ExportNodeProperties);
        afterThrottle();

        expect(lastBroadcast()).toEqual([
          'user',
          expect.objectContaining({
            selectedNodeId: 'node-2',
            displayName: 'Vorname Test',
          }),
        ]);
      });

      it('stays connected', () => {
        rename('Vorname Test');

        expect(provider().disconnect).not.toHaveBeenCalled();
      });

      it('broadcasts nothing when another setting changes', () => {
        const before =
          provider().awareness.setLocalStateField.mock.calls.length;
        const settings = userSettingsNamed('');

        userSettings$.next({
          ...settings,
          general: { ...settings.general, darkMode: true },
        });

        expect(provider().awareness.setLocalStateField).toHaveBeenCalledTimes(
          before
        );
      });

      it('broadcasts nothing when the normalized name stays the same', () => {
        rename('Vorname');
        const before =
          provider().awareness.setLocalStateField.mock.calls.length;

        rename('  Vorname ');

        expect(provider().awareness.setLocalStateField).toHaveBeenCalledTimes(
          before
        );
      });

      it('broadcasts nothing once the map is closed', () => {
        const closed = provider();
        service.destroy();
        closed.awareness.setLocalStateField.mockClear();

        rename('Vorname');

        expect(closed.awareness.setLocalStateField).not.toHaveBeenCalled();
      });
    });

    describe('the client list', () => {
      it('holds the normalized display name of a peer', () => {
        provider().states.set(PEER_ID, {
          user: {
            color: '#0000ff',
            selectedNodeId: null,
            displayName: '  Vorname   Test ',
          },
        });

        internals().updateFromAwareness();

        expect(lastMapping()).toEqual(
          expect.objectContaining({
            [PEER_ID]: {
              color: '#0000ff',
              nodeId: '',
              displayName: 'Vorname Test',
              isSelf: false,
            },
          })
        );
      });

      it('marks the own entry and carries the own name', () => {
        rename('Zweiter');
        // y-protocols emits 'change' on a local write; the fake does not.
        internals().updateFromAwareness();

        expect(lastMapping()).toEqual(
          expect.objectContaining({
            [provider().localClientId]: expect.objectContaining({
              displayName: 'Zweiter',
              isSelf: true,
            }),
          })
        );
      });
    });

    it('draws no ring for a peer that selects nothing', () => {
      (context.getColorMapping as jest.Mock).mockReturnValue({
        [PEER_ID]: {
          color: '#0000ff',
          nodeId: 'branch',
          displayName: '',
          isSelf: false,
        },
      });
      provider().states.set(PEER_ID, {
        user: { color: '#0000ff', selectedNodeId: null, displayName: '' },
      });

      internals().updateFromAwareness();

      expect(lastMapping()).toEqual(
        expect.objectContaining({
          [PEER_ID]: {
            color: '#0000ff',
            nodeId: '',
            displayName: '',
            isSelf: false,
          },
        })
      );
      expect(mmpService.highlightNode).toHaveBeenCalledWith('branch', '');
    });

    it('falls back to the defaults for a peer state that holds no strings', () => {
      const hostile = { color: { r: 1 }, selectedNodeId: 123, displayName: [] };
      provider().states.set(PEER_ID, {
        user: hostile as unknown as AwarenessUser,
      });

      internals().updateFromAwareness();

      expect(lastMapping()).toEqual(
        expect.objectContaining({
          [PEER_ID]: {
            color: '#000000',
            nodeId: '',
            displayName: '',
            isSelf: false,
          },
        })
      );
      expect(mmpService.existNode).not.toHaveBeenCalled();
      expect(mmpService.highlightNode).not.toHaveBeenCalled();
      expect(context.emitClientList).toHaveBeenCalled();
    });
  });
});
