import * as d3 from 'd3';
import DOMPurify from 'dompurify';
import { isSafeLinkHref, type MapNodeDimensions } from '@teammapper/shared';
import type { ResolvedNode } from '../data/node-record.js';

/** The drawn nodes, each bound to its node id. */
export type NodeGroups = d3.Selection<
  SVGGElement,
  string,
  d3.BaseType,
  unknown
>;

/** An image the renderer has loaded, with its width over its height. */
export interface LoadedImage {
  url: string;
  ratio: number;
}

/**
 * What a mark reads from the renderer, by node id. Marks never measure the
 * page and read node records only through `recordOf`.
 */
export interface MarkContext {
  /** The record of the node, read once per draw pass. */
  recordOf(id: string): ResolvedNode;
  /** The size of the node's name. */
  textExtentOf(id: string): MapNodeDimensions;
  /** The size of the node's box: the name and its padding. */
  dimensionsOf(id: string): MapNodeDimensions;
  /** The color of the ring around the node, null for none. */
  ringOf(id: string): string | null;
  /** The node's image once it has loaded, else null. */
  imageOf(id: string): LoadedImage | null;
  /** True while the person edits the node's name. */
  isEditing(id: string): boolean;
  /** True when the view state hides the child nodes the node has. */
  hidesChildren(id: string): boolean;
  fontFamily: string;
  showLinktext: boolean;
}

/**
 * One visual element of a node, such as its background or lock badge.
 * `draw` runs before the names are measured and `finish` after.
 */
export interface NodeMark {
  /** Draw what does not depend on the node's size. */
  draw(groups: NodeGroups, context: MarkContext): void;
  /** Draw what depends on the node's size. */
  finish(groups: NodeGroups, context: MarkContext): void;
}

/**
 * Add the DOM element to each node `shown` accepts and remove it from the
 * rest. The first class in `classes` names the DOM element.
 */
function join<E extends Element>(
  groups: NodeGroups,
  tag: string,
  classes: string,
  shown: (id: string) => boolean = () => true
) {
  return groups
    .selectChildren<E, string>(`${tag}.${classes.split(' ')[0]}`)
    .data(id => (shown(id) ? [id] : []))
    .join(enter => enter.append<E>(tag).attr('class', classes));
}

/** The DOM element of a mark on each node that has one. */
function select<E extends Element>(groups: NodeGroups, selector: string) {
  return groups.selectChildren<E, string>(selector);
}

/** The DOM elements the name mark draws each name into. */
export function nameElements(groups: NodeGroups) {
  return select<SVGForeignObjectElement>(
    groups,
    'foreignObject.name'
  ).selectChildren<HTMLDivElement, string>('div');
}

const background: NodeMark = {
  draw(groups, context) {
    join<SVGPathElement>(groups, 'path', 'background')
      .style('fill', id => context.recordOf(id).colors.background)
      .style('stroke-width', 3)
      .style('stroke', id => context.ringOf(id));
  },
  finish(groups, context) {
    select<SVGPathElement>(groups, 'path.background').attr('d', id =>
      backgroundShape(context.recordOf(id), context.dimensionsOf(id))
    );
  },
};

function backgroundShape(
  node: ResolvedNode,
  { width, height }: MapNodeDimensions
) {
  const path = d3.path(),
    x = width / 2,
    y = height / 2,
    k = node.k;

  path.moveTo(-x, k / 3);
  path.bezierCurveTo(-x, -y + 10, -x + 10, -y, k, -y);
  path.bezierCurveTo(x - 10, -y, x, -y + 10, x, k / 3);
  path.bezierCurveTo(x, y - 10, x - 10, y, k, y);
  path.bezierCurveTo(-x + 10, y, -x, y - 10, -x, k / 3);
  path.closePath();

  return path.toString();
}

