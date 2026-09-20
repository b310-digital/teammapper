import * as v from 'valibot';
import {
  MAX_FONT_STYLE_LENGTH,
  MAX_FONT_WEIGHT_LENGTH,
  MAX_IMAGE_SRC_LENGTH,
  MAX_LINK_HREF_LENGTH,
  MAX_NODE_NAME_LENGTH,
  MAX_MERMAID_DESCRIPTION_LENGTH,
  SUPPORTED_LANGUAGES,
} from '../constants';

export const CssColorSchema = v.nullable(
  v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{3,8}$/))
);

export const ColorSchema = v.partial(
  v.object({
    name: CssColorSchema,
    background: CssColorSchema,
    branch: CssColorSchema,
    link: CssColorSchema,
  })
);

export const CoordinatesSchema = v.object({
  x: v.number(),
  y: v.number(),
});

export const FontSchema = v.partial(
  v.object({
    style: v.nullable(v.pipe(v.string(), v.maxLength(MAX_FONT_STYLE_LENGTH))),
    size: v.nullable(v.number()),
    weight: v.nullable(v.pipe(v.string(), v.maxLength(MAX_FONT_WEIGHT_LENGTH))),
  })
);

export const ImageSchema = v.partial(
  v.object({
    src: v.nullable(v.pipe(v.string(), v.maxLength(MAX_IMAGE_SRC_LENGTH))),
    size: v.nullable(v.number()),
  })
);

export const LinkSchema = v.partial(
  v.object({
    href: v.nullable(
      v.pipe(
        v.string(),
        v.regex(/^https?:\/\//i),
        v.maxLength(MAX_LINK_HREF_LENGTH)
      )
    ),
  })
);

export const NodeBasicsSchema = v.object({
  colors: ColorSchema,
  font: FontSchema,
  name: v.nullable(v.pipe(v.string(), v.maxLength(MAX_NODE_NAME_LENGTH))),
  image: ImageSchema,
});

export const NodeSchema = v.object({
  ...NodeBasicsSchema.entries,
  coordinates: CoordinatesSchema,
  detached: v.boolean(),
  id: v.pipe(v.string(), v.nonEmpty()),
  k: v.number(),
  link: LinkSchema,
  locked: v.boolean(),
  parent: v.nullable(v.string()),
  isRoot: v.boolean(),
  hidden: v.optional(v.boolean(), false),
  hasHiddenChildNodes: v.optional(v.boolean(), false),
});

export const MapOptionsSchema = v.partial(
  v.object({
    fontMaxSize: v.number(),
    fontMinSize: v.number(),
    fontIncrement: v.number(),
  })
);

export const MapCreateSchema = v.object({
  rootNode: NodeBasicsSchema,
});

export const MapDeleteSchema = v.object({
  adminId: v.pipe(v.string(), v.nonEmpty()),
});

export const MermaidCreateSchema = v.object({
  mindmapDescription: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(MAX_MERMAID_DESCRIPTION_LENGTH)
  ),
  language: v.picklist([...SUPPORTED_LANGUAGES]),
});

export type IMmpClientNodeBasics = v.InferOutput<typeof NodeBasicsSchema>;
export type IMmpClientNode = v.InferOutput<typeof NodeSchema>;
export type MermaidCreateInput = v.InferOutput<typeof MermaidCreateSchema>;

// Issue sanitization to prevent sensitive information leakage
type AnyIssue = v.BaseIssue<unknown>;

export interface SanitizedIssuePathItem {
  type: v.IssuePathItem['type'];
  origin: v.IssuePathItem['origin'];
  key: v.IssuePathItem['key'];
}

export interface SanitizedIssue {
  kind: AnyIssue['kind'];
  type: AnyIssue['type'];
  expected: AnyIssue['expected'];
  path?: SanitizedIssuePathItem[];
  issues?: SanitizedIssue[];
}

const sanitizePathItem = (item: v.IssuePathItem): SanitizedIssuePathItem => ({
  type: item.type,
  origin: item.origin,
  key: item.key,
});

const sanitizeIssue = (issue: AnyIssue): SanitizedIssue => {
  const sanitized: SanitizedIssue = {
    kind: issue.kind,
    type: issue.type,
    expected: issue.expected,
  };
  if (issue.path) sanitized.path = issue.path.map(sanitizePathItem);
  if (issue.issues) sanitized.issues = issue.issues.map(sanitizeIssue);
  return sanitized;
};

export const sanitizeIssues = (issues: readonly AnyIssue[]): SanitizedIssue[] =>
  issues.map(sanitizeIssue);
