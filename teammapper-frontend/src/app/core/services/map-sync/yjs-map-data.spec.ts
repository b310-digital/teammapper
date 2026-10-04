import * as Y from 'yjs';
import type { MapDataChange } from '@teammapper/mmp';
import { ExportNodeProperties } from '@teammapper/shared';
import {
  LAST_MAP_ANNOUNCEMENT,
  LOCAL_ORIGIN,
  META,
  YjsMapData,
} from './yjs-map-data';
import { yMapToNodeProps } from './yjs-utils';

function node(
  id: string,
  parent: string | null = null,
  isRoot = false
): ExportNodeProperties {
  return {
    id,
    parent,
    isRoot,
    name: id,
    k: 1,
    protected: false,
    coordinates: { x: 0, y: 0 },
    colors: { name: '#000000', background: '#ffffff', branch: '#333333' },
    font: { size: 14, style: 'normal', weight: 'normal' },
    image: { src: '', size: 0 },
    link: { href: '' },
  };
}

/** Send every update `from` holds and `to` lacks, as a peer's change. */
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(
    to,
    Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)),
    'peer'
  );
}

describe('YjsMapData', () => {
  let doc: Y.Doc;
  let undoManager: Y.UndoManager;
  let data: YjsMapData;
  let changes: MapDataChange[];

  const nodesMap = () => doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  const stored = (id: string) => {
    const yNode = nodesMap().get(id);
    return yNode ? yMapToNodeProps(yNode) : undefined;
  };
  const lastChange = () => changes[changes.length - 1];

  beforeEach(() => {
    doc = new Y.Doc();
    data = new YjsMapData(doc, () => undoManager);
    // The main root exists before the undo manager, as after a first sync.
    data.addNodes([node('root', null, true)]);
    undoManager = new Y.UndoManager(nodesMap(), {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    changes = [];
    data.subscribe(change => changes.push(change));
  });

  afterEach(() => {
    data.destroy();
    undoManager.destroy();
    doc.destroy();
  });

  it('writes with the local origin, so the undo manager records it', () => {
    const origins: unknown[] = [];
    doc.on('afterTransaction', transaction => origins.push(transaction.origin));

    data.addNodes([node('a', 'root')]);

    expect({
      origins,
      undoSteps: undoManager.undoStack.length,
      change: lastChange(),
    }).toEqual({
      origins: [LOCAL_ORIGIN],
      undoSteps: 1,
      change: { replaced: false, added: ['a'], updated: [], removed: [] },
    });
  });

  it('notifies a write before it returns', () => {
    data.updateNode('root', 'name', 'Renamed');

    expect(changes).toHaveLength(1);
  });

  it('reads the records, the main root and the order of the doc', () => {
    data.addNodes([node('a', 'root'), node('b', 'root')]);

    expect({
      root: data.node('root')?.name,
      missing: data.node('missing'),
      ids: data.nodes().map(record => record.id),
      mainRoot: data.mainRootId(),
    }).toEqual({
      root: 'root',
      missing: undefined,
      ids: ['root', 'a', 'b'],
      mainRoot: 'root',
    });
  });

  it('writes the whole top-level key of a nested property', () => {
    data.updateNode('root', 'backgroundColor', '#ff0000');

    expect({ colors: stored('root')?.colors, change: lastChange() }).toEqual({
      colors: { name: '#000000', background: '#ff0000', branch: '#333333' },
      change: { replaced: false, added: [], updated: ['root'], removed: [] },
    });
  });

  it('does not report a rename of the main root as a replacement', () => {
    data.updateNode('root', 'name', 'Renamed');

    expect(lastChange().replaced).toBe(false);
  });

  it('writes and notifies nothing for an id it does not hold', () => {
    data.updateNode('missing', 'name', 'x');
    data.removeNode('missing');

    expect(changes).toEqual([]);
  });

  it('keeps no reference to the nodes it was given', () => {
    const added = node('a', 'root');
    data.addNodes([added]);

    added.coordinates = { x: 99, y: 99 };

    expect(stored('a')?.coordinates).toEqual({ x: 0, y: 0 });
  });

  it('removes the descendants with the node', () => {
    data.addNodes([node('a', 'root'), node('b', 'a'), node('c', 'b')]);

    data.removeNode('a');

    expect({
      ids: Array.from(nodesMap().keys()),
      removed: [...lastChange().removed].sort(),
    }).toEqual({ ids: ['root'], removed: ['a', 'b', 'c'] });
  });

  it('notifies a nested batch once, when the outer batch ends', () => {
    data.batch(() => {
      data.addNodes([node('a', 'root')]);
      data.batch(() => data.updateNode('root', 'name', 'Renamed'));
    });

    expect(changes).toEqual([
      { replaced: false, added: ['a'], updated: ['root'], removed: [] },
    ]);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = data.subscribe(listener);

    unsubscribe();
    data.addNodes([node('a', 'root')]);

    expect(listener).not.toHaveBeenCalled();
  });

  describe('a peer', () => {
    let peer: Y.Doc;

    beforeEach(() => {
      peer = new Y.Doc();
      sync(doc, peer);
    });

    afterEach(() => {
      peer.destroy();
    });

    it('reports a node the peer adds and records no undo step', () => {
      const peerData = new YjsMapData(peer, () => null);
      peerData.addNodes([node('p', 'root')]);

      sync(peer, doc);

      expect({
        change: lastChange(),
        undoSteps: undoManager.undoStack.length,
      }).toEqual({
        change: { replaced: false, added: ['p'], updated: [], removed: [] },
        undoSteps: 0,
      });
      peerData.destroy();
    });

    it('reports a nested key change as an update of that node', () => {
      const peerRoot = (peer.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(
        'root'
      );
      peerRoot?.set('colors', { background: '#00ff00' });

      sync(peer, doc);

      expect(lastChange()).toEqual({
        replaced: false,
        added: [],
        updated: ['root'],
        removed: [],
      });
    });

    it('reads past an entry the peer writes that is no Y.Map', () => {
      peer.getMap('nodes').set('text', 'no node');
      peer.getMap('nodes').set('object', { isRoot: true });

      sync(peer, doc);

      expect({
        text: data.node('text'),
        ids: data.nodes().map(record => record.id),
        mainRoot: data.mainRootId(),
        changes,
      }).toEqual({
        text: undefined,
        ids: ['root'],
        mainRoot: 'root',
        changes: [],
      });
    });

    it('reports no change for an edit inside an entry that is no Y.Map', () => {
      const list = new Y.Array<number>();
      peer.getMap('nodes').set('list', list);
      sync(peer, doc);
      changes = [];

      list.push([1]);
      sync(peer, doc);

      expect(changes).toEqual([]);
    });

    it('removes no entry that is no Y.Map', () => {
      peer.getMap('nodes').set('text', 'no node');
      sync(peer, doc);

      data.removeNode('text');

      expect({
        kept: doc.getMap('nodes').get('text'),
        undoSteps: undoManager.undoStack.length,
      }).toEqual({ kept: 'no node', undoSteps: 0 });
    });

    it('reports an entry the peer turns into a node as added', () => {
      peer.getMap('nodes').set('late', 'no node');
      sync(peer, doc);

      const peerData = new YjsMapData(peer, () => null);
      peerData.addNodes([node('late', 'root')]);
      sync(peer, doc);

      expect(lastChange()).toEqual({
        replaced: false,
        added: ['late'],
        updated: [],
        removed: [],
      });
      peerData.destroy();
    });

    it('reports a node the peer overwrites with another value as removed', () => {
      peer.getMap('nodes').set('root', 'no node');

      sync(peer, doc);

      expect({ nodes: data.nodes(), change: lastChange() }).toEqual({
        nodes: [],
        change: { replaced: false, added: [], updated: [], removed: ['root'] },
      });
    });
  });

  describe('undo', () => {
    it('notifies the change an undo makes', () => {
      data.addNodes([node('a', 'root')]);

      undoManager.undo();

      expect(lastChange()).toEqual({
        replaced: false,
        added: [],
        updated: [],
        removed: ['a'],
      });
    });

    it('reverts a batch in one step', () => {
      data.addNodes([node('a', 'root')]);
      undoManager.stopCapturing();
      data.batch(() => {
        data.updateNode('root', 'protected', true);
        data.updateNode('a', 'protected', true);
      });

      undoManager.undo();

      expect({
        root: stored('root')?.protected,
        a: stored('a')?.protected,
      }).toEqual({ root: false, a: false });
    });

    it('keeps the edit after a batch that throws out of its undo step', () => {
      data.addNodes([node('a', 'root')]);
      undoManager.stopCapturing();
      expect(() =>
        data.batch(() => {
          data.updateNode('root', 'name', 'Batched');
          throw new Error('batch failed');
        })
      ).toThrow('batch failed');
      data.updateNode('a', 'name', 'Edited');

      undoManager.undo();

      expect({
        root: stored('root')?.name,
        a: stored('a')?.name,
      }).toEqual({ root: 'Batched', a: 'a' });
    });

    it('reverts a batch without the edit before it', () => {
      data.addNodes([node('a', 'root')]);
      undoManager.stopCapturing();
      data.updateNode('a', 'name', 'Edited');
      data.batch(() => {
        data.updateNode('root', 'coordinates', { x: 0, y: 0 });
        data.updateNode('a', 'coordinates', { x: 200, y: 0 });
      });

      undoManager.undo();

      expect({
        name: stored('a')?.name,
        coordinates: stored('a')?.coordinates,
      }).toEqual({ name: 'Edited', coordinates: { x: 0, y: 0 } });
    });
  });

  describe('replaceMap', () => {
    beforeEach(() => {
      data.addNodes([node('old', 'root')]);
      data.replaceMap([node('root', null, true), node('new', 'root')]);
    });

    it('announces the import in the doc', () => {
      expect(doc.getMap(META).get(LAST_MAP_ANNOUNCEMENT)).toBe('import');
    });

    it('reports a replacement, with surviving ids as updates', () => {
      expect(lastChange()).toEqual({
        replaced: true,
        added: ['new'],
        updated: ['root'],
        removed: ['old'],
      });
    });

    it('takes an undo step of its own', () => {
      undoManager.undo();

      expect(Array.from(nodesMap().keys()).sort()).toEqual(['old', 'root']);
    });

    it('keeps an edit right after it out of its undo step', () => {
      data.updateNode('new', 'name', 'Edited');

      undoManager.undo();

      expect({
        ids: Array.from(nodesMap().keys()).sort(),
        name: stored('new')?.name,
      }).toEqual({ ids: ['new', 'root'], name: 'new' });
    });
  });

  it('reverts a paste written in a batch without the edit before it', () => {
    data.addNodes([node('a', 'root')]);
    undoManager.stopCapturing();
    data.updateNode('a', 'name', 'Edited');
    data.batch(() => data.addNodes([node('pasted', 'a')]));

    undoManager.undo();

    expect({
      ids: Array.from(nodesMap().keys()).sort(),
      name: stored('a')?.name,
    }).toEqual({ ids: ['a', 'root'], name: 'Edited' });
  });

  it('takes the id of a record from its key, whatever its id field holds', () => {
    doc.transact(() => {
      const yNode = new Y.Map<unknown>();
      yNode.set('id', 'root');
      yNode.set('parent', 'root');
      nodesMap().set('forged', yNode);
    }, 'peer');

    expect({
      node: data.node('forged')?.id,
      ids: data.nodes().map(record => record.id),
    }).toEqual({ node: 'forged', ids: ['root', 'forged'] });
  });
});
