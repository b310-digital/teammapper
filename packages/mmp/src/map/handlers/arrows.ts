import { arrowKey, canConnect } from '@teammapper/shared';
import type { ArrowRefusal, MapArrow } from '@teammapper/shared';
import MmpMap from '../map.js';
import Log from '../../utils/log.js';
import type { MapDataChange } from '../data/map-data.js';

/**
 * Create, select and remove the arrows of the map, and run arrow mode. The
 * arrows live in the map data; this handler keeps only the selected arrow and
 * the source of arrow mode.
 *
 * Arrow mode starts from the selected node, its source. A click on a node
 * then creates an arrow from the source to that node, or announces why the
 * endpoint rules refuse it and stays on. Arrow mode ends when the arrow is
 * created, on `stopArrowMode`, when another node takes the selection, when
 * the source goes away or hides, when the map is replaced and when the map
 * turns read-only.
 *
 * An arrow selection and a node selection exclude each other.
 */
export default class Arrows {
  private selected: MapArrow | null = null;
  private modeSource: string | null = null;

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

    this.stopArrowMode();
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
   * Start arrow mode from the selected node. Returns false, and starts
   * nothing, without a selected node or on a read-only map.
   */
  public startArrowMode = (): boolean => {
    const source = this.map.nodes.getSelectedNode()?.id;
    if (!this.writable || !source) return false;
    if (this.modeSource === source) return true;

    this.modeSource = source;
    this.map.draw.showArrowPreview(source);
    this.map.draw.markRefused(this.refusedTargets());
    this.map.events.emit('arrowMode', true);
    return true;
  };

  /** End arrow mode without an arrow. */
  public stopArrowMode = () => {
    if (this.modeSource === null) return;

    this.modeSource = null;
    this.map.draw.showArrowPreview(null);
    this.map.draw.markRefused([]);
    this.map.events.emit('arrowMode', false);
  };

  public isArrowMode = (): boolean => this.modeSource !== null;

  /**
   * Take a press on the node in arrow mode: create the arrow and end arrow
   * mode, or announce the refusal and stay on. Returns false outside arrow
   * mode, where the press keeps its usual meaning.
   */
  public handleNodeClick(id: string): boolean {
    const source = this.modeSource;
    if (source === null) return false;

    const refusal = this.addArrow(id, source);
    if (refusal === null) this.stopArrowMode();
    else this.map.events.emit('arrowRefused', refusal);
    return true;
  }

  /**
   * Follow a change of the map data: drop a selected arrow that is gone or
   * lost an endpoint, and end arrow mode when its source went away or hid,
   * or the map was replaced.
   */
  public onChange(change: MapDataChange) {
    if (this.selected && !this.selectedStillDrawable()) this.deselectArrow();

    const source = this.modeSource;
    if (source === null) return;
    if (change.replaced || !this.nodeShown(source)) {
      this.stopArrowMode();
      return;
    }
    this.map.draw.markRefused(this.refusedTargets());
  }

  /**
   * Follow a selection change: a node that takes the selection clears the
   * arrow selection, and any node but the source ends arrow mode.
   * @param {string | null} id the node taking the selection, null for none
   */
  public onNodeSelect(id: string | null) {
    if (id !== null) this.deselectArrow();
    if (this.modeSource !== null && id !== this.modeSource) {
      this.stopArrowMode();
    }
  }

  /**
   * End arrow mode when the view state hid its source, and clear the arrow
   * selection when it hid an end of the selected arrow.
   */
  public onViewChange() {
    if (this.selected && !this.selectedStillDrawable()) this.deselectArrow();
    const source = this.modeSource;
    if (source !== null && !this.nodeShown(source)) this.stopArrowMode();
  }

  /** End arrow mode and clear the arrow selection: the map turned read-only. */
  public onReadOnly() {
    this.stopArrowMode();
    this.deselectArrow();
  }

  /**
   * The ids of the nodes the source of arrow mode may not connect to: the
   * source, its parent, its children and the targets of its arrows. Scans
   * every node once.
   */
  public refusedTargets(): string[] {
    const source = this.modeSource;
    if (source === null) return [];

    const parent = this.map.nodes.parentOf(source);
    const targets = new Set(
      this.map.data
        .arrows()
        .filter(a => a.source === source)
        .map(a => a.target)
    );
    return this.map.data
      .nodes()
      .filter(
        node =>
          node.id === source ||
          node.id === parent ||
          node.parent === source ||
          targets.has(node.id)
      )
      .map(node => node.id);
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
