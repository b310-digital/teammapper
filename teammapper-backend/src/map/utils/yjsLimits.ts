export const DEFAULT_YJS_MAP_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxEntries: 100_000,
  maxNodes: 10_000,
  // Persistence writes every arrow in one insert of three parameters per row,
  // and Postgres binds at most 65535 parameters per query.
  maxArrows: 10_000,
}

export type YjsMapLimits = typeof DEFAULT_YJS_MAP_LIMITS

export const WS_PAYLOAD_HEADROOM = 64 * 1024

/**
 * Largest WebSocket message the server accepts. The headroom lets the gateway
 * name the reason for a message a little past the map size limit.
 */
export const maxMessagePayload = (
  limits: Pick<YjsMapLimits, 'maxBytes'>
): number => limits.maxBytes + WS_PAYLOAD_HEADROOM

export const DEFAULT_YJS_MESSAGE_LIMITS = {
  windowMs: 10_000,
  maxMessages: 100,
  maxBytes: 5 * 1024 * 1024,
}
