import { ExportNodeProperties } from '@teammapper/shared';
import { MmpService } from '../mmp/mmp.service';
import { MapSyncContext } from './map-sync-context';
import { YjsSyncService } from './yjs-sync.service';
import {
  capturingMmpService,
  createMockContext,
  createYjsSyncService,
  MmpHandlers,
} from '../../../../test/mocks/yjs-sync.mock';

/**
 * Presence carries each client's selected node. A client with nothing
 * selected broadcasts an empty selection, and peers draw no ring for it.
 */

interface AwarenessUser {
  color: string;
  selectedNodeId: string | null;
}

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

  constructor(private readonly localClientId: number) {
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
  let service: YjsSyncService;

  function provider(): FakeWebsocketProvider {
    if (!FakeWebsocketProvider.latest) throw new Error('No provider created');
    return FakeWebsocketProvider.latest;
  }

  function lastBroadcast(): unknown {
    return provider().awareness.setLocalStateField.mock.lastCall;
  }

  beforeEach(() => {
    handlers = {};
    context = createMockContext();
    mmpService = capturingMmpService(handlers);
    service = createYjsSyncService(mmpService, context);
    service.initMap('test-uuid');
    // attachMap subscribes once the map exists; these tests set awareness up
    // on their own.
    (service as unknown as PresenceInternals).createListeners();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('before awareness setup', () => {
    it('broadcasts nothing on a select and attaches the node', () => {
      handlers['nodeSelect']({ id: 'root' } as ExportNodeProperties);

      expect(provider().awareness.setLocalStateField).not.toHaveBeenCalled();
      expect(context.setAttachedNode).toHaveBeenLastCalledWith({ id: 'root' });
    });

    it('keeps the client colour and publishes the selection on setup', () => {
      handlers['nodeSelect']({ id: 'root' } as ExportNodeProperties);

      (service as unknown as PresenceInternals).setupAwareness();

      expect(context.setClientColor).toHaveBeenLastCalledWith('#ff0000');
      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: 'root' },
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
        { color: '#ff0000', selectedNodeId: 'main-root' },
      ]);
    });
  });

  describe('after awareness setup', () => {
    beforeEach(() => {
      (service as unknown as PresenceInternals).setupAwareness();
    });

    it('broadcasts the id of a selected node', () => {
      handlers['nodeSelect']({ id: 'branch' } as ExportNodeProperties);

      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: 'branch' },
      ]);
    });

    it('broadcasts an empty selection on deselect', () => {
      handlers['nodeSelect']({ id: 'branch' } as ExportNodeProperties);

      handlers['nodeDeselect']({ id: 'branch' } as ExportNodeProperties);

      expect(lastBroadcast()).toEqual([
        'user',
        { color: '#ff0000', selectedNodeId: null },
      ]);
    });

    it('attaches no node on deselect', () => {
      handlers['nodeDeselect']({ id: 'branch' } as ExportNodeProperties);

      expect(context.setAttachedNode).toHaveBeenLastCalledWith(null);
    });

    it('draws no ring for a peer that selects nothing', () => {
      (context.getColorMapping as jest.Mock).mockReturnValue({
        [PEER_ID]: { color: '#0000ff', nodeId: 'branch' },
      });
      provider().states.set(PEER_ID, {
        user: { color: '#0000ff', selectedNodeId: null },
      });

      (service as unknown as PresenceInternals).updateFromAwareness();

      expect(context.setColorMapping).toHaveBeenLastCalledWith(
        expect.objectContaining({
          [PEER_ID]: { color: '#0000ff', nodeId: '' },
        })
      );
      expect(mmpService.highlightNode).toHaveBeenCalledWith('branch', '');
    });

    it('falls back to the defaults for a peer state that holds no strings', () => {
      const hostile = { color: { r: 1 }, selectedNodeId: 123 };
      provider().states.set(PEER_ID, {
        user: hostile as unknown as AwarenessUser,
      });

      (service as unknown as PresenceInternals).updateFromAwareness();

      expect(context.setColorMapping).toHaveBeenLastCalledWith(
        expect.objectContaining({
          [PEER_ID]: { color: '#000000', nodeId: '' },
        })
      );
      expect(mmpService.existNode).not.toHaveBeenCalledWith(123);
      expect(context.emitClientList).toHaveBeenCalled();
    });
  });
});
