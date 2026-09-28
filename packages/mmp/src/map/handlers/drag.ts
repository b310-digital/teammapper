import * as d3 from 'd3';
import { DragBehavior, D3DragEvent } from 'd3';
import Map from '../map.js';
import Node from '../models/node.js';
import { Event } from './events.js';

/**
 * Manage the drag events of the nodes.
 */
export default class Drag {
  private map: Map;

  private dragBehavior: DragBehavior<SVGGElement, Node, unknown>;
  private dragging = false;
  private orientation: boolean | undefined;
  private descendants: Node[] = [];
  // 'refused' when the drag started on a protected node, 'announced' once the
  // first move showed the notice. Both states keep the node in place.
  private refusal: 'none' | 'refused' | 'announced' = 'none';

  /**
   * Get the associated map instance and initialize the d3 drag behavior.
   * @param {Map} map
   */
  constructor(map: Map) {
    this.map = map;

    this.dragBehavior = d3
      .drag<SVGGElement, Node>()
      .on(
        'start',
        (event: D3DragEvent<SVGGElement, Node, unknown>, node: Node) =>
          this.started(event, node)
      )
      .on(
        'drag',
        (event: D3DragEvent<SVGGElement, Node, unknown>, node: Node) =>
          this.dragged(event, node)
      )
      .on('end', (event: D3DragEvent<SVGGElement, Node, unknown>, node: Node) =>
        this.ended(event, node)
      );
  }

  /**
   * Return the d3 drag behavior
   * @returns {DragBehavior} dragBehavior
   */
  public getDragBehavior(): DragBehavior<SVGGElement, Node, unknown> {
    return this.dragBehavior;
  }

  /**
   * Select the node and calculate node position data for dragging.
   * @param {Node} node
   */
  private started(_: D3DragEvent<SVGGElement, Node, unknown>, node: Node) {
    this.refusal = this.map.nodes.isProtected(node) ? 'refused' : 'none';
    this.orientation = this.map.nodes.getOrientation(node);
    this.descendants = this.map.nodes.getDescendants(node);

    this.map.nodes.selectNode(node.id);
  }

  /**
   * Move the dragged node and all its descendants. A protected node stays
   * where it is, and the first move announces the refusal.
   * @param {Node} node
   */
  private dragged(event: D3DragEvent<SVGGElement, Node, unknown>, node: Node) {
    if (this.refusal === 'refused') this.map.nodes.refuseProtected(node);
    if (this.refusal !== 'none') {
      this.refusal = 'announced';
      return;
    }

    const dy = event.dy,
      dx = event.dx;

    // Set new coordinates
    const x = (node.coordinates.x += dx),
      y = (node.coordinates.y += dy);

    // Move graphically the node in new coordinates
    node.dom.setAttribute('transform', 'translate(' + [x, y] + ')');

    this.moveDescendants(node, dx, dy);

    // Update all mind map branches
    d3.selectAll<SVGPathElement, Node>('.' + this.map.id + '_branch').attr(
      'd',
      (node: Node) => {
        return this.map.draw.drawBranch(node)?.toString() ?? null;
      }
    );

    // This is here and not in the started function because started function
    // is also executed when there is no drag events
    this.dragging = true;
  }

  /**
   * Move the descendants along with the dragged node, mirrored when the node
   * crosses to the other side of its tree root.
   * @param {Node} root the dragged node
   */
  private moveDescendants(root: Node, dx: number, dy: number) {
    const newOrientation = this.map.nodes.getOrientation(root),
      orientationIsChanged = newOrientation !== this.orientation;

    for (const node of this.descendants) {
      let x = (node.coordinates.x += dx);
      const y = (node.coordinates.y += dy);

      if (orientationIsChanged) {
        x = node.coordinates.x += (root.coordinates.x - node.coordinates.x) * 2;
      }

      node.dom.setAttribute('transform', 'translate(' + [x, y] + ')');
    }

    if (orientationIsChanged) {
      this.orientation = newOrientation;
    }
  }

  /**
   * If the node was actually dragged change the state of dragging and save the snapshot.
   * @param {Node} node
   */
  private ended(_event: D3DragEvent<SVGGElement, Node, unknown>, node: Node) {
    if (this.dragging) {
      this.dragging = false;
      this.map.history.save();

      for (const node of this.descendants) {
        this.map.events.call(Event.nodeUpdate, node.dom, {
          nodeProperties: this.map.nodes.getNodeProperties(node),
          changedProperty: 'coordinates',
        });
      }

      this.map.events.call(Event.nodeUpdate, node.dom, {
        nodeProperties: this.map.nodes.getNodeProperties(node),
        changedProperty: 'coordinates',
      });
    }
  }
}
