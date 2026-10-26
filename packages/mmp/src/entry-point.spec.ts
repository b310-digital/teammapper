import * as mmp from './index.js';

describe('mmp entry point', () => {
  it('exports no NodePropertyMapping, which @teammapper/shared owns', () => {
    expect('NodePropertyMapping' in mmp).toBe(false);
  });
});
