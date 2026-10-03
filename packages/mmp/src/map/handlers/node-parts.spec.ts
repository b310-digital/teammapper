import * as d3 from 'd3';
import type { MapNodeDimensions } from '@teammapper/shared';
import Node, { NodeProperties } from '../models/node.js';
import { NODE_PARTS, type PartContext } from './node-parts.js';

/**
 * The parts draw into a node group alone, so these specs draw one node
 * without a map.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeNode(properties: Partial<NodeProperties> = {}): Node {
  return new Node({ id: 'node', parent: null, k: 1, ...properties });
}

/** Draw and finish every part of the node at the given size. */
function drawParts(
  node: Node,
  dimensions: MapNodeDimensions = { width: 100, height: 40 },
  group = document.createElementNS(SVG_NS, 'g')
): SVGGElement {
  const context: PartContext = {
    textExtentOf: () => ({ width: 60, height: 20 }),
    dimensionsOf: () => dimensions,
    ringOf: () => null,
    imageOf: () => null,
    isEditing: () => false,
    fontFamily: 'sans-serif',
    showLinktext: false,
  };
  const groups = d3.select<SVGGElement, Node>(group).datum(node);

  NODE_PARTS.forEach(part => part.draw(groups, context));
  NODE_PARTS.forEach(part => part.finish(groups, context));

  return group;
}

describe('node links', () => {
  it('draws an https link', () => {
    const group = drawParts(
      makeNode({ link: { href: 'https://example.com' } })
    );

    expect(group.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com'
    );
  });

  // The map refuses an unsafe link, but a peer's link reaches the renderer
  // before the server sanitizes it, so the part checks it once more.
  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'example.com'])(
    'draws no link for %s',
    href => {
      const group = drawParts(makeNode({ link: { href } }));

      expect(group.querySelector('a')).toBeNull();
    }
  );
});

describe('lock badge', () => {
  const badge = (group: SVGGElement) =>
    group.querySelector('text.protected-icon');

  it('draws a badge on a node carrying the flag only', () => {
    expect(badge(drawParts(makeNode({ protected: true })))?.textContent).toBe(
      'lock'
    );
    expect(badge(drawParts(makeNode()))).toBeNull();
  });

  it('moves and recolors the badge when the node changes', () => {
    const node = makeNode({ protected: true });
    const group = drawParts(node);

    node.colors.name = '#ff0000';
    drawParts(node, { width: 200, height: 40 }, group);

    expect(group.querySelectorAll('text.protected-icon')).toHaveLength(1);
    expect(badge(group)?.getAttribute('x')).toBe('100');
    expect((badge(group) as SVGTextElement).style.fill).toBe('#ff0000');
  });

  it('removes the badge once the protection is released', () => {
    const node = makeNode({ protected: true });
    const group = drawParts(node);

    node.protected = false;
    drawParts(node, undefined, group);

    expect(badge(group)).toBeNull();
  });
});
