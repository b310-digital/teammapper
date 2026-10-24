import { jest } from '@jest/globals'
import {
  chargeShare,
  currentBudget,
  MapMessageBudget,
  MessageBudget,
  openMapMessageBudget,
  openMessageBudget,
  overrunsMap,
} from './yjsMessageBudget'

// `chargeShare` tells connections apart by identity, so plain objects stand
// in for sockets.
const connection = (): object => ({})

describe('currentBudget', () => {
  afterEach(() => jest.restoreAllMocks())

  it('keeps the budget within its window', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000)
    const budgets = new WeakMap<object, MessageBudget>()
    const key = {}
    const first = currentBudget(budgets, key, 10_000, openMessageBudget)
    expect(currentBudget(budgets, key, 10_000, openMessageBudget)).toBe(first)
  })

  it('opens a new budget once the window elapsed', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000)
    const budgets = new WeakMap<object, MessageBudget>()
    const key = {}
    const first = currentBudget(budgets, key, 10_000, openMessageBudget)
    now.mockReturnValue(11_000)
    expect(currentBudget(budgets, key, 10_000, openMessageBudget)).not.toBe(
      first
    )
  })
})

describe('overrunsMap', () => {
  let budget: MapMessageBudget
  const heavy = connection()
  const light = connection()

  beforeEach(() => {
    budget = openMapMessageBudget(0)
    chargeShare(budget, heavy, 1)
    chargeShare(budget, heavy, 1)
  })

  it('blames no one within the limit', () => {
    const share = chargeShare(budget, light, 1)
    expect(overrunsMap(budget, share, 'count', 3)).toBe(false)
  })

  it('spares a lighter sender past the limit', () => {
    const share = chargeShare(budget, light, 1)
    expect(overrunsMap(budget, share, 'count', 2)).toBe(false)
  })

  it('blames the heaviest sender past the limit', () => {
    chargeShare(budget, light, 1)
    const share = chargeShare(budget, heavy, 1)
    expect(overrunsMap(budget, share, 'count', 3)).toBe(true)
  })

  it('blames any sender past twice the limit', () => {
    chargeShare(budget, light, 1)
    const share = chargeShare(budget, connection(), 1)
    expect(overrunsMap(budget, share, 'count', 1)).toBe(true)
  })

  it('applies the limit to bytes', () => {
    const share = chargeShare(budget, heavy, 1)
    expect(overrunsMap(budget, share, 'bytes', 2)).toBe(true)
  })
})
