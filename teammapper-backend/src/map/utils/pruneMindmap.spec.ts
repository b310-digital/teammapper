import { pruneMindmap } from './pruneMindmap'

const lines = (...rows: string[]) => rows.join('\n')

describe('pruneMindmap', () => {
  it('keeps a map that already fits the shape', () => {
    const mermaid = lines('mindmap', '  Root', '    A', '      A1', '    B')

    expect(pruneMindmap(mermaid, { levels: 2, childrenPerNode: 2 })).toBe(
      mermaid
    )
  })

  it('drops the root children beyond the limit with their subtrees', () => {
    const mermaid = lines(
      'mindmap',
      '  Root',
      '    A',
      '      A1',
      '    B',
      '    C',
      '      C1',
      '    D'
    )

    expect(pruneMindmap(mermaid, { levels: 2, childrenPerNode: 2 })).toBe(
      lines('mindmap', '  Root', '    A', '      A1', '    B')
    )
  })

  it('drops nodes deeper than the requested levels', () => {
    const mermaid = lines(
      'mindmap',
      '  Root',
      '    A',
      '      A1',
      '        A1a',
      '    B'
    )

    expect(pruneMindmap(mermaid, { levels: 1, childrenPerNode: 4 })).toBe(
      lines('mindmap', '  Root', '    A', '    B')
    )
  })

  it('counts children per parent, not per level', () => {
    const mermaid = lines(
      'mindmap',
      '  Root',
      '    A',
      '      A1',
      '      A2',
      '    B',
      '      B1',
      '      B2'
    )

    expect(pruneMindmap(mermaid, { levels: 2, childrenPerNode: 1 })).toBe(
      lines('mindmap', '  Root', '    A', '      A1')
    )
  })

  it('reads indentation of any width and tabs', () => {
    const mermaid = lines('mindmap', 'Root', '\tA', '\t\tA1', '\tB')

    expect(pruneMindmap(mermaid, { levels: 1, childrenPerNode: 1 })).toBe(
      lines('mindmap', 'Root', '\tA')
    )
  })

  it('drops the decorations of a dropped node and keeps the others', () => {
    const mermaid = lines(
      'mindmap',
      '  Root',
      '    A',
      '    ::icon(fa fa-book)',
      '    B',
      '    ::icon(fa fa-pen)'
    )

    expect(pruneMindmap(mermaid, { levels: 1, childrenPerNode: 1 })).toBe(
      lines('mindmap', '  Root', '    A', '    ::icon(fa fa-book)')
    )
  })

  it('drops every top-level node after the root with its subtree', () => {
    const mermaid = lines(
      'mindmap',
      '  Root',
      '    A',
      '  Second',
      '    B',
      'Trailing prose'
    )

    expect(pruneMindmap(mermaid, { levels: 2, childrenPerNode: 4 })).toBe(
      lines('mindmap', '  Root', '    A')
    )
  })

  it('prunes every mindmap block on its own', () => {
    const mermaid = lines(
      'mindmap',
      '  One',
      '    A',
      '    B',
      'mindmap',
      '  Two',
      '    C',
      '    D'
    )

    expect(pruneMindmap(mermaid, { levels: 1, childrenPerNode: 1 })).toBe(
      lines('mindmap', '  One', '    A', 'mindmap', '  Two', '    C')
    )
  })

  it('drops the lines before the first mindmap header', () => {
    const mermaid = lines(
      'Here is your map:',
      '```mermaid',
      'mindmap',
      '  Root'
    )

    expect(pruneMindmap(mermaid, { levels: 1, childrenPerNode: 1 })).toBe(
      lines('mindmap', '  Root')
    )
  })

  it('returns nothing for text without a mindmap header', () => {
    const mermaid = lines('Root', '  A', '  B')

    expect(pruneMindmap(mermaid, { levels: 1, childrenPerNode: 1 })).toBe('')
  })
})
