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
  const arrowsMap = () => doc.getMap('arrows') as Y.Map<Y.Map<unknown>>;
  const arrowKeys = () => Array.from(arrowsMap().keys()).sort();
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
    undoManager = new Y.UndoManager([nodesMap(), arrowsMap()], {
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
      change: {
        replaced: false,
        added: ['a'],
        updated: [],
        removed: [],
        arrows: [],
      },
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

  it('writes a grouped property under its own key in the nested Y.Map', () => {
    const group = nodesMap().get('root')?.get('colors');

    data.updateNode('root', 'backgroundColor', '#ff0000');

    expect({
      sameGroup: nodesMap().get('root')?.get('colors') === group,
      nested: group instanceof Y.Map,
      colors: stored('root')?.colors,
      change: lastChange(),
    }).toEqual({
      sameGroup: true,
      nested: true,
      colors: { name: '#000000', background: '#ff0000', branch: '#333333' },
      change: {
        replaced: false,
        added: [],
        updated: ['root'],
        removed: [],
        arrows: [],
      },
    });
  });

  it('reads and updates a group a client stored as a plain object', () => {
    doc.transact(() =>
      nodesMap()
        .get('root')
        ?.set('font', { size: 14, style: 'normal', weight: 'normal' })
    );

    data.updateNode('root', 'fontWeight', 'bold');

    expect({
      nested: nodesMap().get('root')?.get('font') instanceof Y.Map,
      font: data.node('root')?.font,
    }).toEqual({
      nested: true,
      font: { size: 14, style: 'normal', weight: 'bold' },
    });
  });

  describe('concurrent edits of one attribute group', () => {
    let peerDoc: Y.Doc;
    let peer: YjsMapData;

    beforeEach(() => {
      peerDoc = new Y.Doc();
      sync(doc, peerDoc);
      peer = new YjsMapData(peerDoc, () => null);
    });

    afterEach(() => {
      peer.destroy();
      peerDoc.destroy();
    });

    /** Exchange the updates both ways, as after a reconnect. */
    const reconnect = () => {
      sync(doc, peerDoc);
      sync(peerDoc, doc);
    };

    it('keeps a background color and a name color set apart', () => {
      data.updateNode('root', 'backgroundColor', '#ff0000');
      peer.updateNode('root', 'nameColor', '#00ff00');
      reconnect();

      const merged = {
        name: '#00ff00',
        background: '#ff0000',
        branch: '#333333',
      };
      expect({
        local: data.node('root')?.colors,
        peer: peer.node('root')?.colors,
      }).toEqual({ local: merged, peer: merged });
    });

    it("undoes a local color and keeps a peer's color in the same group", () => {
      data.updateNode('root', 'backgroundColor', '#ff0000');
      peer.updateNode('root', 'nameColor', '#00ff00');
      sync(peerDoc, doc);

      undoManager.undo();

      expect(data.node('root')?.colors).toEqual({
        name: '#00ff00',
        background: '#ffffff',
        branch: '#333333',
      });
    });

    it('keeps a font weight and a font size set apart', () => {
      data.updateNode('root', 'fontWeight', 'bold');
      peer.updateNode('root', 'fontSize', 20);
      reconnect();

      const merged = { size: 20, style: 'normal', weight: 'bold' };
      expect({
        local: data.node('root')?.font,
        peer: peer.node('root')?.font,
      }).toEqual({ local: merged, peer: merged });
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

  it("reads back a record shaped like mmp's new node as it was written", () => {
    const added: ExportNodeProperties = {
      ...node('a'),
      k: -7.25,
      font: { size: 14, style: 'italic', weight: 'bold' },
    };

    data.addNodes([added]);

    expect(data.node('a')).toStrictEqual(added);
  });

  it('reads back an entry without k and font without them', () => {
    const yNode = new Y.Map<unknown>();
    nodesMap().set('bare', yNode);
    yNode.set('parent', 'root');
    yNode.set('name', 'Bare');

    expect(data.node('bare')).toStrictEqual({
      id: 'bare',
      parent: 'root',
      name: 'Bare',
    });
  });

  describe('every writer of a root', () => {
    it.each([
      ["mmp's new node", 'mmp', () => data.addNodes([node('mmp')])],
      [
        'a node given an empty string',
        'empty',
        () => data.addNodes([{ ...node('empty'), parent: '' }]),
      ],
    ])('stores null as the parent for %s', (_label, id, write) => {
      write();

      expect(nodesMap().get(id)?.get('parent')).toBeNull();
      expect(data.node(id)?.parent).toBeNull();
    });

    it('reads the null parent of a root the backend hydrated', () => {
      // The shape `populateYMapFromNode` in the backend writes for a root.
      const yNode = new Y.Map<unknown>();
      nodesMap().set('backend', yNode);
      yNode.set('id', 'backend');
      yNode.set('parent', null);
      yNode.set('orderNumber', 0);

      expect(data.node('backend')?.parent).toBeNull();
    });
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
      {
        replaced: false,
        added: ['a'],
        updated: ['root'],
        removed: [],
        arrows: [],
      },
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
        change: {
          replaced: false,
          added: ['p'],
          updated: [],
          removed: [],
          arrows: [],
        },
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
        arrows: [],
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
        arrows: [],
      });
      peerData.destroy();
    });

    it('reports a node the peer overwrites with another value as removed', () => {
      peer.getMap('nodes').set('root', 'no node');

      sync(peer, doc);

      expect({ nodes: data.nodes(), change: lastChange() }).toEqual({
        nodes: [],
        change: {
          replaced: false,
          added: [],
          updated: [],
          removed: ['root'],
          arrows: [],
        },
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
        arrows: [],
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
        arrows: [],
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

  describe('arrows', () => {
    beforeEach(() => {
      data.addNodes([node('a', 'root'), node('b', 'root'), node('c', 'a')]);
      undoManager.clear();
      changes = [];
    });

    it('stores an arrow under its key as a Y.Map with source and target', () => {
      data.addArrows([{ source: 'a', target: 'b' }]);

      const entry = arrowsMap().get('a:b');
      expect({
        isMap: entry instanceof Y.Map,
        stored: entry?.toJSON(),
        read: data.arrows(),
      }).toEqual({
        isMap: true,
        stored: { source: 'a', target: 'b' },
        read: [{ source: 'a', target: 'b' }],
      });
    });

    it('writes an arrow with the local origin as one undo step', () => {
      data.addArrows([
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ]);

      expect(undoManager.undoStack).toHaveLength(1);
    });

    it('reports the key of an added arrow as the only change', () => {
      data.addArrows([{ source: 'a', target: 'b' }]);

      expect(changes).toEqual([
        {
          replaced: false,
          added: [],
          updated: [],
          removed: [],
          arrows: ['a:b'],
        },
      ]);
    });

    it('removes an arrow by key and reports the key', () => {
      data.addArrows([{ source: 'a', target: 'b' }]);
      changes = [];

      data.removeArrow('a:b');

      expect({ keys: arrowKeys(), changes }).toEqual({
        keys: [],
        changes: [
          {
            replaced: false,
            added: [],
            updated: [],
            removed: [],
            arrows: ['a:b'],
          },
        ],
      });
    });

    it('changes and notifies nothing when it removes a key it lacks', () => {
      data.removeArrow('a:b');

      expect({ changes, undoSteps: undoManager.undoStack.length }).toEqual({
        changes: [],
        undoSteps: 0,
      });
    });

    it('reads past entries that are no valid arrow', () => {
      doc.transact(() => {
        const wrongKey = new Y.Map<unknown>();
        wrongKey.set('source', 'a');
        wrongKey.set('target', 'b');
        arrowsMap().set('x:y', wrongKey);
        const noTarget = new Y.Map<unknown>();
        noTarget.set('source', 'a');
        arrowsMap().set('a:', noTarget);
        const numeric = new Y.Map<unknown>();
        numeric.set('source', 1);
        numeric.set('target', 2);
        arrowsMap().set('1:2', numeric);
        doc.getMap('arrows').set('text', 'no arrow');
        const valid = new Y.Map<unknown>();
        valid.set('source', 'b');
        valid.set('target', 'c');
        arrowsMap().set('b:c', valid);
      }, 'peer');

      expect(data.arrows()).toEqual([{ source: 'b', target: 'c' }]);
    });

    it('keeps an arrow whose endpoint the data lacks', () => {
      data.addArrows([{ source: 'a', target: 'gone' }]);

      expect(data.arrows()).toEqual([{ source: 'a', target: 'gone' }]);
    });

    describe('removeNode', () => {
      beforeEach(() => {
        data.addArrows([
          { source: 'a', target: 'b' },
          { source: 'c', target: 'b' },
          { source: 'b', target: 'root' },
        ]);
        undoManager.stopCapturing();
        changes = [];
      });

      it('removes the arrows attached to the node and its descendants', () => {
        data.removeNode('a');

        expect(arrowKeys()).toEqual(['b:root']);
      });

      it('reports the nodes and the arrow keys as one change', () => {
        data.removeNode('a');

        expect(changes).toEqual([
          {
            replaced: false,
            added: [],
            updated: [],
            removed: ['a', 'c'],
            arrows: ['a:b', 'c:b'],
          },
        ]);
      });

      it('restores the nodes and the arrows with one undo', () => {
        data.removeNode('a');

        undoManager.undo();

        expect({
          nodes: Array.from(nodesMap().keys()).sort(),
          arrows: arrowKeys(),
        }).toEqual({
          nodes: ['a', 'b', 'c', 'root'],
          arrows: ['a:b', 'b:root', 'c:b'],
        });
      });

      it('reports the restored nodes and arrows as one change', () => {
        data.removeNode('a');
        changes = [];

        undoManager.undo();

        expect(changes).toEqual([
          {
            replaced: false,
            added: ['a', 'c'],
            updated: [],
            removed: [],
            arrows: ['a:b', 'c:b'],
          },
        ]);
      });
    });

    it('reports one change for a transaction that writes both maps', () => {
      doc.transact(() => {
        data.addNodes([node('d', 'root')]);
        data.addArrows([{ source: 'd', target: 'b' }]);
      }, LOCAL_ORIGIN);

      expect(changes).toEqual([
        {
          replaced: false,
          added: ['d'],
          updated: [],
          removed: [],
          arrows: ['d:b'],
        },
      ]);
    });

    it('reports a transaction that writes the arrows map first once', () => {
      doc.transact(() => {
        data.addArrows([{ source: 'a', target: 'b' }]);
        data.updateNode('b', 'name', 'Renamed');
      }, LOCAL_ORIGIN);

      expect(changes).toHaveLength(1);
    });

    describe('replaceMap', () => {
      beforeEach(() => {
        data.addArrows([{ source: 'a', target: 'b' }]);
        undoManager.stopCapturing();
        changes = [];
      });

      it('writes the given arrows and drops the old ones', () => {
        data.replaceMap(
          [node('root', null, true), node('x', 'root'), node('y', 'root')],
          [{ source: 'x', target: 'y' }]
        );

        expect(data.arrows()).toEqual([{ source: 'x', target: 'y' }]);
      });

      it('leaves the map with no arrows when none are passed', () => {
        data.replaceMap([node('root', null, true), node('x', 'root')]);

        expect(data.arrows()).toEqual([]);
      });

      it('reports the nodes and the arrows as one replacement', () => {
        data.replaceMap(
          [node('root', null, true), node('x', 'root'), node('y', 'root')],
          [{ source: 'x', target: 'y' }]
        );

        expect(changes).toEqual([
          {
            replaced: true,
            added: ['x', 'y'],
            updated: ['root'],
            removed: ['a', 'b', 'c'],
            arrows: ['a:b', 'x:y'],
          },
        ]);
      });

      it('restores the old nodes and arrows with one undo', () => {
        data.replaceMap(
          [node('root', null, true), node('x', 'root'), node('y', 'root')],
          [{ source: 'x', target: 'y' }]
        );

        undoManager.undo();

        expect({
          nodes: Array.from(nodesMap().keys()).sort(),
          arrows: arrowKeys(),
        }).toEqual({ nodes: ['a', 'b', 'c', 'root'], arrows: ['a:b'] });
      });
    });

    describe('from a peer', () => {
      let peer: Y.Doc;
      let peerData: YjsMapData;

      beforeEach(() => {
        peer = new Y.Doc();
        sync(doc, peer);
        peerData = new YjsMapData(peer, () => null);
      });

      afterEach(() => {
        peerData.destroy();
        peer.destroy();
      });

      it('reports an arrow the peer adds, with no undo step', () => {
        peerData.addArrows([{ source: 'a', target: 'b' }]);

        sync(peer, doc);

        expect({
          changes,
          arrows: data.arrows(),
          undoSteps: undoManager.undoStack.length,
        }).toEqual({
          changes: [
            {
              replaced: false,
              added: [],
              updated: [],
              removed: [],
              arrows: ['a:b'],
            },
          ],
          arrows: [{ source: 'a', target: 'b' }],
          undoSteps: 0,
        });
      });

      it('reports an arrow the peer deletes', () => {
        data.addArrows([{ source: 'a', target: 'b' }]);
        sync(doc, peer);
        changes = [];

        peerData.removeArrow('a:b');
        sync(peer, doc);

        expect({
          changes: changes.map(c => c.arrows),
          arrows: data.arrows(),
        }).toEqual({ changes: [['a:b']], arrows: [] });
      });

      describe('an arrow the peer writes field by field', () => {
        let yArrow: Y.Map<unknown>;

        beforeEach(() => {
          yArrow = new Y.Map<unknown>();
          peer.getMap('arrows').set('a:b', yArrow);
          yArrow.set('source', 'a');
          sync(peer, doc);
          changes = [];
        });

        it('reports the key once a later field update completes it', () => {
          yArrow.set('target', 'b');
          sync(peer, doc);

          expect({
            changes: changes.map(change => change.arrows),
            arrows: data.arrows(),
          }).toEqual({
            changes: [['a:b']],
            arrows: [{ source: 'a', target: 'b' }],
          });
        });

        it('reports the key when a later field update breaks it again', () => {
          yArrow.set('target', 'b');
          sync(peer, doc);
          changes = [];

          yArrow.set('target', 'c');
          sync(peer, doc);

          expect({
            changes: changes.map(change => change.arrows),
            arrows: data.arrows(),
          }).toEqual({ changes: [['a:b']], arrows: [] });
        });
      });

      it('returns an arrow the peer adds before its node exists', () => {
        peerData.addArrows([{ source: 'a', target: 'late' }]);
        sync(peer, doc);

        peerData.addNodes([node('late', 'root')]);
        sync(peer, doc);

        expect({
          arrows: data.arrows(),
          lastAdded: lastChange().added,
        }).toEqual({
          arrows: [{ source: 'a', target: 'late' }],
          lastAdded: ['late'],
        });
      });

      it('calls onPeerReplacement for a peer import with arrows', () => {
        const replacements = jest.fn();
        data.onPeerReplacement = replacements;

        peerData.replaceMap(
          [node('root', null, true), node('x', 'root'), node('y', 'root')],
          [{ source: 'x', target: 'y' }]
        );
        sync(peer, doc);

        expect({
          replacements: replacements.mock.calls.length,
          replaced: changes.map(change => change.replaced),
        }).toEqual({ replacements: 1, replaced: [true] });
      });

      it('keeps one arrow when both clients create it at once, and one removal removes it for both', () => {
        data.addArrows([{ source: 'a', target: 'b' }]);
        peerData.addArrows([{ source: 'a', target: 'b' }]);
        sync(doc, peer);
        sync(peer, doc);
        const afterCreate = [data.arrows(), peerData.arrows()];

        peerData.removeArrow('a:b');
        sync(peer, doc);

        expect({ afterCreate, local: data.arrows() }).toEqual({
          afterCreate: [
            [{ source: 'a', target: 'b' }],
            [{ source: 'a', target: 'b' }],
          ],
          local: [],
        });
      });

      describe('an arrow to a node another client removes at once', () => {
        beforeEach(() => {
          data.addNodes([node('a', 'root'), node('b', 'root')]);
          sync(doc, peer);
          data.removeNode('b');
          peerData.addArrows([{ source: 'a', target: 'b' }]);
          sync(doc, peer);
          sync(peer, doc);
        });

        it('stays on both clients as a dangling arrow without its node', () => {
          expect({
            local: [data.arrows(), data.node('b')],
            peer: [peerData.arrows(), peerData.node('b')],
          }).toEqual({
            local: [[{ source: 'a', target: 'b' }], undefined],
            peer: [[{ source: 'a', target: 'b' }], undefined],
          });
        });

        it('connects to its node again on both clients once the removal is undone', () => {
          undoManager.undo();
          sync(doc, peer);

          expect({
            local: [data.arrows(), data.node('b')?.id],
            peer: [peerData.arrows(), peerData.node('b')?.id],
          }).toEqual({
            local: [[{ source: 'a', target: 'b' }], 'b'],
            peer: [[{ source: 'a', target: 'b' }], 'b'],
          });
        });
      });

      it('does not call onPeerReplacement for a peer arrow edit', () => {
        const replacements = jest.fn();
        data.onPeerReplacement = replacements;

        peerData.addArrows([{ source: 'a', target: 'b' }]);
        sync(peer, doc);

        expect(replacements).not.toHaveBeenCalled();
      });
    });
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
