import * as d3 from 'd3';
import { DragBehavior, D3DragEvent } from 'd3';
import Map from '../map.js';
import Node from '../models/node.js';

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

    node.coordinates.x += dx;
    node.coordinates.y += dy;

    this.moveDescendants(node, dx, dy);

    this.map.draw.renderPositions([node, ...this.descendants]);

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
      node.coordinates.x += dx;
      node.coordinates.y += dy;

      if (orientationIsChanged) {
        node.coordinates.x += (root.coordinates.x - node.coordinates.x) * 2;
      }
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

      // The drag moved each node many times, so no single previous value
      // describes the change.
      for (const moved of [...this.descendants, node]) {
        this.map.events.emit('nodeUpdate', {
          nodeProperties: this.map.nodes.getNodeProperties(moved),
          changedProperty: 'coordinates',
          previousValue: undefined,
        });
      }
    }
  }
}
