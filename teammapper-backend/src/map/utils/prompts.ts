import { z } from 'zod'

export const systemPrompt = (language: string = 'english') =>
  `You are an expert in mindmaps. Please create the mindmap in the ${language} language in mermaid syntax style. If the topic includes inappropriate topics like violance or similar, please return an empty string.`

export const mermaidMindmapSchema = z.object({
  mindmap: z.string().describe('a mindmap given in mermaid style'),
})
