import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import {
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  encodeSyncStep1Message,
  encodeSyncUpdateMessage,
  encodeAwarenessMessage,
  processReadOnlySyncMessage,
  parseAwarenessClientIds,
  extractPathname,
  parseQueryParams,
  checkWriteAccess,
  toUint8Array,
} from './yjsProtocol'

describe('yjsProtocol', () => {
  describe('encodeSyncStep1Message', () => {
    it('produces a valid sync step 1 message', () => {
      const doc = new Y.Doc()
      const message = encodeSyncStep1Message(doc)

      const decoder = decoding.createDecoder(message)
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC)
      expect(decoding.readVarUint(decoder)).toBe(
        syncProtocol.messageYjsSyncStep1
      )

      doc.destroy()
    })
  })

  describe('encodeSyncUpdateMessage', () => {
    it('produces a valid sync update message', () => {
      const doc = new Y.Doc()
      doc.getMap('test').set('key', 'value')
      const update = Y.encodeStateAsUpdate(doc)

      const message = encodeSyncUpdateMessage(update)

      const decoder = decoding.createDecoder(message)
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC)
      expect(decoding.readVarUint(decoder)).toBe(syncProtocol.messageYjsUpdate)

      doc.destroy()
    })
  })

  describe('encodeAwarenessMessage', () => {
    it('produces a valid awareness message', () => {
      const doc = new Y.Doc()
      const awareness = new awarenessProtocol.Awareness(doc)
      awareness.setLocalState({ user: 'test' })

      const message = encodeAwarenessMessage(
        awareness,
        Array.from(awareness.getStates().keys())
      )

      const decoder = decoding.createDecoder(message)
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_AWARENESS)

      awareness.destroy()
      doc.destroy()
    })
  })

  describe('processReadOnlySyncMessage', () => {
    it('processes SyncStep1 requests from read-only clients', () => {
      const doc = new Y.Doc()
      doc.getMap('nodes').set('node-1', new Y.Map())

      const clientDoc = new Y.Doc()
      const reqEncoder = encoding.createEncoder()
      syncProtocol.writeSyncStep1(reqEncoder, clientDoc)
      const requestBytes = encoding.toUint8Array(reqEncoder)

      const decoder = decoding.createDecoder(requestBytes)
      const responseEncoder = encoding.createEncoder()
      processReadOnlySyncMessage(decoder, responseEncoder, doc)

      // Should have written a SyncStep2 response
      expect(encoding.length(responseEncoder)).toBeGreaterThan(0)

      clientDoc.destroy()
      doc.destroy()
    })

    it('drops update messages from read-only clients', () => {
      const doc = new Y.Doc()
      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('node-1', new Y.Map())

      // Build a raw update message (messageYjsUpdate = 2)
      const reqEncoder = encoding.createEncoder()
      syncProtocol.writeUpdate(reqEncoder, Y.encodeStateAsUpdate(clientDoc))
      const requestBytes = encoding.toUint8Array(reqEncoder)

      const decoder = decoding.createDecoder(requestBytes)
      const responseEncoder = encoding.createEncoder()
      processReadOnlySyncMessage(decoder, responseEncoder, doc)

      // Should not have written any response
      expect(encoding.length(responseEncoder)).toBe(0)
      expect(doc.getMap('nodes').size).toBe(0)

      clientDoc.destroy()
      doc.destroy()
    })
  })

  describe('parseAwarenessClientIds', () => {
    it('extracts client IDs from an awareness update', () => {
      const doc = new Y.Doc()
      const awareness = new awarenessProtocol.Awareness(doc)
      awareness.setLocalState({ user: 'test' })

      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [
        doc.clientID,
      ])
      const clientIds = parseAwarenessClientIds(update)

      expect(clientIds).toEqual([doc.clientID])

      awareness.destroy()
      doc.destroy()
    })

    it('throws on malformed binary data', () => {
      expect(() => parseAwarenessClientIds(new Uint8Array([255]))).toThrow()
    })
  })

  describe('extractPathname', () => {
    it('extracts pathname from a URL', () => {
      expect(extractPathname('/yjs?mapId=123')).toBe('/yjs')
    })

    it('returns empty string for undefined', () => {
      expect(extractPathname(undefined)).toBe('')
    })

    it('returns empty string for empty string', () => {
      expect(extractPathname('')).toBe('')
    })

    it('handles complex paths', () => {
      expect(extractPathname('/api/yjs?a=1&b=2')).toBe('/api/yjs')
    })
  })

  describe('parseQueryParams', () => {
    it('parses mapId and secret', () => {
      expect(parseQueryParams('/yjs?mapId=abc&secret=xyz')).toEqual({
        mapId: 'abc',
        secret: 'xyz',
      })
    })

    it('returns nulls for missing params', () => {
      expect(parseQueryParams('/yjs')).toEqual({
        mapId: null,
        secret: null,
      })
    })

    it('returns nulls for undefined URL', () => {
      expect(parseQueryParams(undefined)).toEqual({
        mapId: null,
        secret: null,
      })
    })

    it('parses mapId without secret', () => {
      expect(parseQueryParams('/yjs?mapId=abc')).toEqual({
        mapId: 'abc',
        secret: null,
      })
    })
  })

  describe('checkWriteAccess', () => {
    it('grants write when map has no secret', () => {
      expect(checkWriteAccess(null, null)).toBe(true)
      expect(checkWriteAccess(null, 'any')).toBe(true)
    })

    it('grants write when secrets match', () => {
      expect(checkWriteAccess('secret', 'secret')).toBe(true)
    })

    it('denies write when secrets differ', () => {
      expect(checkWriteAccess('secret', 'wrong')).toBe(false)
    })

    it('denies write when no secret given', () => {
      expect(checkWriteAccess('secret', null)).toBe(false)
    })
  })

  describe('toUint8Array', () => {
    it('converts Buffer to Uint8Array', () => {
      const buf = Buffer.from([1, 2, 3])
      const result = toUint8Array(buf)
      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result)).toEqual([1, 2, 3])
    })

    it('converts ArrayBuffer to Uint8Array', () => {
      const ab = new ArrayBuffer(3)
      new Uint8Array(ab).set([4, 5, 6])
      const result = toUint8Array(ab)
      expect(Array.from(result)).toEqual([4, 5, 6])
    })

    it('converts Buffer[] to Uint8Array', () => {
      const bufs = [Buffer.from([1, 2]), Buffer.from([3, 4])]
      const result = toUint8Array(bufs)
      expect(Array.from(result)).toEqual([1, 2, 3, 4])
    })
  })
})
