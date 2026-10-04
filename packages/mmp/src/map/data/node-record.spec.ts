import {
  MAX_FONT_STYLE_LENGTH,
  MAX_IMAGE_SRC_LENGTH,
  MAX_LINK_HREF_LENGTH,
  MAX_NODE_NAME_LENGTH,
} from '@teammapper/shared';
import { resolveNode, type PartialNodeRecord } from './node-record.js';

/** A record as a peer may write it, with fields the types do not allow. */
const peerRecord = (fields: Record<string, unknown>) =>
  ({ id: 'node', ...fields }) as unknown as PartialNodeRecord;

const defaults = resolveNode({ id: 'node' });

describe('resolveNode', () => {
  it('keeps every value the shared schemas accept', () => {
    const record = {
      id: 'node',
      parent: 'root',
      k: -3,
      name: 'Name',
      coordinates: { x: 10, y: -20 },
      image: { src: 'https://example.org/a.png', size: 40 },
      colors: {
        name: '#123',
        background: '#abcdef',
        branch: '#00000080',
        link: '',
      },
      font: { size: 18, style: 'italic', weight: 'bold' },
      link: { href: 'https://example.org' },
      protected: true,
      isRoot: true,
    };

    expect(resolveNode(record)).toEqual(record);
  });

  it.each([
    ['a number as name', { name: 42 }],
    [
      'a name over the length cap',
      { name: 'a'.repeat(MAX_NODE_NAME_LENGTH + 1) },
    ],
    ['a parent that is no string', { parent: { id: 'root' } }],
    ['an infinite k', { k: Infinity }],
    ['a NaN x coordinate', { coordinates: { x: NaN, y: 0 } }],
    ['an infinite y coordinate', { coordinates: { x: 0, y: -Infinity } }],
    ['a string coordinate', { coordinates: { x: '5', y: 0 } }],
    ['a color that loads a url', { colors: { background: 'url(https://x)' } }],
    ['a named color', { colors: { name: 'red' } }],
    ['a branch color that is no string', { colors: { branch: 7 } }],
    [
      'an image source over the length cap',
      { image: { src: 'a'.repeat(MAX_IMAGE_SRC_LENGTH + 1) } },
    ],
    ['an infinite image size', { image: { size: Infinity } }],
    [
      'a link over the length cap',
      { link: { href: `https://${'a'.repeat(MAX_LINK_HREF_LENGTH)}` } },
    ],
    ['a link that runs script', { link: { href: 'javascript:alert(1)' } }],
    [
      'a font style over the length cap',
      { font: { style: 'a'.repeat(MAX_FONT_STYLE_LENGTH + 1) } },
    ],
    ['a font size that is no number', { font: { size: '12px' } }],
    ['a protection that is no boolean', { protected: 'false' }],
    ['an `isRoot` attribute that is no boolean', { isRoot: 1 }],
    ['styling objects that are strings', { colors: 'red', font: 'big' }],
  ])('falls back to the default for %s', (_, fields) => {
    expect(resolveNode(peerRecord(fields))).toEqual(defaults);
  });
});
