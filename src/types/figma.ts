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

export type FigmaComponentPropertyType = 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';

/**
 * One entry of an INSTANCE (or COMPONENT) node's `componentProperties`.
 * Figma keys these by property name, sometimes suffixed with an internal
 * id (e.g. `"Show spinner#6046:3"`) — see `FigmaNode.componentProperties`.
 */
export interface FigmaComponentPropertyValue {
  type: FigmaComponentPropertyType;
  value: string | boolean;
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
  /**
   * Present on INSTANCE nodes (and variant COMPONENT nodes): the values of
   * that instance's component properties, e.g. `{ Size: { value: "Extra
   * small", type: "VARIANT" }, "Show spinner#6046:3": { value: false, type:
   * "BOOLEAN" } }`. Keys may carry a `#<id>` suffix that varies per
   * component — match by prefix, not exact key, when reading these.
   */
  componentProperties?: Record<string, FigmaComponentPropertyValue>;
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

/**
 * Metadata for one specific variant, keyed by its node id (== INSTANCE
 * nodes' `componentId`) in `file.components`. `componentSetId` points into
 * `file.componentSets` for the stable, designer-proof name of the set this
 * variant belongs to — see `resolveComponentSetName` in shadcn-parser.ts.
 */
export interface FigmaComponentMetadata {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks?: { uri: string }[];
}

/** Metadata for a component SET, keyed by node id in `file.componentSets`. */
export interface FigmaComponentSetMetadata {
  key: string;
  name: string;
  description: string;
}

export type FigmaComponentsMap = Record<string, FigmaComponentMetadata>;
export type FigmaComponentSetsMap = Record<string, FigmaComponentSetMetadata>;

/** Response shape for `GET /v1/files/:file_key`. */
export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaDocument;
  components: FigmaComponentsMap;
  componentSets?: FigmaComponentSetsMap;
  schemaVersion: number;
}

/** Response shape for `GET /v1/files/:file_key/nodes`. */
export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  version: string;
  nodes: Record<
    string,
    { document: FigmaNode; components?: FigmaComponentsMap; componentSets?: FigmaComponentSetsMap }
  >;
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

/** A node found via `FigmaClient.findNodes`, paired with the page it was found on. */
export interface FigmaNodeMatch {
  node: FigmaNode;
  pageName: string;
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
