import * as Y from 'yjs'
import {
  applyValidatedMapUpdate,
  MapUpdateOrigin,
  isRejectedMap,
} from './yjsValidation'
import { DEFAULT_YJS_MAP_LIMITS } from './yjsLimits'
import { LOGO_URL } from '../../../test/imageFixtures'

// Capture genuine Yjs updates instead of constructing protocol bytes by hand.
const change = (
  client: Y.Doc,
  edit: () => void,
  transact = true
): Uint8Array => {
  let update: Uint8Array | null = null
  const listener = (value: Uint8Array): void => {
    update = value
  }
  client.on('update', listener)
  try {
    if (transact) client.transact(edit)
    else edit()
  } finally {
    client.off('update', listener)
  }
  if (!update) throw new Error('Expected an update')
  return update
}

describe('applyValidatedMapUpdate', () => {
  let server: Y.Doc
  let client: Y.Doc
  beforeEach(() => {
    server = new Y.Doc()
    client = new Y.Doc()
  })
  afterEach(() => {
    server.destroy()
    client.destroy()
  })

  describe('rejected updates', () => {
    let update: Uint8Array
    let accepted: jest.Mock
    beforeEach(() => {
      accepted = jest.fn()
      server.on('update', (_update: Uint8Array, origin: unknown) => {
        if (origin instanceof MapUpdateOrigin && origin.accepted) accepted()
      })
      update = change(client, () =>
        client.getMap('unused').set('payload', 'data')
      )
    })

    it('marks invalid state for discard', () => {
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
      expect(isRejectedMap(server)).toBe(true)
    })

    it('does not emit an accepted update', () => {
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
      expect(accepted).not.toHaveBeenCalled()
    })

    it('refuses further updates after rejection', () => {
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
    })
  })

  it('accepts node attributes including images', () => {
    const node = new Y.Map<unknown>()
    const update = change(client, () => {
      client.getMap('nodes').set('root', node)
      node.set('id', 'root')
      node.set('parent', null)
      node.set('name', 'Main root')
      node.set('coordinates', { x: 0, y: 0 })
      node.set('image', { src: LOGO_URL, size: 50 })
    })
    applyValidatedMapUpdate(server, update, null)
    expect(server.getMap('nodes').toJSON()).toEqual(
      client.getMap('nodes').toJSON()
    )
  })

  it('accepts map options', () => {
    applyValidatedMapUpdate(
      server,
      change(client, () => client.getMap('mapOptions').set('fontMaxSize', 28)),
      null
    )
    expect(server.getMap('mapOptions').get('fontMaxSize')).toBe(28)
  })

  it('accepts import metadata', () => {
    applyValidatedMapUpdate(
      server,
      change(client, () =>
        client.getMap('meta').set('lastMapAnnouncement', 'import')
      ),
      null
    )
    expect(server.getMap('meta').get('lastMapAnnouncement')).toBe('import')
  })

  describe('node edits', () => {
    let node: Y.Map<unknown>
    let undo: Y.UndoManager
    let edit: Uint8Array
    beforeEach(() => {
      node = new Y.Map<unknown>()
      applyValidatedMapUpdate(
        server,
        change(client, () => {
          client.getMap('nodes').set('root', node)
          node.set('name', 'Root')
        }),
        null
      )
      undo = new Y.UndoManager(client.getMap('nodes'))
      edit = change(client, () => node.set('name', 'Changed'))
      applyValidatedMapUpdate(server, edit, null)
    })
    afterEach(() => undo.destroy())

    it('accepts edits', () => {
      expect(server.getMap('nodes').toJSON()).toEqual({
        root: { name: 'Changed' },
      })
    })
    it('accepts duplicate updates without changing state', () => {
      applyValidatedMapUpdate(server, edit, null)
      expect(server.getMap('nodes').toJSON()).toEqual({
        root: { name: 'Changed' },
      })
    })
    it('accepts undo', () => {
      applyValidatedMapUpdate(
        server,
        change(client, () => undo.undo(), false),
        null
      )
      expect(server.getMap('nodes').toJSON()).toEqual({
        root: { name: 'Root' },
      })
    })
    it('accepts redo', () => {
      applyValidatedMapUpdate(
        server,
        change(client, () => undo.undo(), false),
        null
      )
      applyValidatedMapUpdate(
        server,
        change(client, () => undo.redo(), false),
        null
      )
      expect(server.getMap('nodes').toJSON()).toEqual({
        root: { name: 'Changed' },
      })
    })
    it('accepts deletion', () => {
      applyValidatedMapUpdate(
        server,
        change(client, () => client.getMap('nodes').delete('root')),
        null
      )
      expect(server.getMap('nodes').has('root')).toBe(false)
    })
    it('accepts updates after a deletion leaves tombstones', () => {
      applyValidatedMapUpdate(
        server,
        change(client, () => client.getMap('nodes').delete('root')),
        null
      )
      applyValidatedMapUpdate(
        server,
        change(client, () => client.getMap('nodes').set('other', new Y.Map())),
        null
      )
      expect(server.getMap('nodes').toJSON()).toEqual({ other: {} })
    })
  })

  it('accepts full state from a reconnecting client retaining undo history', () => {
    const node = new Y.Map<unknown>()
    client.getMap('nodes').set('root', node)
    const undo = new Y.UndoManager(client.getMap('nodes'))
    for (let i = 0; i < 3; i++) node.set('name', `Edit ${i}`)
    applyValidatedMapUpdate(server, Y.encodeStateAsUpdate(client), null)
    expect(server.getMap('nodes').toJSON()).toEqual(
      client.getMap('nodes').toJSON()
    )
    undo.destroy()
  })

  it.each(['undo', 'redo'])(
    'accepts %s of a full-map replacement',
    (operation) => {
      const nodes = client.getMap('nodes')
      applyValidatedMapUpdate(
        server,
        change(client, () => nodes.set('original', new Y.Map())),
        null
      )
      const undo = new Y.UndoManager([nodes, client.getMap('meta')])
      applyValidatedMapUpdate(
        server,
        change(client, () => {
          nodes.delete('original')
          nodes.set('replacement', new Y.Map())
          client.getMap('meta').set('lastMapAnnouncement', 'import')
        }),
        null
      )
      applyValidatedMapUpdate(
        server,
        change(client, () => undo.undo(), false),
        null
      )
      if (operation === 'redo') {
        applyValidatedMapUpdate(
          server,
          change(client, () => undo.redo(), false),
          null
        )
      }
      expect(server.getMap('nodes').toJSON()).toEqual(
        operation === 'undo' ? { original: {} } : { replacement: {} }
      )
      undo.destroy()
    }
  )

  it('accepts concurrent edits from clients sharing the same initial state', () => {
    const node = new Y.Map<unknown>()
    applyValidatedMapUpdate(
      server,
      change(client, () => client.getMap('nodes').set('root', node)),
      null
    )
    const peer = new Y.Doc()
    try {
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(client))
      const peerNode: unknown = peer.getMap('nodes').get('root')
      if (!(peerNode instanceof Y.Map)) throw new Error('Expected a node')
      const first = change(client, () => node.set('name', 'First'))
      const second = change(peer, () => peerNode.set('name', 'Second'))
      applyValidatedMapUpdate(server, first, null)
      applyValidatedMapUpdate(server, second, null)
      Y.applyUpdate(client, second)
      expect(server.getMap('nodes').toJSON()).toEqual(
        client.getMap('nodes').toJSON()
      )
    } finally {
      peer.destroy()
    }
  })

  it.each(['unused', 'awareness', '__proto__'])(
    'rejects arbitrary top-level map %s',
    (key) => {
      expect(() =>
        applyValidatedMapUpdate(
          server,
          change(client, () => {
            client.getMap(key).set('payload', 'unrelated data')
          }),
          null
        )
      ).toThrow()
    }
  )

  it('accepts deleted unknown attributes while bounding their retained history', () => {
    const node = new Y.Map<unknown>()
    client.gc = false
    const update = change(client, () => {
      client.getMap('nodes').set('root', node)
      node.set('payload', 'hidden data')
      node.delete('payload')
    })
    applyValidatedMapUpdate(server, update, null)
    expect(server.getMap('nodes').toJSON()).toEqual({ root: {} })
  })

  it.each([
    ['colors', { name: '#fff', payload: 'extra' }],
    ['colors', { name: '#fff', ['__proto__']: { payload: 'hidden data' } }],
    ['coordinates', { x: 0, y: 0, payload: 'extra' }],
    ['font', { size: 'large' }],
    ['name', { payload: 'extra' }],
    ['constructor', 'extra'],
    ['image', ['invalid image']],
  ])('rejects invalid node attribute %s', (key, value) => {
    const node = new Y.Map<unknown>()
    expect(() =>
      applyValidatedMapUpdate(
        server,
        change(client, () => {
          client.getMap('nodes').set('root', node)
          node.set(String(key), value)
        }),
        null
      )
    ).toThrow()
  })

  it.each([
    ['arrays', () => new Y.Array()],
    ['submaps', () => new Y.Doc()],
  ])('rejects %s as nodes', (_name, createValue) => {
    const value = createValue()
    try {
      const update = change(client, () =>
        client.getMap('nodes').set('root', value)
      )
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
    } finally {
      if (value instanceof Y.Doc) value.destroy()
    }
  })

  it('rejects ordinary objects as shared nodes', () => {
    const update = change(client, () =>
      client.getMap('nodes').set('root', { name: 'Root' })
    )
    expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
  })

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects node key %s that JSON validation could omit',
    (key) => {
      const update = change(client, () =>
        client.getMap('nodes').set(key, new Y.Map())
      )
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
    }
  )

  it('validates the entire resulting map', () => {
    const node = new Y.Map<unknown>()
    node.set('payload', 'Existing invalid attribute')
    server.getMap('nodes').set('root', node)
    const update = change(client, () =>
      client.getMap('mapOptions').set('name', 'Updated map')
    )
    expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
  })

  it('rejects updates with missing dependencies', () => {
    const node = new Y.Map<unknown>()
    client.getMap('nodes').set('root', node)
    expect(() =>
      applyValidatedMapUpdate(
        server,
        change(client, () => node.set('name', 'Pending')),
        null
      )
    ).toThrow()
  })

  it('bounds cumulative encoded size across individually small updates', () => {
    const first = change(client, () => {
      const node = new Y.Map<unknown>()
      node.set('name', 'a'.repeat(200))
      client.getMap('nodes').set('one', node)
    })
    applyValidatedMapUpdate(server, first, null)
    const maxBytes = Y.encodeStateAsUpdate(server).byteLength + 50
    const second = change(client, () => {
      const node = new Y.Map<unknown>()
      node.set('name', 'b'.repeat(200))
      client.getMap('nodes').set('two', node)
    })
    expect(second.byteLength).toBeLessThan(maxBytes)
    expect(() =>
      applyValidatedMapUpdate(server, second, null, {
        ...DEFAULT_YJS_MAP_LIMITS,
        maxBytes,
      })
    ).toThrow()
  })

  it('bounds retained history even when the visible node count stays constant', () => {
    const node = new Y.Map<unknown>()
    applyValidatedMapUpdate(
      server,
      change(client, () => client.getMap('nodes').set('root', node)),
      null
    )
    const limits = { ...DEFAULT_YJS_MAP_LIMITS, maxEntries: 3 }
    for (let i = 0; i < 2; i++) {
      applyValidatedMapUpdate(
        server,
        change(client, () => node.set('name', String(i))),
        null,
        limits
      )
    }
    const before = Y.encodeStateAsUpdate(server)
    expect(() =>
      applyValidatedMapUpdate(
        server,
        change(client, () => node.set('name', 'too many')),
        null,
        limits
      )
    ).toThrow()
    expect(Y.encodeStateAsUpdate(server)).toEqual(before)
  })

  it('bounds node count independently of encoded size', () => {
    applyValidatedMapUpdate(
      server,
      change(client, () => client.getMap('nodes').set('one', new Y.Map())),
      null
    )
    const update = change(client, () =>
      client.getMap('nodes').set('two', new Y.Map())
    )
    expect(() =>
      applyValidatedMapUpdate(server, update, null, {
        ...DEFAULT_YJS_MAP_LIMITS,
        maxNodes: 1,
      })
    ).toThrow()
    expect(isRejectedMap(server)).toBe(true)
  })

  it('rejects malformed updates', () => {
    const update = change(client, () =>
      client.getMap('mapOptions').set('name', 'Map name')
    )
    expect(() =>
      applyValidatedMapUpdate(
        server,
        update.slice(0, update.byteLength - 1),
        null
      )
    ).toThrow()
  })
})
