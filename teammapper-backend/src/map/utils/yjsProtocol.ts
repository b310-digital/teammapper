import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

// Message types matching y-websocket client protocol
export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
// Custom message type for communicating write access to clients
// (types 2=auth and 3=queryAwareness are reserved by y-websocket)
export const MESSAGE_WRITE_ACCESS = 4

// WebSocket close codes (4000-4999 private-use range per RFC 6455)
export const WS_CLOSE_MISSING_PARAM = 4000
export const WS_CLOSE_MAP_DELETED = 4001
export const WS_CLOSE_MAP_NOT_FOUND = 4004
export const WS_CLOSE_INTERNAL_ERROR = 4500
export const WS_CLOSE_SERVER_SHUTDOWN = 1001

export interface ConnectionMeta {
  mapId: string
  writable: boolean
  awarenessClientIds: Set<number>
}

export interface ParsedQueryParams {
  mapId: string | null
  secret: string | null
}

// Encodes a SyncStep1 message for initial doc state exchange
export const encodeSyncStep1Message = (doc: Y.Doc): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

// Encodes a sync update message for broadcasting doc changes
export const encodeSyncUpdateMessage = (update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

// Encodes an awareness update message for broadcasting presence
export const encodeAwarenessMessage = (
  awareness: awarenessProtocol.Awareness,
  clients: number[]
): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, clients)
  )
  return encoding.toUint8Array(encoder)
}

// Encodes a write-access message to inform the client of its permissions
export const encodeWriteAccessMessage = (writable: boolean): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_WRITE_ACCESS)
  encoding.writeVarUint(encoder, writable ? 1 : 0)
  return encoding.toUint8Array(encoder)
}

// For read-only clients: process SyncStep1 (state request), drop writes
export const processReadOnlySyncMessage = (
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: Y.Doc
): void => {
  const syncMsgType = decoding.readVarUint(decoder)
  if (syncMsgType === syncProtocol.messageYjsSyncStep1) {
    syncProtocol.readSyncStep1(decoder, encoder, doc)
  }
  // Drop SyncStep2 and Update messages from read-only clients
}

// Extracts awareness clientIds from a raw awareness update binary
export const parseAwarenessClientIds = (update: Uint8Array): number[] => {
  const clientIds: number[] = []
  const decoder = decoding.createDecoder(update)
  const len = decoding.readVarUint(decoder)
  for (let i = 0; i < len; i++) {
    clientIds.push(decoding.readVarUint(decoder))
    // Skip remaining fields (clock + state)
    decoding.readVarUint(decoder)
    decoding.readVarString(decoder)
  }
  return clientIds
}

// Extracts the pathname from a potentially relative URL
export const extractPathname = (url: string | undefined): string => {
  if (!url) return ''
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return ''
  }
}

// Parses mapId and secret from WebSocket URL query or path params
// Supports both legacy (/yjs?mapId=<id>) and y-websocket (/yjs/<id>?secret=...)
export const parseQueryParams = (
  url: string | undefined
): ParsedQueryParams => {
  if (!url) return { mapId: null, secret: null }
  try {
    const parsed = new URL(url, 'http://localhost')
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const mapId =
      parsed.searchParams.get('mapId') ??
      (pathParts.length >= 2 ? pathParts[1] : null)
    return { mapId, secret: parsed.searchParams.get('secret') }
  } catch {
    return { mapId: null, secret: null }
  }
}

// Checks write access: writable if map has no secret, or secret matches
export const checkWriteAccess = (
  modificationSecret: string | null,
  givenSecret: string | null
): boolean => {
  if (!modificationSecret) return true
  return givenSecret === modificationSecret
}

// Converts ws message data to Uint8Array
export const toUint8Array = (
  data: Buffer | ArrayBuffer | Buffer[]
): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data)
}
