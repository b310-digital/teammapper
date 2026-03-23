import * as v from 'valibot'
import { NodeSchema } from './node.schema'
import type { Socket } from 'socket.io'

// --- Base schemas ---

export const JoinSchema = v.object({
  mapId: v.pipe(v.string(), v.nonEmpty()),
  color: v.pipe(v.string(), v.nonEmpty()),
})

export const EditingRequestSchema = v.object({
  modificationSecret: v.string(),
  mapId: v.pipe(v.string(), v.nonEmpty()),
})

export const CheckModificationSecretSchema = EditingRequestSchema

export const NodeSelectionSchema = v.object({
  mapId: v.pipe(v.string(), v.nonEmpty()),
  nodeId: v.pipe(v.string(), v.nonEmpty()),
  selected: v.boolean(),
})

// --- EditGuard-protected schemas ---

export const MapOptionsSchema = v.partial(
  v.object({
    fontMaxSize: v.number(),
    fontMinSize: v.number(),
    fontIncrement: v.number(),
  })
)

// For update/remove operations, node can be partial (only id is required)
const PartialNodeWithIdSchema = v.object({
  ...v.partial(NodeSchema).entries,
  id: v.pipe(v.string(), v.nonEmpty()),
})

export const NodeRequestSchema = v.object({
  ...EditingRequestSchema.entries,
  node: PartialNodeWithIdSchema,
  updatedProperty: v.string(),
})

export const NodeRemoveRequestSchema = v.object({
  ...EditingRequestSchema.entries,
  node: PartialNodeWithIdSchema,
})

export const NodeAddRequestSchema = v.object({
  ...EditingRequestSchema.entries,
  nodes: v.array(v.partial(NodeSchema)),
})

export const UpdateMapOptionsSchema = v.object({
  ...EditingRequestSchema.entries,
  options: MapOptionsSchema,
})

export const SnapshotChangesSchema = v.record(
  v.string(),
  v.optional(v.partial(NodeSchema))
)

export const MapDiffSchema = v.object({
  added: SnapshotChangesSchema,
  deleted: SnapshotChangesSchema,
  updated: SnapshotChangesSchema,
})

const DateLikeSchema = v.union([v.string(), v.number(), v.date()])

// MapSchema validates structure but allows partial data — the service layer
// handles business validation and missing field errors
export const MapSchema = v.partial(
  v.object({
    uuid: v.string(),
    lastModified: v.nullable(DateLikeSchema),
    lastAccessed: v.nullable(DateLikeSchema),
    deleteAfterDays: v.number(),
    deletedAt: DateLikeSchema,
    data: v.array(NodeSchema),
    options: MapOptionsSchema,
    createdAt: v.nullable(DateLikeSchema),
    writable: v.boolean(),
  })
)

export const MapRequestSchema = v.object({
  ...EditingRequestSchema.entries,
  map: MapSchema,
})

export const UndoRedoRequestSchema = v.object({
  ...EditingRequestSchema.entries,
  diff: MapDiffSchema,
})

export const DeleteRequestSchema = v.object({
  adminId: v.nullable(v.string()),
  mapId: v.pipe(v.string(), v.nonEmpty()),
})

// --- Inferred types ---

export type IMmpClientJoinRequest = v.InferOutput<typeof JoinSchema>
export type IMmpClientEditingRequest = v.InferOutput<
  typeof EditingRequestSchema
>
export type IMmpClientNodeRequest = v.InferOutput<typeof NodeRequestSchema>
export type IMmpClientNodeAddRequest = v.InferOutput<
  typeof NodeAddRequestSchema
>
export type IMmpClientNodeSelectionRequest = v.InferOutput<
  typeof NodeSelectionSchema
>
export type IMmpClientUpdateMapOptionsRequest = v.InferOutput<
  typeof UpdateMapOptionsSchema
>
export type IMmpClientMapOptions = v.InferOutput<typeof MapOptionsSchema>
export type IMmpClientMapRequest = v.InferOutput<typeof MapRequestSchema>
export type IMmpClientUndoRedoRequest = v.InferOutput<
  typeof UndoRedoRequestSchema
>
export type IMmpClientDeleteRequest = v.InferOutput<typeof DeleteRequestSchema>
export type IMmpClientSnapshotChanges = v.InferOutput<
  typeof SnapshotChangesSchema
>
export type IMmpClientMapDiff = v.InferOutput<typeof MapDiffSchema>

// --- Validation helper ---

export const validateWsPayload = <T>(
  client: Socket,
  schema: v.GenericSchema<unknown, T>,
  data: unknown
): T | null => {
  const result = v.safeParse(schema, data)
  if (!result.success) {
    client.emit('exception', {
      message: 'Invalid payload',
      issues: result.issues,
    })
    return null
  }
  return result.output
}
