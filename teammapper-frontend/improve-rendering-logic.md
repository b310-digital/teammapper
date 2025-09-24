# TeamMapper Rendering Logic Improvement Plan

## Executive Summary

This document outlines a comprehensive plan to improve the rendering performance of TeamMapper's mind mapping engine. The current SVG-based rendering system experiences performance degradation with large maps (100+ nodes) due to excessive DOM manipulations, inefficient update cycles, and suboptimal positioning algorithms.

## Current Performance Bottlenecks

### 1. Full DOM Re-rendering on Every Update

- **Issue**: The `draw.update()` method recreates entire DOM structure for all visible nodes on every change
- **Impact**: Causes 17+ full re-renders for simple operations like adding a node
- **Files Affected**: `/mmp/src/map/handlers/draw.ts`

### 2. Inefficient Branch Updates During Drag

- **Issue**: All branches are recalculated and redrawn during drag operations
- **Impact**: O(n) complexity for dragging a single node
- **Files Affected**: `/mmp/src/map/handlers/drag.ts`

### 3. Synchronous Layout Thrashing

- **Issue**: Multiple DOM dimension reads trigger forced reflows
- **Impact**: Browser performance warnings, janky animations
- **Files Affected**: `/mmp/src/map/handlers/draw.ts` (lines 196-197, 527)

### 4. No Viewport Culling

- **Issue**: All nodes rendered regardless of visibility
- **Impact**: Unnecessary memory usage and rendering overhead for off-screen nodes

### 5. Simple Positioning Algorithm

- **Issue**: Fixed spacing constants lead to overlaps and poor space utilization
- **Impact**: Inefficient use of canvas space, overlapping nodes in complex maps

## Improvement Roadmap

### Phase 1: Quick Wins (1-2 weeks)

#### 1.0 Fix Mermaid Import Overlapping (URGENT)

**Priority**: CRITICAL | **Effort**: LOW | **Impact**: HIGH

Implement dynamic spacing based on actual node dimensions:

```typescript
// In import.service.ts after creating all nodes
private adjustNodePositionsToPreventOverlap(nodes: ExportNodeProperties[]) {
  // Group nodes by parent
  const nodesByParent = new Map<string, ExportNodeProperties[]>();

  nodes.forEach(node => {
    if (!node.isRoot && node.parent) {
      const siblings = nodesByParent.get(node.parent) || [];
      siblings.push(node);
      nodesByParent.set(node.parent, siblings);
    }
  });

  // Adjust positions for each sibling group
  nodesByParent.forEach((siblings, parentId) => {
    let cumulativeY = nodes.find(n => n.id === parentId)?.coordinates?.y || 0;

    siblings.forEach((node, index) => {
      // Calculate actual height based on text length
      const estimatedHeight = this.estimateNodeHeight(node.name);
      const estimatedWidth = this.estimateNodeWidth(node.name);

      // Ensure minimum spacing between siblings
      if (index > 0) {
        const prevNode = siblings[index - 1];
        const prevHeight = this.estimateNodeHeight(prevNode.name);
        const minSpacing = Math.max(80, (prevHeight + estimatedHeight) / 2 + 20);

        cumulativeY += minSpacing;
        node.coordinates = { ...node.coordinates, y: cumulativeY };
      }

      // Adjust horizontal spacing if needed
      if (estimatedWidth > 150) {
        const extraSpace = (estimatedWidth - 150) / 2;
        const currentX = node.coordinates?.x || 0;
        node.coordinates = {
          ...node.coordinates,
          x: currentX > 0 ? currentX + extraSpace : currentX - extraSpace
        };
      }
    });
  });
}

private estimateNodeHeight(text: string): number {
  // Rough estimate: 25px per line, with wrapping at ~30 chars
  const lines = Math.ceil(text.length / 30);
  return lines * 25 + 30; // padding
}

private estimateNodeWidth(text: string): number {
  // Rough estimate: 8px per character average
  const maxLineLength = Math.min(text.length, 30);
  return maxLineLength * 8 + 45; // padding
}
```

**Expected Impact**: 95% reduction in overlapping nodes during import

#### 1.1 Implement Differential Updates

**Priority**: HIGH | **Effort**: LOW | **Impact**: HIGH

Replace full DOM recreation with targeted updates:

