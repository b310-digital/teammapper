import * as d3 from 'd3';
import type { MapNodeDimensions } from '@teammapper/shared';
import {
  resolveNode,
  type PartialNodeRecord,
  type ResolvedNode,
} from '../data/node-record.js';
import { NODE_MARKS, type MarkContext } from './node-marks.js';

/**
 * The marks draw into a node group alone, so these specs draw one node
 * without a map. The group binds the node's id, and the marks read the
 * record through `recordOf`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeNode(properties: Partial<PartialNodeRecord> = {}): ResolvedNode {
  return resolveNode({ id: 'node', k: 1, ...properties });
}

/** Draw and finish every mark of the node at the given size. */
function drawMarks(
  node: ResolvedNode,
  dimensions: MapNodeDimensions = { width: 100, height: 40 },
  group = document.createElementNS(SVG_NS, 'g')
): SVGGElement {
  const context: MarkContext = {
    recordOf: () => node,
    textExtentOf: () => ({ width: 60, height: 20 }),
    dimensionsOf: () => dimensions,
    ringOf: () => null,
    imageOf: () => null,
    isEditing: () => false,
    hidesChildren: () => false,
    fontFamily: 'sans-serif',
    showLinktext: false,
  };
  const groups = d3.select<SVGGElement, string>(group).datum(node.id);

  NODE_MARKS.forEach(mark => mark.draw(groups, context));
  NODE_MARKS.forEach(mark => mark.finish(groups, context));

  return group;
}

describe('node links', () => {
  it('draws an https link', () => {
    const group = drawMarks(
      makeNode({ link: { href: 'https://example.com' } })
    );

    expect(group.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com'
    );
  });

  // The map refuses an unsafe link, but a peer's link reaches the renderer
  // before the server sanitizes it, so the mark checks it once more.
  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'example.com'])(
    'draws no link for %s',
    href => {
      const group = drawMarks(makeNode({ link: { href } }));

      expect(group.querySelector('a')).toBeNull();
    }
  );
});

describe('lock badge', () => {
  const badge = (group: SVGGElement) =>
    group.querySelector('text.protected-icon');

  it('draws a badge on a node carrying the attribute only', () => {
    expect(badge(drawMarks(makeNode({ protected: true })))?.textContent).toBe(
      'lock'
    );
    expect(badge(drawMarks(makeNode()))).toBeNull();
  });

  it('moves and recolors the badge when the node changes', () => {
    const group = drawMarks(makeNode({ protected: true }));

    drawMarks(
      makeNode({ protected: true, colors: { name: '#ff0000' } }),
      { width: 200, height: 40 },
      group
    );

    expect(group.querySelectorAll('text.protected-icon')).toHaveLength(1);
    expect(badge(group)?.getAttribute('x')).toBe('100');
    expect((badge(group) as SVGTextElement).style.fill).toBe('#ff0000');
  });

  it('removes the badge once the protection is released', () => {
    const group = drawMarks(makeNode({ protected: true }));

    drawMarks(makeNode({ protected: false }), undefined, group);

    expect(badge(group)).toBeNull();
  });
});
