const MAX_NODE_COUNT = 20

export interface MermaidValidationResult {
  readonly isValid: boolean
  readonly isEmpty: boolean
  readonly nodeCount: number
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

function buildEmptyResult(): MermaidValidationResult {
  return {
    isValid: false,
    isEmpty: true,
    nodeCount: 0,
    errors: [],
    warnings: [],
  }
}

function validateFirstLine(line: string, errors: string[]): void {
  if (line.trim() !== 'mindmap') {
    errors.push(
      `First non-empty line must be exactly "mindmap", got: "${line.trim()}"`
    )
  }
}

function countLeadingSpaces(line: string): number {
  return line.length - line.trimStart().length
}

function checkNodeCount(count: number, warnings: string[]): void {
  if (count > MAX_NODE_COUNT) {
    warnings.push(
      `Node count ${count} exceeds recommended maximum of ${MAX_NODE_COUNT}`
    )
  }
}

function checkNodeContent(content: string, warnings: string[]): void {
  const forbidden = ['"', '`', '<', '>', '{', '}']
  const found = forbidden.filter((ch) => content.includes(ch))
  if (found.length > 0) {
    warnings.push(
      `Node contains special characters (${found.join(', ')}): "${content.trim()}"`
    )
  }
}

function validateIndentation(lines: string[], errors: string[]): void {
  lines.forEach((line) => {
    if (line.includes('\t')) {
      errors.push(`Tab character found in node line: "${line}"`)
    } else if (countLeadingSpaces(line) === 0) {
      errors.push(`Node line has zero indentation: "${line}"`)
    }
  })
}

function validateNodeLines(
  lines: string[],
  errors: string[],
  warnings: string[]
): void {
  validateIndentation(lines, errors)
  lines.forEach((line) => checkNodeContent(line, warnings))
}

// Validates a Mermaid mindmap string and returns a structured result
export function validateMermaidMindmap(input: string): MermaidValidationResult {
  const lines = input.split('\n').filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return buildEmptyResult()
  }

  const errors: string[] = []
  const warnings: string[] = []

  validateFirstLine(lines[0], errors)

  const nodeLines = lines.slice(1)
  validateNodeLines(nodeLines, errors, warnings)

  checkNodeCount(nodeLines.length, warnings)

  return {
    isValid: errors.length === 0,
    isEmpty: false,
    nodeCount: nodeLines.length,
    errors,
    warnings,
  }
}