```typescript
// Instead of recreating all nodes, update only changed properties
public updateNode(nodeId: string, changes: NodeChanges) {
  const node = this.map.nodes.getNode(nodeId);
  const domNode = d3.select(`#${nodeId}`);

  if (changes.position) {
    domNode.attr('transform', `translate(${node.coordinates.x},${node.coordinates.y})`);
  }

  if (changes.content) {
    domNode.select('.node-text').html(node.name);
    this.updateNodeShape(node); // Only if dimensions changed
  }

  if (changes.style) {
    domNode.select('.node-bg').attr('fill', node.colors.background);
  }
}
```

**Expected Performance Gain**: 60-70% reduction in rendering time

#### 1.2 RequestAnimationFrame Batching

**Priority**: HIGH | **Effort**: LOW | **Impact**: MEDIUM

Batch DOM updates to avoid layout thrashing:

```typescript
private updateQueue = new Set<string>();
private rafId: number | null = null;

public scheduleUpdate(nodeId: string) {
  this.updateQueue.add(nodeId);

  if (!this.rafId) {
    this.rafId = requestAnimationFrame(() => {
      this.processUpdateQueue();
      this.rafId = null;
    });
  }
}

private processUpdateQueue() {
  const updates = Array.from(this.updateQueue);
  this.updateQueue.clear();

  // Batch read phase
  const dimensions = this.batchReadDimensions(updates);

  // Batch write phase
  this.batchApplyUpdates(updates, dimensions);
}
```

**Expected Performance Gain**: 30-40% reduction in frame drops

#### 1.3 Branch Update Optimization

**Priority**: MEDIUM | **Effort**: LOW | **Impact**: MEDIUM

Update only affected branches during drag:

```typescript
private updateAffectedBranches(movedNode: Node) {
  const affectedBranches = [
    movedNode.id, // Own branch to parent
    ...this.map.nodes.getChildren(movedNode).map(c => c.id) // Children's branches
  ];

  affectedBranches.forEach(nodeId => {
    d3.select(`#branch_${nodeId}`)
      .attr('d', this.drawBranch(this.map.nodes.getNode(nodeId)));
  });
}
```

**Expected Performance Gain**: 50% reduction in drag lag for large maps

### Phase 2: Core Optimizations (2-4 weeks)

#### 2.1 Viewport Culling System

**Priority**: HIGH | **Effort**: MEDIUM | **Impact**: HIGH

Render only visible nodes:

```typescript
class ViewportCuller {
  private viewport: BoundingBox;
  private visibleNodes = new Set<string>();

  public updateViewport(transform: ZoomTransform) {
    this.viewport = this.calculateViewport(transform);
    this.updateVisibleNodes();
  }

  private updateVisibleNodes() {
    const newVisible = new Set<string>();

    this.map.nodes.getNodes().forEach(node => {
      if (this.isNodeVisible(node)) {
        newVisible.add(node.id);

        if (!this.visibleNodes.has(node.id)) {
          this.renderNode(node); // Node entered viewport
        }
      } else if (this.visibleNodes.has(node.id)) {
        this.hideNode(node.id); // Node left viewport
      }
    });

    this.visibleNodes = newVisible;
  }

  private isNodeVisible(node: Node): boolean {
    const buffer = 100; // Render nodes slightly outside viewport
    return !(
      node.coordinates.x + node.dimensions.width / 2 <
        this.viewport.left - buffer ||
      node.coordinates.x - node.dimensions.width / 2 >
        this.viewport.right + buffer ||
      node.coordinates.y + node.dimensions.height / 2 <
        this.viewport.top - buffer ||
      node.coordinates.y - node.dimensions.height / 2 >
        this.viewport.bottom + buffer
    );
  }
}
```

**Expected Performance Gain**: 70-90% reduction in DOM nodes for large maps

#### 2.2 Spatial Indexing for Positioning

**Priority**: MEDIUM | **Effort**: MEDIUM | **Impact**: MEDIUM

Implement collision-aware positioning:

```typescript
class SpatialPositioning {
  private rtree: RTree;

  public calculateOptimalPosition(node: Node, parent: Node): Coordinates {
    const siblings = this.map.nodes.getSiblings(node);
    const basePosition = this.getBasePosition(node, parent);

    // Build spatial index of existing nodes
    this.updateSpatialIndex(siblings);

    // Find non-overlapping position
    return this.findClearPosition(basePosition, node.dimensions);
  }

