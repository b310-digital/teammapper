import * as Y from 'yjs'
import {
  applyValidatedMapUpdate,
  MapUpdateOrigin,
  isRejectedMap,
  MapUpdateRejectedError,
} from './yjsValidation'
import { arrowKey, MAX_NODE_NAME_LENGTH } from '@teammapper/shared'
import { DEFAULT_YJS_MAP_LIMITS, YjsMapLimits } from './yjsLimits'
import { LOGO_URL } from '../../../test/imageFixtures'

// Applies the update and returns the reason a rejection names, null for an
// accepted update, or any other error the call threw.
const rejectionOf = (
  doc: Y.Doc,
  update: Uint8Array,
  limits: YjsMapLimits = DEFAULT_YJS_MAP_LIMITS
): unknown => {
  try {
    applyValidatedMapUpdate(doc, update, null, limits)
  } catch (error) {
    return error instanceof MapUpdateRejectedError ? error.reason : error
  }
  return null
}

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

    it('names unknownRoot for the first rejection', () => {
      expect(rejectionOf(server, update)).toBe('unknownRoot')
    })

    it('refuses further updates after rejection with mapRejected', () => {
      expect(() => applyValidatedMapUpdate(server, update, null)).toThrow()
      expect(rejectionOf(server, update)).toBe('mapRejected')
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
    'rejects arbitrary top-level map %s as unknownRoot',
    (key) => {
      expect(
        rejectionOf(
          server,
          change(client, () => {
            client.getMap(key).set('payload', 'unrelated data')
          })
        )
      ).toBe('unknownRoot')
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
  ])('rejects invalid node attribute %s as invalidContent', (key, value) => {
    const node = new Y.Map<unknown>()
    expect(
      rejectionOf(
        server,
        change(client, () => {
          client.getMap('nodes').set('root', node)
          node.set(String(key), value)
        })
      )
    ).toBe('invalidContent')
  })

  it('rejects an over-long node name as invalidContent', () => {
    const node = new Y.Map<unknown>()
    const update = change(client, () => {
      client.getMap('nodes').set('root', node)
      node.set('name', 'a'.repeat(MAX_NODE_NAME_LENGTH + 1))
    })
    expect(rejectionOf(server, update)).toBe('invalidContent')
  })

  it('rejects a node whose id field names another node as invalidNode', () => {
    const node = new Y.Map<unknown>()
    const update = change(client, () => {
      client.getMap('nodes').set('A', node)
      node.set('id', 'B')
    })
    expect(rejectionOf(server, update)).toBe('invalidNode')
    expect(isRejectedMap(server)).toBe(true)
  })

  it('rejects a later edit that changes the id field away from the key', () => {
    const node = new Y.Map<unknown>()
    applyValidatedMapUpdate(
      server,
      change(client, () => {
        client.getMap('nodes').set('A', node)
        node.set('id', 'A')
      }),
      null
    )
    const update = change(client, () => node.set('id', 'B'))
    expect(rejectionOf(server, update)).toBe('invalidNode')
  })

  it('accepts a node whose id field matches its key', () => {
    const node = new Y.Map<unknown>()
    applyValidatedMapUpdate(
      server,
      change(client, () => {
        client.getMap('nodes').set('A', node)
        node.set('id', 'A')
      }),
      null
    )
    expect(server.getMap('nodes').toJSON()).toEqual({ A: { id: 'A' } })
  })

  describe('arrows', () => {
    const writeArrow = (key: string, fields: Record<string, unknown>) => {
      const arrow = new Y.Map<unknown>()
      return change(client, () => {
        client.getMap('arrows').set(key, arrow)
        for (const [name, value] of Object.entries(fields))
          arrow.set(name, value)
      })
    }

    it('accepts an arrow with a string source and target', () => {
      applyValidatedMapUpdate(
        server,
        writeArrow('a:b', { source: 'a', target: 'b' }),
        null
      )
      expect(server.getMap('arrows').toJSON()).toEqual({
        'a:b': { source: 'a', target: 'b' },
      })
    })

    it.each([
      ['a numeric source', { source: 1, target: 'b' }],
      ['an object target', { source: 'a', target: { id: 'b' } }],
      ['an unknown field', { source: 'a', target: 'b', label: 'extra' }],
    ])('rejects an arrow with %s as invalidContent', (_name, fields) => {
      // The key matches the fields, so the key check passes and the schema
      // check names the rejection.
      const key = arrowKey(String(fields.source), String(fields.target))
      const update = writeArrow(key, fields)
      expect(rejectionOf(server, update)).toBe('invalidContent')
    })

    it('rejects an arrow entry that is no Y.Map as invalidArrow', () => {
      const update = change(client, () =>
        client.getMap('arrows').set('a:b', { source: 'a', target: 'b' })
      )
      expect(rejectionOf(server, update)).toBe('invalidArrow')
    })

    it('rejects an arrow whose key is not the key of its source and target as invalidArrow', () => {
      const update = writeArrow('a:c', { source: 'a', target: 'b' })
      expect(rejectionOf(server, update)).toBe('invalidArrow')
    })

    it('rejects an arrow whose source is longer than a node id as invalidContent', () => {
      const source = 'a'.repeat(129)
      const update = writeArrow(`${source}:b`, { source, target: 'b' })
      expect(rejectionOf(server, update)).toBe('invalidContent')
    })

    it('rejects an arrow past the arrow limit', () => {
      applyValidatedMapUpdate(
        server,
        writeArrow('a:b', { source: 'a', target: 'b' }),
        null
      )
      const update = writeArrow('b:a', { source: 'b', target: 'a' })
      expect(
        rejectionOf(server, update, {
          ...DEFAULT_YJS_MAP_LIMITS,
          maxArrows: 1,
        })
      ).toBe('tooManyArrows')
    })

    it('keeps the arrow limit low enough for one insert of every arrow', () => {
      // Postgres binds at most 65535 parameters per query, three per arrow row
      expect(DEFAULT_YJS_MAP_LIMITS.maxArrows * 3).toBeLessThanOrEqual(65535)
    })

    it.each(['__proto__', 'constructor', 'prototype'])(
      'rejects arrow key %s that JSON validation could omit as invalidArrow',
      (key) => {
        const update = writeArrow(key, { source: 'a', target: 'b' })
        expect(rejectionOf(server, update)).toBe('invalidArrow')
      }
    )
  })

  it.each([
    ['arrays', () => new Y.Array()],
    ['submaps', () => new Y.Doc()],
  ])('rejects %s as nodes as invalidNode', (_name, createValue) => {
    const value = createValue()
    try {
      const update = change(client, () =>
        client.getMap('nodes').set('root', value)
      )
      expect(rejectionOf(server, update)).toBe('invalidNode')
    } finally {
      if (value instanceof Y.Doc) value.destroy()
    }
  })

  it('rejects ordinary objects as shared nodes as invalidNode', () => {
    const update = change(client, () =>
      client.getMap('nodes').set('root', { name: 'Root' })
    )
    expect(rejectionOf(server, update)).toBe('invalidNode')
  })

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects node key %s that JSON validation could omit as invalidContent',
    (key) => {
      const update = change(client, () =>
        client.getMap('nodes').set(key, new Y.Map())
      )
      expect(rejectionOf(server, update)).toBe('invalidContent')
    }
  )

  it('validates the entire resulting map', () => {
    const node = new Y.Map<unknown>()
    node.set('payload', 'Existing invalid attribute')
    server.getMap('nodes').set('root', node)
    const update = change(client, () =>
      client.getMap('mapOptions').set('name', 'Updated map')
    )
    expect(rejectionOf(server, update)).toBe('invalidContent')
  })

  it('rejects updates with missing dependencies as incompleteUpdate', () => {
    const node = new Y.Map<unknown>()
    client.getMap('nodes').set('root', node)
    expect(
      rejectionOf(
        server,
        change(client, () => node.set('name', 'Pending'))
      )
    ).toBe('incompleteUpdate')
  })

  it('rejects an incoming update past the map size limit as mapTooLarge', () => {
    const update = change(client, () => {
      const node = new Y.Map<unknown>()
      node.set('name', 'a'.repeat(200))
      client.getMap('nodes').set('one', node)
    })
    expect(
      rejectionOf(server, update, {
        ...DEFAULT_YJS_MAP_LIMITS,
        maxBytes: update.byteLength - 1,
      })
    ).toBe('mapTooLarge')
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
    expect(
      rejectionOf(server, second, { ...DEFAULT_YJS_MAP_LIMITS, maxBytes })
    ).toBe('mapTooLarge')
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
    expect(
      rejectionOf(
        server,
        change(client, () => node.set('name', 'too many')),
        limits
      )
    ).toBe('tooManyEntries')
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
    expect(
      rejectionOf(server, update, { ...DEFAULT_YJS_MAP_LIMITS, maxNodes: 1 })
    ).toBe('tooManyNodes')
    expect(isRejectedMap(server)).toBe(true)
  })

  it('rejects malformed updates as malformedUpdate', () => {
    const update = change(client, () =>
      client.getMap('mapOptions').set('name', 'Map name')
    )
    expect(rejectionOf(server, update.slice(0, update.byteLength - 1))).toBe(
      'malformedUpdate'
    )
  })

  it('rejects bytes that are no update as malformedUpdate and marks the map', () => {
    expect(rejectionOf(server, new TextEncoder().encode('not an update'))).toBe(
      'malformedUpdate'
    )
    expect(isRejectedMap(server)).toBe(true)
  })

  it('passes the Yjs error on as the cause of a malformedUpdate', () => {
    let thrown: unknown = null
    try {
      applyValidatedMapUpdate(
        server,
        new TextEncoder().encode('not an update'),
        null
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(MapUpdateRejectedError)
    expect(thrown).toHaveProperty('cause', expect.any(Error))
  })
})
