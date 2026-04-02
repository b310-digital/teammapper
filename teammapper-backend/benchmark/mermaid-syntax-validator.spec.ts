import { validateMermaidMindmap } from './mermaid-syntax-validator'

describe('validateMermaidMindmap', () => {
  it('returns isEmpty: true and isValid: false with nodeCount 0 for empty string', () => {
    const result = validateMermaidMindmap('')
    expect(result.isEmpty).toBe(true)
    expect(result.isValid).toBe(false)
    expect(result.nodeCount).toBe(0)
  })

  it('returns isEmpty: true for whitespace-only string', () => {
    const result = validateMermaidMindmap('   \n  \n')
    expect(result.isEmpty).toBe(true)
  })

  it('returns isValid: false with at least one error when mindmap keyword is missing', () => {
    const result = validateMermaidMindmap('Root\n  Child')
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
  })

  it('returns isValid: true and nodeCount 1 for minimal valid mindmap', () => {
    const result = validateMermaidMindmap('mindmap\n  Root')
    expect(result.isValid).toBe(true)
    expect(result.nodeCount).toBe(1)
  })

  it('counts root plus 3 children as nodeCount 4', () => {
    const input = 'mindmap\n  Root\n    Child1\n    Child2\n    Child3'
    const result = validateMermaidMindmap(input)
    expect(result.nodeCount).toBe(4)
  })

  it('returns isValid: false with an error mentioning tab when tab indentation is used', () => {
    const input = 'mindmap\n\tRoot'
    const result = validateMermaidMindmap(input)
    expect(result.isValid).toBe(false)
    const hasTabError = result.errors.some((e) =>
      e.toLowerCase().includes('tab')
    )
    expect(hasTabError).toBe(true)
  })

  it('returns isValid: true with at least one warning when node contains double quotes', () => {
    const input = 'mindmap\n  Root "quoted"'
    const result = validateMermaidMindmap(input)
    expect(result.isValid).toBe(true)
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
  })

  it('returns isValid: true with no warnings for German umlauts in nodes', () => {
    const input = 'mindmap\n  Übersicht\n    Bäume\n    Vögel'
    const result = validateMermaidMindmap(input)
    expect(result.isValid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('returns nodeCount 12 and isValid: true for a valid mindmap with 12 nodes', () => {
    const children = Array.from(
      { length: 11 },
      (_, i) => `    Child${i + 1}`
    ).join('\n')
    const input = `mindmap\n  Root\n${children}`
    const result = validateMermaidMindmap(input)
    expect(result.nodeCount).toBe(12)
    expect(result.isValid).toBe(true)
  })
})