  private findClearPosition(
    start: Coordinates,
    dimensions: Dimensions
  ): Coordinates {
    const spiral = this.generateSpiral(start);

    for (const point of spiral) {
      const bbox = this.getBoundingBox(point, dimensions);
      const collisions = this.rtree.search(bbox);

      if (collisions.length === 0) {
        return point;
      }
    }

    return start; // Fallback
  }
}
```

**Expected Performance Gain**: 80% reduction in node overlaps

#### 2.3 Dimension Caching System

**Priority**: MEDIUM | **Effort**: LOW | **Impact**: MEDIUM

Cache text measurements:

```typescript
class DimensionCache {
  private cache = new Map<string, Dimensions>();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  public measureText(text: string, font: FontStyle): Dimensions {
    const key = `${text}_${font.size}_${font.weight}_${font.family}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    this.ctx.font = `${font.weight} ${font.size}px ${font.family}`;
    const metrics = this.ctx.measureText(text);

    const dimensions = {
      width: metrics.width + 45, // padding
      height: font.size * 1.5 + 30, // line height + padding
    };

    this.cache.set(key, dimensions);
    return dimensions;
  }
}
```

**Expected Performance Gain**: 40% reduction in layout recalculations

### Phase 3: Advanced Features (4-8 weeks)

#### 3.1 Hybrid Rendering (SVG + Canvas)

**Priority**: LOW | **Effort**: HIGH | **Impact**: HIGH

Use Canvas for large maps, SVG for small maps:

```typescript
class HybridRenderer {
  private threshold = 500; // Switch to Canvas above 500 nodes
  private currentRenderer: Renderer;

  public selectRenderer(nodeCount: number) {
    if (
      nodeCount > this.threshold &&
      !(this.currentRenderer instanceof CanvasRenderer)
    ) {
      this.currentRenderer = new CanvasRenderer(this.map);
    } else if (
      nodeCount <= this.threshold &&
      !(this.currentRenderer instanceof SVGRenderer)
    ) {
      this.currentRenderer = new SVGRenderer(this.map);
    }
  }

  public render(nodes: Node[]) {
    this.selectRenderer(nodes.length);
    this.currentRenderer.render(nodes);
  }
}

class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hitCanvas: HTMLCanvasElement; // For hit detection

  public render(nodes: Node[]) {
    this.clear();

    // Render branches first (lower z-index)
    nodes.forEach(node => {
      if (node.parent) {
        this.renderBranch(node);
      }
    });

    // Render nodes
    nodes.forEach(node => this.renderNode(node));
  }

  private renderNode(node: Node) {
    const { x, y } = node.coordinates;
    const { width, height } = node.dimensions;

    // Draw rounded rectangle
    this.ctx.fillStyle = node.colors.background;
    this.drawRoundedRect(x - width / 2, y - height / 2, width, height, 10);

    // Draw text (with caching for performance)
    this.ctx.fillStyle = node.colors.name;
    this.ctx.font = `${node.font.weight} ${node.font.size}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(node.name, x, y);

    // Update hit detection canvas
    this.updateHitRegion(node);
  }
}
```

**Expected Performance Gain**: 10x performance improvement for 1000+ node maps

#### 3.2 Web Worker Layout Engine

**Priority**: LOW | **Effort**: HIGH | **Impact**: MEDIUM

Offload heavy calculations:

```typescript
// layout-worker.ts
interface LayoutRequest {
  nodes: SerializedNode[];
  constraints: LayoutConstraints;
}

self.addEventListener('message', (e: MessageEvent<LayoutRequest>) => {
  const { nodes, constraints } = e.data;

  // Heavy computation in worker thread
  const layout = calculateForceDirectedLayout(nodes, constraints);

  self.postMessage({ layout });
});

// Main thread
class WorkerLayoutEngine {
  private worker: Worker;
  private pendingLayout: Promise<Layout> | null = null;

