import {
  AI_CHILDREN_PER_NODE,
  AI_LEVELS,
  AiMapShape,
  SupportedLanguage,
} from '@teammapper/shared'

export const DEFAULT_AI_MAP_SHAPE: AiMapShape = {
  levels: AI_LEVELS.default,
  childrenPerNode: AI_CHILDREN_PER_NODE.default,
}

/**
 * Writes an example map with exactly the requested shape, so the model copies
 * the node count along with the syntax. A fixed example pulls the answer
 * towards its own shape instead.
 */
const exampleMap = ({ levels, childrenPerNode }: AiMapShape): string => {
  const branch = (label: string, level: number): string[] => {
    const line = `${'  '.repeat(level + 1)}${label}`
    if (level === levels) return [line]
    const children = Array.from({ length: childrenPerNode }, (_, i) =>
      branch(level === 0 ? `Subtopic ${i + 1}` : `${label}.${i + 1}`, level + 1)
    )
    return [line, ...children.flat()]
  }
  // Indent every line like the rest of the prompt template.
  return ['mindmap', ...branch('Root Topic', 0)]
    .map((line) => `   ${line}`)
    .join('\n')
}

// The shape values reach this function only after MermaidCreateSchema has
// validated them as small integers, so no user text enters the system prompt.
export const systemPrompt = (shape: AiMapShape) =>
  `You are an expert in drawing mindmaps.
   The user provides a topic in <topic> tags. Create a helpful mindmap about it in the language specified by the lang attribute.
   Please use simple mermaid syntax style.

   <example>
${exampleMap(shape)}
   </example>

   <format_rules>
   - ONLY ANSWER with the direct mermaid syntax WITHOUT explanations or anything else. Stick to the syntax and the shape of the given example.
   - Do NOT wrap the output in markdown code fences (\`\`\`mermaid or \`\`\`). Start your response directly with "mindmap".
   - Do NOT use special characters such as ", <, >, {, } or backticks in node labels — paraphrase instead.
   - Use exactly ${shape.levels} levels of nodes below the root. Count the root's children as level 1. Do not add further nesting levels.
   - Give every node no more than ${shape.childrenPerNode} child nodes. The root node obeys the same limit: give it no more than ${shape.childrenPerNode} children.
   - Replace the example labels with labels about the topic.
   </format_rules>

   <content_policy>
   Do NOT generate content for any of the following:
     - Violence, gore, or weapons
     - Sexual or adult content
     - Hate speech, harassment, or discrimination
     - Self-harm or dangerous activities
     - Illegal activities

   If the user's request falls into any of these categories, return only an empty mindmap structure with no nodes.
   Do not explain the refusal.
   </content_policy>`

export const userPrompt = (description: string, language: SupportedLanguage) =>
  `<topic lang="${language}">${description}</topic>`
