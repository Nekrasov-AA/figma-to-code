/**
 * Types for the subset of the Figma REST API this tool relies on.
 * Reference: https://www.figma.com/developers/api
 */

/** Node types that can appear in a Figma document tree. */
export type FigmaNodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE'
  | 'TEXT'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'VECTOR'
  | 'LINE'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'POLYGON'
  | 'SLICE'
  | 'STICKY'
  | 'SHAPE_WITH_TEXT'
  | 'CONNECTOR'
  | (string & {});

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string;
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

export interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
}

/**
 * A single node in a Figma document tree. Every field beyond `id`, `name`
 * and `type` is optional because Figma only includes it when relevant to
 * that node type.
 */
export interface FigmaNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: FigmaBoundingBox;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  characters?: string;
  style?: FigmaTypeStyle;
  componentId?: string;
  componentPropertyDefinitions?: Record<string, unknown>;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  cornerRadius?: number;
  opacity?: number;
}

/** A page (top-level CANVAS node) in a Figma file. */
export interface FigmaCanvas extends FigmaNode {
  type: 'CANVAS';
  children: FigmaNode[];
}

/** The root DOCUMENT node of a Figma file, containing one or more pages. */
export interface FigmaDocument extends FigmaNode {
  type: 'DOCUMENT';
  children: FigmaCanvas[];
}

/** Metadata Figma stores per-component, keyed by node id in `file.components`. */
export interface FigmaComponentMetadata {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks?: { uri: string }[];
}

/** Response shape for `GET /v1/files/:file_key`. */
export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaDocument;
  components: Record<string, FigmaComponentMetadata>;
  componentSets?: Record<string, FigmaComponentMetadata>;
  schemaVersion: number;
}

/** Response shape for `GET /v1/files/:file_key/nodes`. */
export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  version: string;
  nodes: Record<string, { document: FigmaNode; components?: Record<string, FigmaComponentMetadata> }>;
}

/**
 * A COMPONENT node from the document tree, enriched with the metadata
 * Figma stores separately in `file.components`, plus its position in the
 * page hierarchy.
 */
export interface FigmaComponent {
  id: string;
  name: string;
  description: string;
  pageName: string;
  node: FigmaNode;
}

/**
 * A simplified view of a node's subtree, stripped of visual/style data.
 * Produced by `FigmaClient.parseComponentHierarchy` to give downstream
 * generators a plain tree to walk.
 */
export interface FigmaHierarchyNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  children?: FigmaHierarchyNode[];
}
