import { arrowKey, canConnect } from '@teammapper/shared';
import type { ArrowRefusal, MapArrow } from '@teammapper/shared';
import MmpMap from '../map.js';
import Log from '../../utils/log.js';

/**
 * Create, select and remove the arrows of the map. The arrows live in the map
 * data; this handler keeps only the selected arrow.
 *
 * An arrow selection and a node selection exclude each other.
 */
export default class Arrows {
  private selected: MapArrow | null = null;

  constructor(private readonly map: MmpMap) {}

  private get writable(): boolean {
    return this.map.options.edit !== false;
  }

  /** Copies of every arrow the map data holds. */
  public getArrows = (): MapArrow[] =>
    this.map.data.arrows().map(({ source, target }) => ({ source, target }));

  /**
   * Add an arrow from `source`, or from the selected node, to `target`.
   * Returns why the endpoint rules refuse it, or null once it is added.
   * Throws when the caller names no source and nothing is selected.
   */
  public addArrow = (target: string, source?: string): ArrowRefusal | null => {
    const from = source ?? this.map.nodes.getSelectedNode()?.id;
    if (!from) Log.error('There is no selected node');

    const nodes = [...this.map.nodes.scan().values()];
    const refusal = canConnect(nodes, this.map.data.arrows(), from, target);
    if (refusal === null) {
      this.map.data.addArrows([{ source: from, target }]);
    }
    return refusal;
  };

  /** Remove the arrow with `key`, or the selected arrow. */
  public removeArrow = (key?: string) => {
    const target = key ?? this.selectedKey();
    if (target !== null) this.map.data.removeArrow(target);
  };

  /**
   * Select the arrow with `key` and leave no node selected. A read-only map
   * and a key the map data lacks select nothing.
   */
  public selectArrow = (key: string) => {
    if (!this.writable || this.selectedKey() === key) return;
    const arrow = this.getArrows().find(
      a => arrowKey(a.source, a.target) === key
    );
    if (!arrow) return;

    this.deselectArrow();
    this.map.nodes.deselectNode();
    this.selected = arrow;
    this.map.draw.setArrowSelected(key);
    this.map.events.emit('arrowSelect', { ...arrow });
  };

  /** Clear the arrow selection and announce it. */
  public deselectArrow = () => {
    const previous = this.selected;
    if (!previous) return;

    this.selected = null;
    this.map.draw.setArrowSelected(null);
    this.map.events.emit('arrowDeselect', { ...previous });
  };

  /** A copy of the selected arrow, or null. */
  public getSelectedArrow = (): MapArrow | null =>
    this.selected ? { ...this.selected } : null;

  /**
   * Follow a change of the map data: drop a selected arrow that is gone or
   * lost an endpoint.
   */
  public onChange() {
    if (this.selected && !this.selectedStillDrawable()) this.deselectArrow();
  }

  /**
   * Follow a selection change: a node that takes the selection clears the
   * arrow selection.
   * @param {string | null} id the node taking the selection, null for none
   */
  public onNodeSelect(id: string | null) {
    if (id !== null) this.deselectArrow();
  }

  /** Clear the arrow selection when the view state hid an end of it. */
  public onViewChange() {
    if (this.selected && !this.selectedStillDrawable()) this.deselectArrow();
  }

  /** Clear the arrow selection: the map turned read-only. */
  public onReadOnly() {
    this.deselectArrow();
  }

  private selectedKey(): string | null {
    const arrow = this.selected;
    return arrow ? arrowKey(arrow.source, arrow.target) : null;
  }

  /** Whether the map data holds the selected arrow and both its ends show. */
  private selectedStillDrawable(): boolean {
    const key = this.selectedKey();
    return this.map.data
      .arrows()
      .some(
        a =>
          arrowKey(a.source, a.target) === key &&
          this.nodeShown(a.source) &&
          this.nodeShown(a.target)
      );
  }

  /** Whether the node exists and no hidden child nodes of an ancestor hide it. */
  private nodeShown(id: string): boolean {
    return this.map.data.node(id) !== undefined && !this.map.nodes.isHidden(id);
  }
}
