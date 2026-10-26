import {
  NodePropertyMapping,
  NodePropertySchemas,
  isNodeProperty,
} from './index';
import type { NodeProperty } from '../models';

const PROPERTIES = Object.keys(NodePropertySchemas) as NodeProperty[];

describe('NodePropertyMapping', () => {
  it('has an entry for every key of NodePropertySchemas', () => {
    expect(Object.keys(NodePropertyMapping).sort()).toEqual(
      [...PROPERTIES].sort()
    );
  });

  it.each(PROPERTIES)('gives %s a non-empty path', property => {
    expect(NodePropertyMapping[property].length).toBeGreaterThan(0);
  });
});

describe('isNodeProperty', () => {
  it.each(PROPERTIES)('accepts %s', property => {
    expect(isNodeProperty(property)).toBe(true);
  });

  it.each(['nope', '', '__proto__', 'toString'])('rejects %p', candidate => {
    expect(isNodeProperty(candidate)).toBe(false);
  });
});
