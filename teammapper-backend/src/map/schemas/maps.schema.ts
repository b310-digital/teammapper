import * as v from 'valibot'
import { NodeBasicsSchema } from './node.schema'

export const MapCreateSchema = v.object({
  rootNode: NodeBasicsSchema,
})

export const MapDeleteSchema = v.object({
  adminId: v.nullable(v.string()),
  mapId: v.pipe(v.string(), v.nonEmpty()),
})

export type IMmpClientMapCreateRequest = v.InferOutput<typeof MapCreateSchema>
export type IMmpClientDeleteRequest = v.InferOutput<typeof MapDeleteSchema>
