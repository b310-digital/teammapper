import * as v from 'valibot'
import { SUPPORTED_LANGUAGES } from '../utils/prompts'

export const MermaidCreateSchema = v.object({
  mindmapDescription: v.pipe(v.string(), v.nonEmpty(), v.maxLength(5000)),
  language: v.picklist([...SUPPORTED_LANGUAGES]),
})

export type MermaidCreateInput = v.InferOutput<typeof MermaidCreateSchema>
