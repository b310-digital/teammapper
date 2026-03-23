import * as v from 'valibot'
import { MapCreateSchema, MapDeleteSchema } from './maps.schema'

const validCreateInput = {
  rootNode: {
    name: 'My Map',
    colors: { name: '#fff', background: '#000', branch: null },
    font: { style: null, size: 14, weight: null },
    image: { src: null, size: null },
  },
}

const validDeleteInput = {
  adminId: 'admin-123',
  mapId: 'map-456',
}

describe('MapCreateSchema', () => {
  it('accepts valid input', () => {
    const result = v.safeParse(MapCreateSchema, validCreateInput)
    expect(result.success).toBe(true)
  })

  it('accepts rootNode with empty nested objects', () => {
    const result = v.safeParse(MapCreateSchema, {
      rootNode: { name: 'Test', colors: {}, font: {}, image: {} },
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing rootNode', () => {
    const result = v.safeParse(MapCreateSchema, {})
    expect(result.success).toBe(false)
  })

  it('rejects rootNode with name exceeding 512 characters', () => {
    const result = v.safeParse(MapCreateSchema, {
      rootNode: {
        ...validCreateInput.rootNode,
        name: 'a'.repeat(513),
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-object rootNode', () => {
    const result = v.safeParse(MapCreateSchema, { rootNode: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('accepts null name', () => {
    const result = v.safeParse(MapCreateSchema, {
      rootNode: { ...validCreateInput.rootNode, name: null },
    })
    expect(result.success).toBe(true)
  })
})

describe('MapDeleteSchema', () => {
  it('accepts valid input', () => {
    const result = v.safeParse(MapDeleteSchema, validDeleteInput)
    expect(result.success).toBe(true)
  })

  it('accepts null adminId', () => {
    const result = v.safeParse(MapDeleteSchema, {
      ...validDeleteInput,
      adminId: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing mapId', () => {
    const result = v.safeParse(MapDeleteSchema, { adminId: 'abc' })
    expect(result.success).toBe(false)
  })

  it('rejects empty mapId', () => {
    const result = v.safeParse(MapDeleteSchema, {
      adminId: null,
      mapId: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-string mapId', () => {
    const result = v.safeParse(MapDeleteSchema, {
      adminId: null,
      mapId: 123,
    })
    expect(result.success).toBe(false)
  })
})
