import * as d3 from 'd3';
import DOMPurify from 'dompurify';
import { isSafeLinkHref, type MapNodeDimensions } from '@teammapper/shared';
import type Node from '../models/node.js';

/** The group of every drawn node, with the node as its datum. */
export type NodeGroups = d3.Selection<SVGGElement, Node, d3.BaseType, unknown>;

/** An image the renderer has loaded, with its width over its height. */
export interface LoadedImage {
  url: string;
  ratio: number;
}

/** What a part reads from the renderer. Parts never read the DOM. */
export interface PartContext {
  /** The size of the node's name, measured or estimated. */
  textExtentOf(node: Node): MapNodeDimensions;
  /** The size of the node's box: the name and its padding. */
  dimensionsOf(node: Node): MapNodeDimensions;
  /** The color of the ring around the node, null for none. */
  ringOf(node: Node): string | null;
  /** The node's image once it has loaded, null before and without one. */
  imageOf(node: Node): LoadedImage | null;
  /** True while the person edits the node's name. */
  isEditing(node: Node): boolean;
  fontFamily: string;
  showLinktext: boolean;
}

/**
 * One visual element of a node. A render calls `draw` on every part, then
 * measures the names, then calls `finish` on every part, so no size is read
 * between two writes.
 */
export interface NodePart {
  /** Create, update and remove the element; write what needs no size. */
  draw(groups: NodeGroups, context: PartContext): void;
  /** Write what depends on the size of the node. */
  finish(groups: NodeGroups, context: PartContext): void;
}

/**
 * Join one element per node group that `shown` accepts. The first class of
 * `classes` identifies the element among the group's children.
 */
function join<E extends Element>(
  groups: NodeGroups,
  tag: string,
  classes: string,
  shown: (node: Node) => boolean = () => true
) {
  return groups
    .selectChildren<E, Node>(`${tag}.${classes.split(' ')[0]}`)
    .data(node => (shown(node) ? [node] : []))
    .join(enter => enter.append<E>(tag).attr('class', classes));
}

/** The joined elements of a part, without changing which exist. */
function select<E extends Element>(groups: NodeGroups, selector: string) {
  return groups.selectChildren<E, Node>(selector);
}

/** The elements the name part draws each name into. */
export function nameElements(groups: NodeGroups) {
  return select<SVGForeignObjectElement>(
    groups,
    'foreignObject.name'
  ).selectChildren<HTMLDivElement, Node>('div');
}

const background: NodePart = {
  draw(groups, context) {
    join<SVGPathElement>(groups, 'path', 'background')
      .style('fill', node => node.colors.background)
      .style('stroke-width', 3)
      .style('stroke', node => context.ringOf(node));
  },
  finish(groups, context) {
    select<SVGPathElement>(groups, 'path.background').attr('d', node =>
      backgroundShape(node, context.dimensionsOf(node))
    );
  },
};

function backgroundShape(node: Node, { width, height }: MapNodeDimensions) {
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

const name: NodePart = {
  draw(groups, context) {
    join<SVGForeignObjectElement>(groups, 'foreignObject', 'name')
      .selectChildren<HTMLDivElement, Node>('div')
      .data(node => [node])
      .join(enter =>
        enter
          .append<HTMLDivElement>('xhtml:div')
          .style('touch-action', 'none')
          .style('display', 'inline-block')
          .style('white-space', 'pre')
          // The measured width, whatever the width of the foreignObject.
          .style('width', 'max-content')
          .style('text-align', 'center')
          .style('cursor', 'pointer')
          // fix against cursor jumping out of nodes on firefox if empty
          .style('min-width', '20px')
      )
      .style('font-family', context.fontFamily)
      .style('font-size', node => node.font.size + 'px')
      .style('font-style', node => node.font.style)
      .style('font-weight', node => node.font.weight)
      .style('color', node => node.colors.name)
      .each((node, i, divs) => {
        // The editor owns the name while the person types.
        if (context.isEditing(node)) return;
        const html = DOMPurify.sanitize(node.name);
        if (divs[i].innerHTML !== html) divs[i].innerHTML = html;
      });
  },
  finish(groups, context) {
    select<SVGForeignObjectElement>(groups, 'foreignObject.name').each(
      (node, i, objects) => {
        const { width, height } = context.textExtentOf(node);
        d3.select(objects[i])
          .attr('x', -width / 2)
          .attr('y', -height / 2)
          .attr('width', width)
          .attr('height', height);
      }
    );
  },
};

const image: NodePart = {
  draw(groups, context) {
    join<SVGImageElement>(
      groups,
      'image',
      'image',
      node => context.imageOf(node) !== null
    )
      .attr('href', node => context.imageOf(node)?.url ?? null)
      .attr('clip-path', 'inset(0% round 15px)');
  },
  finish(groups, context) {
    select<SVGImageElement>(groups, 'image.image').each((node, i, images) => {
      const height = node.image.size,
        width = height * (context.imageOf(node)?.ratio ?? 1);
      d3.select(images[i])
        .attr('height', height)
        .attr('width', width)
        .attr('x', -width / 2)
        .attr('y', -(height + context.dimensionsOf(node).height / 2 + 5));
    });
  },
};

const MAX_LINK_TEXT_LENGTH = 50;

function linkText(href: string): string {
  if (href.length <= MAX_LINK_TEXT_LENGTH) return href;
  return href.slice(0, MAX_LINK_TEXT_LENGTH - 3) + '...';
}

const link: NodePart = {
  draw(groups, context) {
    // A peer's link reaches this client before the server sanitizes it, so
    // the renderer checks the scheme: DOMPurify keeps a `javascript:` URL.
    join<SVGAElement>(groups, 'a', 'link', node =>
      isSafeLinkHref(node.link.href)
    )
      .attr('href', node => node.link.href)
      .attr('target', '_self')
      .selectChildren<SVGTextElement, Node>('text')
      .data(node => [node])
      .join(enter => enter.append<SVGTextElement>('text'))
      // The touch handler recognizes the link by its first class.
      .attr('class', 'link-text')
      .classed('material-icons', !context.showLinktext)
      .text(node => (context.showLinktext ? linkText(node.link.href) : 'link'))
      .style('text-decoration', () =>
        context.showLinktext ? 'underline' : null
      )
      .style('font-style', () => (context.showLinktext ? 'italic' : null))
      .style('fill', node => node.colors.link)
      .attr('text-anchor', 'middle');
  },
  finish(groups, context) {
    select<SVGAElement>(groups, 'a.link')
      .selectChildren<SVGTextElement, Node>('text')
      .attr('y', node => context.dimensionsOf(node).height);
  },
};

/**
 * A material icon above the node, where `x` places it from the node's width.
 */
function icon(
  className: string,
  glyph: string,
  shown: (node: Node) => boolean,
  x: (width: number) => number
): NodePart {
  return {
    draw(groups) {
      join<SVGTextElement>(groups, 'text', `${className} material-icons`, shown)
        .text(glyph)
        .style('fill', node => node.colors.name);
    },
    finish(groups, context) {
      select<SVGTextElement>(groups, 'text.' + className).each(
        (node, i, icons) => {
          const { width, height } = context.dimensionsOf(node);
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
  node => node.hasHiddenChildNodes,
  () => -60
);

/**
 * A lock badge past the top right corner of a node carrying the protection.
 * Descendants protected through an ancestor show no badge.
 */
const protection = icon(
  'protected-icon',
  'lock',
  node => node.protected,
  width => width / 2
);

/** Every part of a node, back to front. */
export const NODE_PARTS: NodePart[] = [
  background,
  name,
  image,
  link,
  hiddenChildren,
  protection,
];
