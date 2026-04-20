import * as v from 'valibot'
import {
  JoinSchema,
  EditingRequestSchema,
  CheckModificationSecretSchema,
  NodeSelectionSchema,
  NodeRequestSchema,
  NodeRemoveRequestSchema,
  NodeAddRequestSchema,
  UpdateMapOptionsSchema,
  MapRequestSchema,
  UndoRedoRequestSchema,
  DeleteRequestSchema,
  MapDiffSchema,
  validateWsPayload,
} from './gateway.schema'

describe('JoinSchema', () => {
  it('accepts valid input', () => {
    const result = v.safeParse(JoinSchema, { mapId: 'abc', color: '#fff' })
    expect(result.success).toBe(true)
  })

  it('rejects empty mapId', () => {
    const result = v.safeParse(JoinSchema, { mapId: '', color: '#fff' })
    expect(result.success).toBe(false)
  })

  it('rejects empty color', () => {
    const result = v.safeParse(JoinSchema, { mapId: 'abc', color: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(v.safeParse(JoinSchema, {}).success).toBe(false)
  })
})

describe('EditingRequestSchema / CheckModificationSecretSchema', () => {
  it('accepts valid input', () => {
    const result = v.safeParse(EditingRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
    })
    expect(result.success).toBe(true)
  })

  it('CheckModificationSecretSchema is the same schema', () => {
    expect(CheckModificationSecretSchema).toBe(EditingRequestSchema)
  })

  it('rejects empty mapId', () => {
    const result = v.safeParse(EditingRequestSchema, {
      mapId: '',
      modificationSecret: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('accepts empty modificationSecret', () => {
    const result = v.safeParse(EditingRequestSchema, {
      mapId: 'abc',
      modificationSecret: '',
    })
    expect(result.success).toBe(true)
  })
})

describe('NodeSelectionSchema', () => {
  it('accepts valid input', () => {
    const result = v.safeParse(NodeSelectionSchema, {
      mapId: 'abc',
      nodeId: 'node-1',
      selected: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-boolean selected', () => {
    const result = v.safeParse(NodeSelectionSchema, {
      mapId: 'abc',
      nodeId: 'node-1',
      selected: 'yes',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty nodeId', () => {
    const result = v.safeParse(NodeSelectionSchema, {
      mapId: 'abc',
      nodeId: '',
      selected: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('NodeRequestSchema', () => {
  it('accepts valid input with partial node', () => {
    const result = v.safeParse(NodeRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      node: { id: 'node-1', name: 'Updated' },
      updatedProperty: 'name',
    })
    expect(result.success).toBe(true)
  })

  it('rejects node without id', () => {
    const result = v.safeParse(NodeRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      node: { name: 'No ID' },
      updatedProperty: 'name',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing updatedProperty', () => {
    const result = v.safeParse(NodeRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      node: { id: 'node-1' },
    })
    expect(result.success).toBe(false)
  })
})

describe('NodeRemoveRequestSchema', () => {
  it('accepts valid input without updatedProperty', () => {
    const result = v.safeParse(NodeRemoveRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      node: { id: 'node-1' },
    })
    expect(result.success).toBe(true)
  })
})

describe('NodeAddRequestSchema', () => {
  it('accepts nodes with partial fields', () => {
    const result = v.safeParse(NodeAddRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      nodes: [
        { id: 'node-1', name: 'Node', coordinates: { x: 1, y: 2 } },
        { name: 'Node 2' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty nodes in array', () => {
    const result = v.safeParse(NodeAddRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      nodes: [{}],
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing nodes array', () => {
    const result = v.safeParse(NodeAddRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateMapOptionsSchema', () => {
  it('accepts full options', () => {
    const result = v.safeParse(UpdateMapOptionsSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      options: { fontMaxSize: 24, fontMinSize: 10, fontIncrement: 2 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty options', () => {
    const result = v.safeParse(UpdateMapOptionsSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      options: {},
    })
    expect(result.success).toBe(true)
  })
})

describe('MapRequestSchema', () => {
  it('accepts partial map', () => {
    const result = v.safeParse(MapRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      map: { uuid: 'map-1' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty map', () => {
    const result = v.safeParse(MapRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      map: {},
    })
    expect(result.success).toBe(true)
  })
})

describe('UndoRedoRequestSchema', () => {
  it('accepts valid diff', () => {
    const result = v.safeParse(UndoRedoRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      diff: { added: {}, deleted: {}, updated: {} },
    })
    expect(result.success).toBe(true)
  })

  it('accepts diff with partial node entries', () => {
    const result = v.safeParse(UndoRedoRequestSchema, {
      mapId: 'abc',
      modificationSecret: 'secret',
      diff: {
        added: {},
        deleted: {},
        updated: { 'node-1': { name: 'Updated' } },
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('DeleteRequestSchema', () => {
  it('accepts valid input', () => {
    const result = v.safeParse(DeleteRequestSchema, {
      adminId: 'admin',
      mapId: 'map-1',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null adminId', () => {
    const result = v.safeParse(DeleteRequestSchema, {
      adminId: null,
      mapId: 'map-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty mapId', () => {
    const result = v.safeParse(DeleteRequestSchema, {
      adminId: null,
      mapId: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('MapDiffSchema', () => {
  it('accepts empty diff', () => {
    const result = v.safeParse(MapDiffSchema, {
      added: {},
      deleted: {},
      updated: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing sections', () => {
    expect(v.safeParse(MapDiffSchema, {}).success).toBe(false)
  })
})

describe('validateWsPayload', () => {
  const createMockClient = () => {
    const emitted: { event: string; data: unknown }[] = []
    return {
      emit: (event: string, data: unknown) => {
        emitted.push({ event, data })
      },
      emitted,
    }
  }

  it('returns parsed output on valid data', () => {
    const client = createMockClient()
    const result = validateWsPayload(client as never, JoinSchema, {
      mapId: 'abc',
      color: '#fff',
    })
    expect(result).toEqual({ mapId: 'abc', color: '#fff' })
    expect(client.emitted).toHaveLength(0)
  })

  it('emits exception and returns null on invalid data', () => {
    const client = createMockClient()
    const result = validateWsPayload(client as never, JoinSchema, {})
    expect(result).toBeNull()
    expect(client.emitted).toHaveLength(1)
    expect(client.emitted[0].event).toBe('exception')
  })

  it('includes issues in the exception payload', () => {
    const client = createMockClient()
    validateWsPayload(client as never, JoinSchema, { mapId: '' })
    const payload = client.emitted[0].data as {
      message: string
      issues: unknown[]
    }
    expect(payload.message).toBe('Invalid payload')
    expect(payload.issues.length).toBeGreaterThan(0)
  })
})
