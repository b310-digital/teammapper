import * as v from 'valibot'
import { NodeBasicsSchema } from './node.schema'

export const MapOptionsSchema = v.partial(
  v.object({
    fontMaxSize: v.number(),
    fontMinSize: v.number(),
    fontIncrement: v.number(),
  })
)

export const MapCreateSchema = v.object({
  rootNode: NodeBasicsSchema,
})

export const MapDeleteSchema = v.object({
  adminId: v.pipe(v.string(), v.nonEmpty()),
})

export type IMmpClientMapOptions = v.InferOutput<typeof MapOptionsSchema>
export type IMmpClientMapCreateRequest = v.InferOutput<typeof MapCreateSchema>
export type IMmpClientDeleteRequest = v.InferOutput<typeof MapDeleteSchema>
