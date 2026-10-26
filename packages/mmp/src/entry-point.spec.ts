import * as mmp from './index.js';
import InMemoryMapData from './test/in-memory-map-data.js';
import { nodeRecord } from './test/stub-map.js';
import { stubSvgLengths } from './test/svg-lengths.js';

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

function createInstance() {
  const data = new InMemoryMapData([nodeRecord({ id: 'root', isRoot: true })]);
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  return mmp.create(ref, data, {});
}

describe('mmp entry point', () => {
  it('exports no NodePropertyMapping, which @teammapper/shared owns', () => {
    expect('NodePropertyMapping' in mmp).toBe(false);
  });

  it('exports create as its only runtime value', () => {
    expect(Object.keys(mmp).sort()).toEqual(['create']);
  });
});

describe('create', () => {
  it.each(['setEditable', 'destroy', 'updateNode'])(
    'returns an instance with a %s function',
    name => {
      const instance = createInstance();

      expect(
        typeof (instance as unknown as Record<string, unknown>)[name]
      ).toBe('function');
    }
  );

  it.each(['dom', 'draw', 'nodes', 'options'])(
    'returns an instance without a %s property',
    name => {
      const instance = createInstance();

      expect(name in instance).toBe(false);
    }
  );
});
