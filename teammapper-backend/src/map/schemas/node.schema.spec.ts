import * as v from 'valibot'
import {
  NodeSchema,
  NodeBasicsSchema,
  ColorSchema,
  FontSchema,
  CoordinatesSchema,
  ImageSchema,
  LinkSchema,
} from './node.schema'

const validNode = {
  id: 'abc-123',
  name: 'Test Node',
  coordinates: { x: 10, y: 20 },
  colors: { name: '#fff', background: '#000', branch: '#ccc' },
  font: { style: 'normal', size: 14, weight: 'bold' },
  image: { src: null, size: null },
  link: { href: null },
  detached: false,
  k: 1.5,
  locked: false,
  parent: null,
  isRoot: true,
}

const validNodeBasics = {
  name: 'Root',
  colors: { name: '#fff', background: null, branch: null },
  font: { style: null, size: null, weight: null },
  image: { src: null, size: null },
}

describe('NodeSchema', () => {
  it('accepts a valid full node', () => {
    const result = v.safeParse(NodeSchema, validNode)
    expect(result.success).toBe(true)
  })

  it('rejects node with empty id', () => {
    const result = v.safeParse(NodeSchema, { ...validNode, id: '' })
    expect(result.success).toBe(false)
  })

  it('rejects node with non-string id', () => {
    const result = v.safeParse(NodeSchema, { ...validNode, id: 42 })
    expect(result.success).toBe(false)
  })

  it('rejects node name exceeding 5000 characters', () => {
    const result = v.safeParse(NodeSchema, {
      ...validNode,
      name: 'a'.repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  it('accepts node name at exactly 5000 characters', () => {
    const result = v.safeParse(NodeSchema, {
      ...validNode,
      name: 'a'.repeat(5000),
    })
    expect(result.success).toBe(true)
  })

  it('accepts null name', () => {
    const result = v.safeParse(NodeSchema, { ...validNode, name: null })
    expect(result.success).toBe(true)
  })

  it('accepts empty nested objects (colors, font, image, link)', () => {
    const result = v.safeParse(NodeSchema, {
      ...validNode,
      colors: {},
      font: {},
      image: {},
      link: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-boolean detached', () => {
    const result = v.safeParse(NodeSchema, { ...validNode, detached: 'yes' })
    expect(result.success).toBe(false)
  })

  it('rejects non-number coordinates', () => {
    const result = v.safeParse(NodeSchema, {
      ...validNode,
      coordinates: { x: 'a', y: 'b' },
    })
    expect(result.success).toBe(false)
  })
})

describe('NodeBasicsSchema', () => {
  it('accepts valid node basics', () => {
    const result = v.safeParse(NodeBasicsSchema, validNodeBasics)
    expect(result.success).toBe(true)
  })

  it('accepts empty nested objects', () => {
    const result = v.safeParse(NodeBasicsSchema, {
      name: 'Test',
      colors: {},
      font: {},
      image: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing colors', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { colors, ...without } = validNodeBasics
    const result = v.safeParse(NodeBasicsSchema, without)
    expect(result.success).toBe(false)
  })

  it('rejects name exceeding 5000 characters', () => {
    const result = v.safeParse(NodeBasicsSchema, {
      ...validNodeBasics,
      name: 'a'.repeat(5001),
    })
    expect(result.success).toBe(false)
  })
})

describe('ColorSchema', () => {
  it('accepts empty object', () => {
    expect(v.safeParse(ColorSchema, {}).success).toBe(true)
  })

  it('accepts all null values', () => {
    expect(
      v.safeParse(ColorSchema, { name: null, background: null, branch: null })
        .success
    ).toBe(true)
  })

  it('accepts valid hex colors', () => {
    expect(
      v.safeParse(ColorSchema, {
        name: '#fff',
        background: '#000000',
        branch: '#aaBBcc',
      }).success
    ).toBe(true)
  })

  it('rejects non-hex color strings', () => {
    expect(v.safeParse(ColorSchema, { name: 'red' }).success).toBe(false)
  })

  it('rejects CSS injection attempts', () => {
    expect(
      v.safeParse(ColorSchema, { name: 'expression(alert(1))' }).success
    ).toBe(false)
  })

  it('rejects non-string color', () => {
    expect(v.safeParse(ColorSchema, { name: 123 }).success).toBe(false)
  })
})

describe('FontSchema', () => {
  it('accepts empty object', () => {
    expect(v.safeParse(FontSchema, {}).success).toBe(true)
  })

  it('rejects non-number size', () => {
    expect(v.safeParse(FontSchema, { size: 'big' }).success).toBe(false)
  })
})

describe('ImageSchema', () => {
  it('accepts null src', () => {
    expect(v.safeParse(ImageSchema, { src: null }).success).toBe(true)
  })

  it('accepts valid data URI', () => {
    expect(
      v.safeParse(ImageSchema, { src: 'data:image/png;base64,abc' }).success
    ).toBe(true)
  })

  it('rejects src exceeding 2MB', () => {
    expect(
      v.safeParse(ImageSchema, { src: 'a'.repeat(2_000_001) }).success
    ).toBe(false)
  })

  it('accepts empty object', () => {
    expect(v.safeParse(ImageSchema, {}).success).toBe(true)
  })
})

describe('LinkSchema', () => {
  it('accepts null href', () => {
    expect(v.safeParse(LinkSchema, { href: null }).success).toBe(true)
  })

  it('accepts https URL', () => {
    expect(
      v.safeParse(LinkSchema, { href: 'https://example.com' }).success
    ).toBe(true)
  })

  it('accepts http URL', () => {
    expect(
      v.safeParse(LinkSchema, { href: 'http://example.com' }).success
    ).toBe(true)
  })

  it('rejects javascript: URL', () => {
    expect(
      v.safeParse(LinkSchema, { href: 'javascript:alert(1)' }).success
    ).toBe(false)
  })

  it('rejects data: URL', () => {
    expect(
      v.safeParse(LinkSchema, { href: 'data:text/html,<script>' }).success
    ).toBe(false)
  })

  it('accepts empty object', () => {
    expect(v.safeParse(LinkSchema, {}).success).toBe(true)
  })
})

describe('CoordinatesSchema', () => {
  it('accepts valid coordinates', () => {
    expect(v.safeParse(CoordinatesSchema, { x: 1, y: 2 }).success).toBe(true)
  })

  it('rejects missing x', () => {
    expect(v.safeParse(CoordinatesSchema, { y: 2 }).success).toBe(false)
  })

  it('rejects non-number values', () => {
    expect(v.safeParse(CoordinatesSchema, { x: 'a', y: 2 }).success).toBe(false)
  })
})
