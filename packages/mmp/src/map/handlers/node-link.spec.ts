import Draw from './draw.js';
import Nodes from './nodes.js';
import Node from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import MmpMap from '../map.js';

/**
 * A peer's link is drawn before the server sanitizes it, so the renderer
 * draws only http and https links.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeDraw(): Draw {
  const map = {
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues },
    draw: { update: jest.fn(), clear: jest.fn() },
    events: { call: jest.fn() },
    history: { save: jest.fn() },
  } as unknown as MmpMap;
  const draw = new Draw(map, document.createElement('div'));
  map.draw = draw;
  map.nodes = new Nodes(map);
  return draw;
}

function makeNode(href: string): Node {
  const node = new Node({
    id: 'root',
    k: 1,
    parent: null,
    isRoot: true,
    link: { href },
  });
  node.dom = document.createElementNS(SVG_NS, 'g');
  node.dimensions = { width: 100, height: 40 };
  return node;
}

describe('node links', () => {
  it('draws an https link', () => {
    const node = makeNode('https://example.com');

    makeDraw().setLink(node);

    expect(node.dom.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com'
    );
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'example.com'])(
    'draws no link for %s',
    href => {
      const node = makeNode(href);

      makeDraw().setLink(node);

      expect(node.dom.querySelector('a')).toBeNull();
    }
  );
});
