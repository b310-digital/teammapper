import { BRANCH_STYLES, branchStyleOf } from './index';

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
