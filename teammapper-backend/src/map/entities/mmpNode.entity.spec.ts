import { validate } from 'class-validator'
import { MmpNode } from './mmpNode.entity'

const buildValidNode = (): MmpNode => {
  const node = new MmpNode()
  node.id = '00000000-0000-0000-0000-000000000001'
  node.name = 'Test'
  node.root = false
  node.coordinatesX = 0
  node.coordinatesY = 0
  node.detached = false
  node.nodeMapId = '00000000-0000-0000-0000-000000000002'
  node.orderNumber = 1
  return node
}

describe('MmpNode MaxLength validation', () => {
  it('should pass validation with valid field lengths', async () => {
    const node = buildValidNode()
    const errors = await validate(node)
    expect(errors).toHaveLength(0)
  })

  it('should fail validation when name exceeds 512 characters', async () => {
    const node = buildValidNode()
    node.name = 'a'.repeat(513)
    const errors = await validate(node)
    expect(errors.some((e) => e.property === 'name')).toBe(true)
  })

  it('should fail validation when imageSrc exceeds 200000 characters', async () => {
    const node = buildValidNode()
    node.imageSrc = 'a'.repeat(200001)
    const errors = await validate(node)
    expect(errors.some((e) => e.property === 'imageSrc')).toBe(true)
  })

  it('should fail validation when linkHref exceeds 2048 characters', async () => {
    const node = buildValidNode()
    node.linkHref = 'a'.repeat(2049)
    const errors = await validate(node)
    expect(errors.some((e) => e.property === 'linkHref')).toBe(true)
  })

  it('should fail validation when color field exceeds 9 characters', async () => {
    const node = buildValidNode()
    node.colorsName = 'a'.repeat(10)
    const errors = await validate(node)
    expect(errors.some((e) => e.property === 'colorsName')).toBe(true)
  })

  it('should fail validation when fontStyle exceeds 20 characters', async () => {
    const node = buildValidNode()
    node.fontStyle = 'a'.repeat(21)
    const errors = await validate(node)
    expect(errors.some((e) => e.property === 'fontStyle')).toBe(true)
  })
})