  public async calculateLayout(nodes: Node[]): Promise<Layout> {
    if (this.pendingLayout) {
      return this.pendingLayout;
    }

    this.pendingLayout = new Promise(resolve => {
      this.worker.onmessage = e => {
        resolve(e.data.layout);
        this.pendingLayout = null;
      };

      this.worker.postMessage({
        nodes: this.serializeNodes(nodes),
        constraints: this.getConstraints(),
      });
    });

    return this.pendingLayout;
  }
}
```

**Expected Performance Gain**: Eliminates main thread blocking for complex layouts

#### 3.3 Intelligent Branch Routing

**Priority**: LOW | **Effort**: MEDIUM | **Impact**: LOW

Avoid overlaps with smart routing:

```typescript
class SmartBranchRouter {
  private obstacles: BoundingBox[];

  public routeBranch(from: Node, to: Node): Path {
    const direct = this.getDirectPath(from, to);

    if (!this.hasCollisions(direct)) {
      return direct;
    }

    // Use A* pathfinding for complex routing
    return this.findOptimalPath(from, to);
  }

  private findOptimalPath(from: Node, to: Node): Path {
    const grid = this.createGrid();
    const path = AStar.findPath(
      this.nodeToGrid(from),
      this.nodeToGrid(to),
      grid
    );

    return this.smoothPath(path);
  }

  private smoothPath(path: Point[]): Path {
    // Convert grid path to smooth Bezier curves
    return new Path(path).smooth(0.3);
  }
}
```

**Expected Performance Gain**: 90% reduction in branch-node overlaps

## Implementation Schedule

### Week 1-2: Foundation

- [ ] Implement differential updates
- [ ] Add RAF batching
- [ ] Optimize branch updates

### Week 3-4: Core Systems

- [ ] Build viewport culling
- [ ] Add dimension caching
- [ ] Implement spatial indexing

### Week 5-6: Testing & Refinement

- [ ] Performance benchmarking
- [ ] Memory profiling
- [ ] Bug fixes and optimization

### Week 7-8: Advanced Features (Optional)

- [ ] Canvas renderer prototype
- [ ] Web Worker integration
- [ ] Smart branch routing

## Success Metrics

### Performance Targets

- **Small maps (< 50 nodes)**: < 16ms render time (60 FPS)
- **Medium maps (50-200 nodes)**: < 33ms render time (30 FPS)
- **Large maps (200-1000 nodes)**: < 100ms render time (10 FPS)
- **Huge maps (1000+ nodes)**: < 200ms render time (5 FPS)

### Memory Targets

- **DOM nodes**: Max 2x visible nodes (with buffer)
- **Memory usage**: < 100MB for 1000 node map
- **Memory leaks**: Zero tolerance

### User Experience Targets

- **Drag smoothness**: 60 FPS for single node drag
- **Zoom smoothness**: 30 FPS minimum during zoom
- **Initial render**: < 500ms for any map size
- **Interaction latency**: < 100ms response time

## Testing Strategy

### Performance Testing

```typescript
class PerformanceTestSuite {
  public runBenchmarks() {
    const scenarios = [
      { nodes: 10, operations: ['add', 'drag', 'zoom'] },
      { nodes: 100, operations: ['add', 'drag', 'zoom'] },
      { nodes: 1000, operations: ['add', 'drag', 'zoom'] },
    ];

    scenarios.forEach(scenario => {
      const metrics = this.measureScenario(scenario);
      this.assertPerformance(metrics, scenario);
    });
  }

  private measureScenario(scenario: TestScenario): Metrics {
    const start = performance.now();
    // Run operations
    const end = performance.now();

    return {
      totalTime: end - start,
      frameRate: this.calculateFrameRate(),
      memoryUsage: performance.memory.usedJSHeapSize,
    };
  }
}
```

### Regression Prevention

- Automated performance tests in CI/CD
- Performance budget enforcement
- Regular profiling snapshots

## Rollback Plan

Each optimization will be:

1. Feature-flagged for gradual rollout
2. A/B tested with subset of users
3. Monitored for performance regressions
4. Easily revertible via configuration

## Conclusion

This improvement plan addresses the core rendering bottlenecks in TeamMapper while maintaining backward compatibility. The phased approach allows for incremental improvements with measurable impact at each stage. Priority should be given to Phase 1 optimizations as they provide the highest return on investment with minimal risk.

The expected cumulative performance improvement is 5-10x for large maps, while maintaining or improving performance for small maps. This will enable TeamMapper to handle enterprise-scale mind maps with thousands of nodes while providing a smooth, responsive user experience.
