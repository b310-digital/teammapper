import {
  BRANCH_STYLES,
  MAP_UPDATE_REJECTION_REASONS,
  WS_CLOSE_MAP_SYNC_RESET,
  WS_CLOSE_MAP_UPDATE_REJECTED,
  branchStyleOf,
} from './index';

describe('branchStyleOf', () => {
  it.each(BRANCH_STYLES)('keeps the known style %s', style => {
    expect(branchStyleOf(style)).toBe(style);
  });

  it.each([undefined, null, '', 'zigzag', 3])(
    'gives the default style for %p',
    value => {
      expect(branchStyleOf(value)).toBe(BRANCH_STYLES[0]);
    }
  );
});

describe('MAP_UPDATE_REJECTION_REASONS', () => {
  it.each(MAP_UPDATE_REJECTION_REASONS)(
    'fits the reason %s into a close reason',
    reason => {
      expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(123);
    }
  );
});

describe('WS_CLOSE_MAP_UPDATE_REJECTED', () => {
  it('is in the range y-websocket treats as terminal', () => {
    expect(WS_CLOSE_MAP_UPDATE_REJECTED).toBeGreaterThanOrEqual(4400);
    expect(WS_CLOSE_MAP_UPDATE_REJECTED).toBeLessThanOrEqual(4499);
  });

  it('differs from the map sync reset code', () => {
    expect(WS_CLOSE_MAP_UPDATE_REJECTED).not.toBe(WS_CLOSE_MAP_SYNC_RESET);
  });
});
