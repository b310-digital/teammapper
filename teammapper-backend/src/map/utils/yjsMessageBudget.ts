/** Messages and bytes received within a rate window. */
export interface MessageTally {
  count: number
  bytes: number
}

/** The tally of one rate window, with the time the window opened. */
export interface MessageBudget extends MessageTally {
  startedAt: number
}

/**
 * A map's budget, with the share each connection sent within the window.
 * The gateway keys shares by its WebSocket.
 */
export interface MapMessageBudget extends MessageBudget {
  shares: Map<object, MessageTally>
}

// Past this multiple of its limit, a map rejects every sender, so senders
// spread over many connections or reconnects cannot raise its traffic
// without bound.
const MAP_HARD_LIMIT_FACTOR = 2

/** An empty connection budget for a window opened at `startedAt`. */
export const openMessageBudget = (startedAt: number): MessageBudget => ({
  startedAt,
  count: 0,
  bytes: 0,
})

/** An empty map budget for a window opened at `startedAt`. */
export const openMapMessageBudget = (startedAt: number): MapMessageBudget => ({
  ...openMessageBudget(startedAt),
  shares: new Map<object, MessageTally>(),
})

/**
 * The budget `key` holds for the current window. Once the window has
 * elapsed, `open` starts a new one at the current time.
 */
export const currentBudget = <K extends object, B extends MessageBudget>(
  budgets: WeakMap<K, B>,
  key: K,
  windowMs: number,
  open: (startedAt: number) => B
): B => {
  const now = Date.now()
  const budget = budgets.get(key)
  if (budget && now - budget.startedAt < windowMs) return budget
  const fresh = open(now)
  budgets.set(key, fresh)
  return fresh
}

/** Counts one message of `bytes` bytes in `tally`. */
export const addMessage = (tally: MessageTally, bytes: number): void => {
  tally.count++
  tally.bytes += bytes
}

/** Adds a message to the map's tally and to the sender's share of it. */
export const chargeShare = (
  budget: MapMessageBudget,
  sender: object,
  bytes: number
): MessageTally => {
  const share = budget.shares.get(sender) ?? { count: 0, bytes: 0 }
  budget.shares.set(sender, share)
  addMessage(budget, bytes)
  addMessage(share, bytes)
  return share
}

/**
 * Whether the map's tally in `dimension` passed `limit` and the sender is to
 * blame: no other connection sent more within the window. Past twice the
 * limit, every sender is to blame.
 */
export const overrunsMap = (
  budget: MapMessageBudget,
  share: MessageTally,
  dimension: keyof MessageTally,
  limit: number
): boolean => {
  if (budget[dimension] <= limit) return false
  if (budget[dimension] > limit * MAP_HARD_LIMIT_FACTOR) return true
  return [...budget.shares.values()].every(
    (other) => other[dimension] <= share[dimension]
  )
}
