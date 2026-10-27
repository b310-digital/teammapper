import type { MmpInstance } from './map.js';

/**
 * `MmpInstance.updateNode` ties the value type to the property. These checks
 * run in `tsc`: each `@ts-expect-error` line fails the typecheck when the
 * call compiles, and each valid call fails it when the signature rejects it.
 * The function is never invoked.
 */
function typeChecks(instance: MmpInstance): void {
  // @ts-expect-error a name takes a string
  instance.updateNode('name', 42);

  // @ts-expect-error 'nope' is no node property
  instance.updateNode('nope', 'x');

  // @ts-expect-error 'locked' is no node property
  instance.updateNode('locked', true);

  // @ts-expect-error protected takes a boolean
  instance.updateNode('protected', 'yes');

  instance.updateNode('name', 'x');
  instance.updateNode('protected', true);
  instance.updateNode('backgroundColor', '#f9f9f9');
  instance.updateNode('coordinates', { x: 1, y: 2 });
  instance.updateNode('name', 'x', 'node-id');
}

describe('MmpInstance.updateNode typing', () => {
  it('checks property and value types at compile time', () => {
    expect(typeof typeChecks).toBe('function');
  });
});
