import { ATTACHED_MAP_AUDIT_MS, YjsSyncService } from './yjs-sync.service';
import * as Y from 'yjs';
import { ExportNodeProperties } from '@teammapper/shared';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { MapSyncContext } from './map-sync-context';
import { populateYMapFromNodeProps } from './yjs-utils';
import { YjsMapData } from './yjs-map-data';
import {
  capturingMmpService,
  createMockContext,
  createYjsSyncService as createService,
  MmpHandlers,
} from '../../../../test/mocks/yjs-sync.mock';

interface YjsSyncInternals {
  yjsWritable: boolean;
  yjsSynced: boolean;
  yDoc: Y.Doc;
  yjsMapData: YjsMapData;
  showImportToast: () => Promise<void>;
  handleFirstSync: () => void;
  initUndoManager: () => void;
  setupNodesObserver: () => void;
  yUndoManager: Y.UndoManager | null;
}

function internals(service: YjsSyncService): YjsSyncInternals {
  return service as unknown as YjsSyncInternals;
}

function node(
  id: string,
  parent: string | null,
  isRoot = false
): ExportNodeProperties {
  return { id, parent, isRoot } as ExportNodeProperties;
}

describe('YjsSyncService', () => {
  describe('setWritable', () => {
    let settingsService: jest.Mocked<SettingsService>;
    let service: YjsSyncService;

    beforeEach(() => {
      settingsService = {
        setEditMode: jest.fn(),
      } as unknown as jest.Mocked<SettingsService>;
      service = createService(undefined, createMockContext(), settingsService);
    });

    it('sets yjsWritable to true', () => {
      service.setWritable(true);

      expect(internals(service).yjsWritable).toBe(true);
    });

    it('sets yjsWritable to false', () => {
      service.setWritable(false);

      expect(internals(service).yjsWritable).toBe(false);
    });

    it('does not change edit mode before the first sync', () => {
      service.setWritable(true);

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
    });

    it('sets edit mode when called after the first sync', () => {
      internals(service).yjsSynced = true;

      service.setWritable(true);

      expect(settingsService.setEditMode).toHaveBeenCalledWith(true);
    });

    // The settings page reads edit mode to decide whether the map settings
    // of the map the user left stay editable.
    it('keeps edit mode on destroy', () => {
      service.destroy();

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
    });

    it('keeps edit mode when it opens a new connection', () => {
      service.initMap('test-uuid');

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
      service.destroy();
    });
  });

  describe('initMap does not alter writable state', () => {
    let service: YjsSyncService;

    beforeEach(() => {
      service = createService();
    });

    afterEach(() => {
      service.destroy();
    });

    it('does not reset yjsWritable when called', () => {
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals(service).yjsWritable).toBe(true);
    });

    it('creates a new yDoc', () => {
      service.initMap('test-uuid');

      expect(internals(service).yDoc).not.toBeNull();
    });

    it('retains writable after destroy-setWritable-initMap sequence', () => {
      service.destroy();
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals(service).yjsWritable).toBe(true);
    });
  });

  describe('with an open connection', () => {
    let handlers: MmpHandlers;
    let mmpService: jest.Mocked<MmpService>;
    let context: MapSyncContext;
    let settingsService: jest.Mocked<SettingsService>;
    let service: YjsSyncService;

    beforeEach(() => {
      handlers = {};
      mmpService = capturingMmpService(handlers);
      context = createMockContext();
      settingsService = {
        setEditMode: jest.fn(),
      } as unknown as jest.Mocked<SettingsService>;
      service = createService(mmpService, context, settingsService);
      service.initMap('test-uuid');
    });

    afterEach(() => {
      service.destroy();
    });

    it('hands the map data of an empty doc over on the first sync', () => {
      internals(service).handleFirstSync();

      expect(context.createMap).toHaveBeenCalledWith(
        internals(service).yjsMapData
      );
    });

    it('subscribes to no mmp event before the map exists', () => {
      internals(service).handleFirstSync();

      expect(mmpService.on).not.toHaveBeenCalled();
    });

    it('hands the map data over again when a map component reattaches', () => {
      internals(service).yjsSynced = true;

      service.initMap('test-uuid');

      expect(context.createMap).toHaveBeenCalledWith(
        internals(service).yjsMapData
      );
    });

    it('closes the previous connection before opening a different map', () => {
      const previousDoc = internals(service).yDoc;
      const destroySpy = jest.spyOn(previousDoc, 'destroy');
      service.setWritable(true);

      service.initMap('another-map');

      expect(destroySpy).toHaveBeenCalled();
      expect(internals(service).yDoc).not.toBe(previousDoc);
      expect(internals(service).yjsWritable).toBe(true);
    });

    describe('attachMap', () => {
      const root = node('root', null, true);

      beforeEach(() => {
        mmpService.selectNode.mockReturnValue(root);
        service.setWritable(true);
        const options = internals(service).yDoc.getMap('mapOptions');
        options.set('fontMaxSize', 70);
        options.set('fontIncrement', 5);
        internals(service).handleFirstSync();
        service.attachMap();
      });

      it('applies the synced map settings before edit mode', () => {
        const optionsOrder =
          mmpService.updateAdditionalMapOptions.mock.invocationCallOrder[0];
        const editModeOrder =
          settingsService.setEditMode.mock.invocationCallOrder[0];

        expect(mmpService.updateAdditionalMapOptions).toHaveBeenCalledWith({
          fontMaxSize: 70,
          fontMinSize: undefined,
          fontIncrement: 5,
        });
        expect(optionsOrder).toBeLessThan(editModeOrder);
      });

      it('keeps settings edits in the same doc while the renderer is detached', () => {
        const doc = internals(service).yDoc;
        const options = { fontMaxSize: 80, fontMinSize: 20, fontIncrement: 7 };

        service.detachMap();
        service.updateMapOptions(options);
        service.initMap('test-uuid');
        service.attachMap();

        expect(internals(service).yDoc).toBe(doc);
        expect(doc.getMap('mapOptions').toJSON()).toEqual(options);
        expect(mmpService.updateAdditionalMapOptions).toHaveBeenLastCalledWith(
          options
        );
      });

      it('stops updating the removed renderer when it is detached', () => {
        jest.useFakeTimers();
        service.detachMap();
        (context.setAttachedNode as jest.Mock).mockClear();

        handlers['mapChange']();
        handlers['nodeSelect'](root);
        jest.advanceTimersByTime(ATTACHED_MAP_AUDIT_MS);

        expect(context.setAttachedNode).not.toHaveBeenCalled();
        expect(context.updateAttachedMap).not.toHaveBeenCalled();
        jest.useRealTimers();
      });

      it('subscribes to the map change and the selection events', () => {
        expect(Object.keys(handlers).sort()).toEqual([
          'mapChange',
          'nodeDeselect',
          'nodeSelect',
        ]);
      });

      it('attaches the node the map selected when it was created', () => {
        expect(context.setAttachedNode).toHaveBeenLastCalledWith(root);
      });

      it('creates the undo manager', () => {
        expect(internals(service).yUndoManager).not.toBeNull();
      });

      it('sets edit mode after awareness is up', () => {
        const awarenessOrder = (context.setClientColor as jest.Mock).mock
          .invocationCallOrder[0];
        const editModeOrder =
          settingsService.setEditMode.mock.invocationCallOrder[0];

        expect(settingsService.setEditMode).toHaveBeenCalledWith(true);
        expect(editModeOrder).toBeGreaterThan(awarenessOrder);
      });

      it('refreshes the cached map and the attached node on a map change', () => {
        jest.useFakeTimers();
        const selected = node('child', 'root');
        mmpService.selectNode.mockReturnValue(selected);

        handlers['mapChange']();
        jest.advanceTimersByTime(ATTACHED_MAP_AUDIT_MS);

        expect(context.updateAttachedMap).toHaveBeenCalled();
        expect(context.setAttachedNode).toHaveBeenLastCalledWith(selected);
        jest.useRealTimers();
      });

      it('refreshes the attached node at once and the cached map once per burst', () => {
        jest.useFakeTimers();
        const selected = node('child', 'root');
        mmpService.selectNode.mockReturnValue(selected);

        handlers['mapChange']();
        handlers['mapChange']();
        handlers['mapChange']();

        expect(context.setAttachedNode).toHaveBeenLastCalledWith(selected);
        expect(context.updateAttachedMap).not.toHaveBeenCalled();
        jest.advanceTimersByTime(ATTACHED_MAP_AUDIT_MS);
        expect(context.updateAttachedMap).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
      });
    });
  });

  describe('map settings between two clients', () => {
    let editor: YjsSyncService;
    let viewer: YjsSyncService;
    let editorMmp: jest.Mocked<MmpService>;
    let viewerMmp: jest.Mocked<MmpService>;

    function sync(from: YjsSyncService, to: YjsSyncService): void {
      const source = internals(from).yDoc;
      const target = internals(to).yDoc;
      Y.applyUpdate(
        target,
        Y.encodeStateAsUpdate(source, Y.encodeStateVector(target)),
        'peer'
      );
    }

    beforeEach(() => {
      editorMmp = capturingMmpService({});
      viewerMmp = capturingMmpService({});
      editor = createService(editorMmp);
      viewer = createService(viewerMmp);
      editor.setWritable(true);
      viewer.setWritable(false);
      editor.initMap('shared-map');
      viewer.initMap('shared-map');
      editor.updateMapOptions({
        fontMaxSize: 70,
        fontMinSize: 6,
        fontIncrement: 2,
      });
      sync(editor, viewer);
      for (const service of [editor, viewer]) {
        internals(service).handleFirstSync();
        service.attachMap();
      }
      editorMmp.updateAdditionalMapOptions.mockClear();
      viewerMmp.updateAdditionalMapOptions.mockClear();
    });

    afterEach(() => {
      editor.destroy();
      viewer.destroy();
    });

    it('applies an editor update to a viewer without echoing it back locally', () => {
      const options = { fontMaxSize: 80, fontMinSize: 6, fontIncrement: 7 };
      editor.updateMapOptions(options);
      sync(editor, viewer);
      sync(viewer, editor);

      expect(viewerMmp.updateAdditionalMapOptions).toHaveBeenCalledTimes(1);
      expect(viewerMmp.updateAdditionalMapOptions).toHaveBeenCalledWith(
        options
      );
      expect(editorMmp.updateAdditionalMapOptions).not.toHaveBeenCalled();
    });

    it('receives peer settings while the renderer is detached', () => {
      viewer.detachMap();
      const options = { fontMaxSize: 80, fontMinSize: 20, fontIncrement: 7 };

      editor.updateMapOptions(options);
      sync(editor, viewer);

      expect(viewerMmp.updateAdditionalMapOptions).toHaveBeenCalledWith(
        options
      );
    });

    it('applies updates in both directions when both clients can edit', () => {
      viewer.setWritable(true);
      editor.updateMapOptions({
        fontMaxSize: 80,
        fontMinSize: 20,
        fontIncrement: 7,
      });
      sync(editor, viewer);
      const options = { fontMaxSize: 90, fontMinSize: 25, fontIncrement: 5 };
      viewer.updateMapOptions(options);
      sync(viewer, editor);

      expect(viewerMmp.updateAdditionalMapOptions).toHaveBeenCalledWith({
        fontMaxSize: 80,
        fontMinSize: 20,
        fontIncrement: 7,
      });
      expect(editorMmp.updateAdditionalMapOptions).toHaveBeenCalledTimes(1);
      expect(editorMmp.updateAdditionalMapOptions).toHaveBeenCalledWith(
        options
      );
    });

    it('passes a deleted peer setting to MmpService to restore its default', () => {
      internals(editor).yDoc.getMap('mapOptions').delete('fontMinSize');
      sync(editor, viewer);

      expect(viewerMmp.updateAdditionalMapOptions).toHaveBeenCalledWith({
        fontMaxSize: 70,
        fontMinSize: undefined,
        fontIncrement: 2,
      });
    });
  });

  describe('a peer replacing the map', () => {
    let context: MapSyncContext;
    let service: YjsSyncService;
    let peer: Y.Doc;
    let importToast: jest.SpyInstance;

    function writeNodes(
      nodesMap: Y.Map<Y.Map<unknown>>,
      nodes: ExportNodeProperties[]
    ): void {
      for (const props of nodes) {
        const yNode = new Y.Map<unknown>();
        populateYMapFromNodeProps(yNode, props);
        nodesMap.set(props.id, yNode);
      }
    }

    /**
     * Runs `change` in a transaction on the peer's `Y.Doc` and applies the
     * resulting update to the service's `Y.Doc` with origin `'peer'`.
     */
    function peerTransacts(
      change: (nodesMap: Y.Map<Y.Map<unknown>>, meta: Y.Map<unknown>) => void
    ): void {
      const doc = internals(service).yDoc;
      peer.transact(() => {
        change(peer.getMap('nodes'), peer.getMap('meta'));
      });
      Y.applyUpdate(
        doc,
        Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)),
        'peer'
      );
    }

    /** The peer replaces every node, as an import or its undo does. */
    function peerReplaces(metaKeys: Record<string, string> = {}): void {
      peerTransacts((nodesMap, meta) => {
        nodesMap.delete('main');
        Object.entries(metaKeys).forEach(([key, value]) =>
          meta.set(key, value)
        );
        writeNodes(nodesMap, [node('imported', null, true)]);
      });
    }

    function undoStackLength(): number | undefined {
      return internals(service).yUndoManager?.undoStack.length;
    }

    beforeEach(() => {
      context = createMockContext();
      service = createService(undefined, context);
      service.initMap('test-uuid');
      internals(service).yjsSynced = true;
      internals(service).initUndoManager();
      peer = new Y.Doc();
      peerTransacts(nodesMap =>
        writeNodes(nodesMap, [node('main', null, true)])
      );
      internals(service).setupNodesObserver();
      importToast = jest
        .spyOn(internals(service), 'showImportToast')
        .mockResolvedValue(undefined);

      internals(service).yjsMapData.addNodes([node('mine', 'main')]);
    });

    afterEach(() => {
      service.destroy();
      peer.destroy();
    });

    it('keeps the undo stack when a peer adds a tree', () => {
      peerTransacts(nodesMap => writeNodes(nodesMap, [node('second', null)]));

      expect({
        undoStack: undoStackLength(),
        toast: importToast.mock.calls,
      }).toEqual({ undoStack: 1, toast: [] });
    });

    it('clears the undo stack and shows the toast when a peer imports', () => {
      peerReplaces({ lastMapAnnouncement: 'import' });

      expect({
        undoStack: undoStackLength(),
        toasts: importToast.mock.calls.length,
      }).toEqual({ undoStack: 0, toasts: 1 });
    });

    // Clearing the stack has to reach the toolbar, or undo stays enabled
    // with nothing left to undo.
    it('reports that there is nothing left to undo', () => {
      peerReplaces({ lastMapAnnouncement: 'import' });

      expect(context.setCanUndo).toHaveBeenLastCalledWith(false);
    });

    // An undo replays nodes without recording an operation, so the stale
    // 'import' left in the meta map must not make it announce one.
    it('shows no toast when a peer undoes an import', () => {
      peerTransacts((_, meta) => meta.set('lastMapAnnouncement', 'import'));
      importToast.mockClear();

      peerReplaces();

      expect(importToast).not.toHaveBeenCalled();
    });

    // The announcement is read per key, so `meta` gaining unrelated fields
    // later must not turn every replacement into an import.
    it('shows no toast for an unrelated meta write', () => {
      peerTransacts((_, meta) => meta.set('lastMapAnnouncement', 'import'));
      importToast.mockClear();

      peerReplaces({ someOtherField: 'value' });

      expect(importToast).not.toHaveBeenCalled();
    });

    // ImportService shows its own toast for a local import.
    it('keeps the history and shows no toast for our own import', () => {
      internals(service).yjsMapData.replaceMap([node('imported', null, true)]);

      expect({
        undoStack: undoStackLength(),
        toasts: importToast.mock.calls.length,
      }).toEqual({ undoStack: 2, toasts: 0 });
    });

    it('keeps the history when the replacement is our own undo', () => {
      internals(service).yjsMapData.replaceMap([node('imported', null, true)]);

      service.undo();

      expect(undoStackLength()).toBe(1);
    });
  });
});
