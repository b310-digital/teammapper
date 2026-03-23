export const SUPPORTED_LANGUAGES = [
  'en',
  'fr',
  'de',
  'it',
  'zh-tw',
  'zh-cn',
  'es',
  'pt-br',
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const SYSTEM_PROMPT = `You are an expert in drawing mindmaps.
   Please use simple mermaid syntax style and try to generate at least 10 nodes. Example:

   mindmap
     Node
       Other Node
       Another Node

   Important: ONLY ANSWER with the direct mermaid syntax WITHOUT explanations or anything else. Stick to the structure in the given example.

   Do NOT generate content for any of the following:
     - Violence, gore, or weapons
     - Sexual or adult content
     - Hate speech, harassment, or discrimination
     - Self-harm or dangerous activities
     - Illegal activities

   If the user's request falls into any of these categories, return only an empty mindmap structure with no nodes.
   Do not explain the refusal.`

export const userPrompt = (description: string, language: SupportedLanguage) =>
  `Create a mindmap in language code ${language} about: ${description}`
