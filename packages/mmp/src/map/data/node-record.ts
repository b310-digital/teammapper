import * as d3 from 'd3';
import * as v from 'valibot';
import { CssColorSchema, NodePropertySchemas } from '@teammapper/shared';
import type {
  MapNodeColors,
  MapNodeCoordinates,
  MapNodeFont,
  MapNodeImage,
  MapNodeLink,
  Resolved,
  UserNodeProperties,
} from '@teammapper/shared';

/**
 * Style values of a node with every field filled. The shared `MapNode*`
 * counterparts leave each field optional because the wire format may omit
 * it.
 */
export type NodeColors = Resolved<MapNodeColors>;
export type NodeFont = Resolved<MapNodeFont>;
export type NodeImage = Resolved<MapNodeImage>;
export type NodeLink = Resolved<MapNodeLink>;

/**
 * A node record with every attribute filled, read once per draw pass or per
 * call and dropped after. `parent` holds '' for a node without a parent.
 */
export interface ResolvedNode {
  id: string;
  parent: string;
  k: number;
  name: string;
  coordinates: MapNodeCoordinates;
  image: NodeImage;
  colors: NodeColors;
  font: NodeFont;
  link: NodeLink;
  protected: boolean;
  isRoot: boolean;
}

/** The node attributes a record may carry, some of them missing. */
export interface PartialNodeRecord extends UserNodeProperties {
  id: string;
  parent?: string | null;
  k?: number;
}

const FiniteSchema = v.pipe(v.number(), v.finite());
const ParentSchema = v.string();
const BooleanSchema = v.boolean();

/** The value when it passes the schema, otherwise undefined. */
function valid<S extends v.GenericSchema>(
  schema: S,
  value: unknown
): v.InferOutput<S> | undefined {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : undefined;
}

/**
 * Fill every attribute the record lacks or holds in a shape the shared
 * schemas reject, such as a number as name or a color that is no hex color.
 * Every record mmp reads passes through here, so a peer's value reaches the
 * DOM only after the schema check. The result shares no object with the
 * record, so a caller may change it.
 */
export function resolveNode(record: PartialNodeRecord): ResolvedNode {
  const { colors, coordinates, font, image, link } = record;
  const color = (value: unknown) => valid(CssColorSchema, value) || '';
  return {
    id: record.id,
    parent: valid(ParentSchema, record.parent) || '',
    k: valid(FiniteSchema, record.k) || 0,
    name: valid(NodePropertySchemas.name, record.name) || '',
    coordinates: {
      x: valid(FiniteSchema, coordinates?.x) ?? 0,
      y: valid(FiniteSchema, coordinates?.y) ?? 0,
    },
    image: {
      src: valid(NodePropertySchemas.imageSrc, image?.src) || '',
      size: valid(FiniteSchema, image?.size) || 0,
    },
    colors: {
      name: color(colors?.name),
      background: color(colors?.background),
      branch: color(colors?.branch),
      link: color(colors?.link),
    },
    font: {
      size: valid(FiniteSchema, font?.size) || 12,
      style: valid(NodePropertySchemas.fontStyle, font?.style) || 'normal',
      weight: valid(NodePropertySchemas.fontWeight, font?.weight) || 'normal',
    },
    link: { href: valid(NodePropertySchemas.linkHref, link?.href) || '' },
    protected: valid(BooleanSchema, record.protected) ?? false,
    isRoot: valid(BooleanSchema, record.isRoot) ?? false,
  };
}

/** The bend of a new node's background shape. */
export function randomK(): number {
  return d3.randomUniform(-20, 20)();
}
