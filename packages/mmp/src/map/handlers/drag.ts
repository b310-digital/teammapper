import * as d3 from 'd3';
import { DragBehavior, D3DragEvent } from 'd3';
import { collectSubtreeIds } from '@teammapper/shared';
import Map from '../map.js';
import { lookupIn } from './nodes.js';

type DragEvent = D3DragEvent<SVGGElement, string, unknown>;

/** The drag in progress: the dragged node and the nodes it moves along. */
interface DragSession {
  id: string;
  descendants: string[];
  /** The root of the dragged node's tree, read once at the start. */
  treeRoot: string;
  orientation: boolean | undefined;
  // 'refused' when the drag started on a protected node, 'announced' once
  // the first move showed the notice. Both states keep the node in place.
  refusal: 'none' | 'refused' | 'announced';
  moved: boolean;
}

/**
 * Manage the drag events of the nodes. A drag moves a preview the renderer
 * draws and writes nothing to the map data until it ends. A change of the
 * map data during the drag draws from the data and keeps the preview.
 */
export default class Drag {
  private map: Map;

  private dragBehavior: DragBehavior<SVGGElement, string, unknown>;
  private session: DragSession | null = null;

  /**
   * Get the associated map instance and initialize the d3 drag behavior.
   * @param {Map} map
   */
  constructor(map: Map) {
    this.map = map;

    this.dragBehavior = d3
      .drag<SVGGElement, string>()
      .on('start', (event: DragEvent, id: string) => this.started(event, id))
      .on('drag', (event: DragEvent, id: string) => this.dragged(event, id))
      .on('end', (event: DragEvent, id: string) => this.ended(event, id));
  }

  /**
   * Return the d3 drag behavior
   * @returns {DragBehavior} dragBehavior
   */
  public getDragBehavior(): DragBehavior<SVGGElement, string, unknown> {
    return this.dragBehavior;
  }

  /**
   * End the running drag without a write and drop its preview. A replaced
   * map calls this, so a peer's import is never overwritten.
   */
  public cancel() {
    this.session = null;
    this.map.draw.takePreview();
  }

  /**
   * Select the node and read, once, the nodes the drag moves along with it.
   * @param {string} id
   */
  private started(_: DragEvent, id: string) {
    const nodes = this.map.nodes;
    const records = nodes.scan();
    const lookup = lookupIn(records);

    this.session = {
      id,
      descendants: collectSubtreeIds([...records.values()], id),
      treeRoot: nodes.treeRoot(id, lookup),
      orientation: nodes.orientation(id, lookup),
      refusal: nodes.isProtected(id) ? 'refused' : 'none',
      moved: false,
    };

    nodes.selectNode(id);
  }

  /**
   * Move the preview of the dragged node and all its descendants. A
   * protected node stays where it is, and the first move announces the
   * refusal.
   * @param {string} id
   */
  private dragged(event: DragEvent, id: string) {
    const session = this.session;
    if (session?.id !== id) return;

    if (session.refusal === 'refused') this.map.nodes.refuseProtected(id);
    if (session.refusal !== 'none') {
      session.refusal = 'announced';
      return;
    }

    const nodes = this.map.nodes;
    const draw = this.map.draw;
    const moved = [id, ...session.descendants];
    const { dx, dy } = event;
    for (const node of moved) {
      const position = nodes.positionOf(node);
      draw.setPreview(node, { x: position.x + dx, y: position.y + dy });
    }

    this.mirrorDescendants(session);

    draw.renderPositions(moved);

    // This is here and not in the started function because started function
    // is also executed when there is no drag events
    session.moved = true;
  }

  /**
   * Mirror the descendants around the dragged node when it crosses to the
   * other side of its tree root. Reads only the tree root's position.
   */
  private mirrorDescendants(session: DragSession) {
    const nodes = this.map.nodes;
    const dragged = nodes.positionOf(session.id);
    const orientation =
      nodes.parentOf(session.id) === null
        ? undefined
        : dragged.x < nodes.positionOf(session.treeRoot).x;
    if (orientation === session.orientation) return;

    session.orientation = orientation;
    for (const node of session.descendants) {
      const position = nodes.positionOf(node);
      this.map.draw.setPreview(node, {
        x: position.x + (dragged.x - position.x) * 2,
        y: position.y,
      });
    }
  }

  /**
   * After a drag that moved the node, write the preview positions in one
   * batch and draw the moved nodes from the map data. A write the data
   * skips, or a branch a peer protected during the drag, notifies nothing,
   * so the redraw puts those nodes back at their stored positions.
   * @param {string} id
   */
  private ended(_event: DragEvent, id: string) {
    const session = this.session;
    if (session?.id !== id) return;
    this.session = null;

    const positions = this.map.draw.takePreview();
    if (!session.moved) return;

    // The descendants move along whatever protection they carry themselves,
    // so the writes skip the per-node check updateNode makes.
    const nodes = this.map.nodes;
    if (!nodes.refusesChange(id)) nodes.writePositions(positions);

    this.map.draw.renderPositions([...positions.keys()]);
  }
}