const name: NodeMark = {
  draw(groups, context) {
    join<SVGForeignObjectElement>(groups, 'foreignObject', 'name')
      .selectChildren<HTMLDivElement, string>('div')
      .data(id => [id])
      .join(enter =>
        enter
          .append<HTMLDivElement>('xhtml:div')
          .style('touch-action', 'none')
          .style('display', 'inline-block')
          .style('white-space', 'pre')
          // As wide as the text, whatever box surrounds it.
          .style('width', 'max-content')
          .style('text-align', 'center')
          .style('cursor', 'pointer')
          // fix against cursor jumping out of nodes on firefox if empty
          .style('min-width', '20px')
      )
      .style('font-family', context.fontFamily)
      .style('font-size', id => context.recordOf(id).font.size + 'px')
      .style('font-style', id => context.recordOf(id).font.style)
      .style('font-weight', id => context.recordOf(id).font.weight)
      .style('color', id => context.recordOf(id).colors.name)
      .each((id, i, divs) => {
        // Keep the text the person is typing.
        if (context.isEditing(id)) return;
        const html = DOMPurify.sanitize(context.recordOf(id).name);
        if (divs[i].innerHTML !== html) divs[i].innerHTML = html;
      });
  },
  finish(groups, context) {
    select<SVGForeignObjectElement>(groups, 'foreignObject.name').each(
      (id, i, objects) => {
        const { width, height } = context.textExtentOf(id);
        d3.select(objects[i])
          .attr('x', -width / 2)
          .attr('y', -height / 2)
          .attr('width', width)
          .attr('height', height);
      }
    );
  },
};

const image: NodeMark = {
  draw(groups, context) {
    join<SVGImageElement>(
      groups,
      'image',
      'image',
      id => context.imageOf(id) !== null
    )
      .attr('href', id => context.imageOf(id)?.url ?? null)
      .attr('clip-path', 'inset(0% round 15px)');
  },
  finish(groups, context) {
    select<SVGImageElement>(groups, 'image.image').each((id, i, images) => {
      const height = context.recordOf(id).image.size,
        width = height * (context.imageOf(id)?.ratio ?? 1);
      d3.select(images[i])
        .attr('height', height)
        .attr('width', width)
        .attr('x', -width / 2)
        .attr('y', -(height + context.dimensionsOf(id).height / 2 + 5));
    });
  },
};

const MAX_LINK_TEXT_LENGTH = 50;

function linkText(href: string): string {
  if (href.length <= MAX_LINK_TEXT_LENGTH) return href;
  return href.slice(0, MAX_LINK_TEXT_LENGTH - 3) + '...';
}

const link: NodeMark = {
  draw(groups, context) {
    // A peer's link reaches this client before the server sanitizes it, so
    // the renderer checks the scheme: DOMPurify keeps a `javascript:` URL.
    join<SVGAElement>(groups, 'a', 'link', id =>
      isSafeLinkHref(context.recordOf(id).link.href)
    )
      .attr('href', id => context.recordOf(id).link.href)
      .attr('target', '_self')
      .selectChildren<SVGTextElement, string>('text')
      .data(id => [id])
      .join(enter => enter.append<SVGTextElement>('text'))
      // The touch handler recognizes the link by its first class.
      .attr('class', 'link-text')
      .classed('material-icons', !context.showLinktext)
      .text(id =>
        context.showLinktext ? linkText(context.recordOf(id).link.href) : 'link'
      )
      .style('text-decoration', () =>
        context.showLinktext ? 'underline' : null
      )
      .style('font-style', () => (context.showLinktext ? 'italic' : null))
      .style('fill', id => context.recordOf(id).colors.link)
      .attr('text-anchor', 'middle');
  },
  finish(groups, context) {
    select<SVGAElement>(groups, 'a.link')
      .selectChildren<SVGTextElement, string>('text')
      .attr('y', id => context.dimensionsOf(id).height);
  },
};

/**
 * A material icon above the node, where `x` places it from the node's width.
 */
function icon(
  className: string,
  glyph: string,
  shown: (id: string, context: MarkContext) => boolean,
  x: (width: number) => number
): NodeMark {
  return {
    draw(groups, context) {
      join<SVGTextElement>(groups, 'text', `${className} material-icons`, id =>
        shown(id, context)
      )
        .text(glyph)
        .style('fill', id => context.recordOf(id).colors.name);
    },
    finish(groups, context) {
      select<SVGTextElement>(groups, 'text.' + className).each(
        (id, i, icons) => {
          const { width, height } = context.dimensionsOf(id);
          d3.select(icons[i])
            .attr('x', x(width))
            .attr('y', -height + 30);
        }
      );
    },
  };
}

/** A hidden eye icon on a node whose child nodes are hidden. */
const hiddenChildren = icon(
  'hidden-icon',
  'visibility_off',
  (id, context) => context.hidesChildren(id),
  () => -60
);

/**
 * A lock badge past the top right corner of a node carrying the protection.
 * Descendants protected through an ancestor show no badge.
 */
const protection = icon(
  'protected-icon',
  'lock',
  (id, context) => context.recordOf(id).protected,
  width => width / 2
);

/** Every mark of a node, back to front. */
export const NODE_MARKS: NodeMark[] = [
  background,
  name,
  image,
  link,
  hiddenChildren,
  protection,
];
