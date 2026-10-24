import * as Y from 'yjs'
import * as v from 'valibot'
import {
  NodeSchema,
  MapOptionsSchema,
  MAX_NODE_NAME_LENGTH,
} from '@teammapper/shared'
import { DEFAULT_YJS_MAP_LIMITS, YjsMapLimits } from './yjsLimits'

// JSON export can hide a __proto__ key on an object's prototype. Check the
// input before Valibot constructs its parsed output.
const plainObject = v.check<unknown>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    !['__proto__', 'constructor', 'prototype'].some((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    )
)
const strictObject = <T extends v.ObjectEntries>(entries: T) =>
  v.pipe(v.unknown(), plainObject, v.strictObject(entries))

const strictPartialObject = <T extends v.ObjectEntries>(entries: T) =>
  v.pipe(v.unknown(), plainObject, v.partial(v.strictObject(entries)))

// Attributes may arrive in separate updates, so validate partial nodes while
// rejecting unknown fields. Reuse the shared schemas for each attribute.
const nodeSchema = strictPartialObject({
  ...NodeSchema.entries,
  coordinates: strictObject(NodeSchema.entries.coordinates.entries),
  colors: strictObject(NodeSchema.entries.colors.entries),
  font: strictObject(NodeSchema.entries.font.entries),
  image: strictObject(NodeSchema.entries.image.entries),
  link: strictObject(NodeSchema.entries.link.entries),
  orderNumber: v.number(),
})
const mapSchema = strictObject({
  nodes: v.pipe(
    v.unknown(),
    plainObject,
    v.record(v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)), nodeSchema)
  ),
  mapOptions: strictPartialObject({
    ...MapOptionsSchema.entries,
    name: v.nullable(v.pipe(v.string(), v.maxLength(MAX_NODE_NAME_LENGTH))),
  }),
  meta: strictPartialObject({
    lastMapAnnouncement: v.literal('import'),
  }),
})

function invalid(): never {
  throw new Error('Invalid map update')
}

/** Origin shared by the gateway and persistence observers. */
export class MapUpdateOrigin {
  accepted = false

  constructor(readonly sender: unknown) {}
}

const rejectedMaps = new WeakSet<Y.Doc>()
export const isRejectedMap = (doc: Y.Doc): boolean => rejectedMaps.has(doc)

// The cached byte size bounds the next application without serializing the
// existing state twice. All writes to a loaded map go through this function.
const mapBytes = new WeakMap<Y.Doc, number>()

// Count retained Yjs entries, including history absent from the visible map.
const entryCount = (doc: Y.Doc): number => {
  let count = 0
  for (const structs of doc.store.clients.values()) count += structs.length
  return count
}

// Bound potential growth before applying the update to live state.
const validateIncomingUpdateLimits = (
  doc: Y.Doc,
  update: Uint8Array,
  limits: YjsMapLimits
): void => {
  const bytes = mapBytes.get(doc) ?? Y.encodeStateAsUpdate(doc).byteLength
  // Each update can add only bounded state before post-application checks.
  if (bytes + update.byteLength > limits.maxBytes) invalid()

  const decoded = Y.decodeUpdate(update)
  let incomingEntries = 0
  const existingEntries = entryCount(doc)
  if (existingEntries > limits.maxEntries) invalid()
  for (const struct of decoded.structs) {
    incomingEntries +=
      struct instanceof Y.Item && struct.content instanceof Y.ContentAny
        ? struct.length
        : 1
    if (incomingEntries + existingEntries > limits.maxEntries) invalid()
  }
}

// Check the resulting shared structure and exported map before observers run.
const validateMapContent = (doc: Y.Doc, limits: YjsMapLimits): void => {
  if (doc.store.pendingStructs || doc.store.pendingDs) invalid()
  // Unknown roots can disappear from JSON export (for example __proto__).
  for (const key of doc.share.keys()) {
    if (key !== 'nodes' && key !== 'mapOptions' && key !== 'meta') invalid()
  }

  const nodes = doc.getMap('nodes')
  if (nodes.size > limits.maxNodes) invalid()
  // Nodes must remain Y.Maps for client and persistence operations. JSON
  // alone cannot distinguish a shared node from an ordinary object.
  // The map key is the node's id, so an `id` field naming another node would
  // make clients and persistence disagree about which node an entry is.
  for (const [key, node] of nodes.entries()) {
    if (!(node instanceof Y.Map)) invalid()
    if (node.has('id') && node.get('id') !== key) invalid()
  }
  if (!v.safeParse(mapSchema, doc.toJSON()).success) invalid()
}

// Enforce the resulting encoded size and cache it for the next update's check.
const validateAndCacheMapSize = (doc: Y.Doc, maxBytes: number): void => {
  const bytes = Y.encodeStateAsUpdate(doc).byteLength
  if (bytes > maxBytes) invalid()
  mapBytes.set(doc, bytes)
}

/**
 * Apply once to the live map and validate before update observers run.
 * Rejection is terminal: the gateway must discard the map and reset peers.
 */
export const applyValidatedMapUpdate = (
  doc: Y.Doc,
  update: Uint8Array,
  sender: unknown,
  limits: YjsMapLimits = DEFAULT_YJS_MAP_LIMITS
): void => {
  if (isRejectedMap(doc)) invalid()
  const origin = new MapUpdateOrigin(sender)
  try {
    validateIncomingUpdateLimits(doc, update, limits)
    doc.transact(() => {
      doc.getMap('nodes')
      doc.getMap('mapOptions')
      doc.getMap('meta')
      Y.applyUpdate(doc, update, origin)
      validateMapContent(doc, limits)
      validateAndCacheMapSize(doc, limits.maxBytes)
      origin.accepted = true
    }, origin)
  } catch (error) {
    rejectedMaps.add(doc)
    throw error
  }
}
