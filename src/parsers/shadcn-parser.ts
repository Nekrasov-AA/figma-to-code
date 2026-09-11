import {
  FigmaComponentPropertyValue,
  FigmaComponentsMap,
  FigmaComponentSetsMap,
  FigmaNode,
} from '../types/figma';
import { logger } from '../utils/logger';

const BUTTON_COMPONENT_SET_NAME = 'Button - Nova';
const LABEL_COMPONENT_SET_NAME = 'Label';
const INPUT_COMPONENT_SET_NAME = 'Input - Nova';
const CARD_COMPONENT_SET_NAME = 'Card - Nova';
const CARD_SECTION_COMPONENT_SET_NAME = '.Card Section - Nova';

/**
 * Extracted data for a "Button - Nova" instance from the Obra shadcn/ui
 * Figma kit. Values are taken as-is from Figma (e.g. `size` may be
 * "Extra small") — mapping them onto shadcn's own vocabulary happens in a
 * later generation step, not here.
 */
export interface ParsedButton {
  size: string;
  variant: string;
  state: string;
  hasLeftIcon: boolean;
  hasRightIcon: boolean;
  hasSpinner: boolean;
  label: string;
  /** The node's own name, e.g. "Login" — NOT reliable for identifying the component, see `resolveComponentSetName`. */
  rawVariantName: string;
}

/** Extracted data for a "Label" instance. */
export interface ParsedLabel {
  layout: string;
  state: string;
  weight: string;
  text: string;
}

/** Extracted data for an "Input - Nova" instance. */
export interface ParsedInput {
  position: string;
  size: string;
  state: string;
  value: string;
  showDecorationLeft: boolean;
  showDecorationRight: boolean;
  showPrependText: boolean;
  showAppendText: boolean;
}

/**
 * Extracted data for a "Card - Nova" instance: the parsed content found
 * inside each of its Header/Body/Footer sections, or `null` if that
 * section wasn't present. `TNode` is generic (rather than importing
 * frame-parser's `ParsedNode`) to avoid a circular import — see
 * `parseCardComponent`.
 */
export interface ParsedCard<TNode = unknown> {
  header: TNode[] | null;
  body: TNode[] | null;
  footer: TNode[] | null;
}

/**
 * Look up a componentProperties entry by name prefix instead of exact key.
 *
 * Figma suffixes some property keys with an internal property id that
 * varies per component/instance, e.g. `"Show spinner#6046:3"` instead of
 * plain `"Show spinner"`. Variant properties (Size/Variant/State/...) are
 * usually unsuffixed, but boolean/text ones reliably aren't — so every
 * lookup here matches by prefix to handle both cases uniformly.
 */
function findProperty(
  properties: Record<string, FigmaComponentPropertyValue> | undefined,
  namePrefix: string
): FigmaComponentPropertyValue | undefined {
  if (!properties) {
    return undefined;
  }
  const key = Object.keys(properties).find((k) => k.startsWith(namePrefix));
  return key ? properties[key] : undefined;
}

/**
 * Resolve the stable name of the component SET an INSTANCE belongs to
 * (e.g. "Button - Nova"), via `componentId -> components[componentId]
 * .componentSetId -> componentSets[componentSetId].name`.
 *
 * This is the only reliable way to identify what component an instance
 * came from. `node.name` is just a layer label designers can (and do)
 * rename — a real button instance is commonly named "Login" or "Submit",
 * not "Button - Nova" — so matching on it silently misses renamed
 * instances. `componentId` isn't user-editable, so this lookup holds even
 * after a rename.
 *
 * Returns `null` if the componentId isn't in `components`, or its
 * componentSetId isn't in `componentSets` (e.g. a partial `getNodes()`
 * response whose lookup tables don't cover it).
 */
export function resolveComponentSetName(
  componentId: string,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap
): string | null {
  const componentSetId = components[componentId]?.componentSetId;
  if (!componentSetId) {
    return null;
  }
  return componentSets[componentSetId]?.name ?? null;
}

/**
 * True if `node` is an instance of the named component set, identified via
 * `resolveComponentSetName`. Falls back to comparing `node.name` (logging
 * a warning) only when the componentId lookup itself fails — see that
 * function's doc for why name matching alone is unreliable.
 */
function isInstanceOf(
  node: FigmaNode,
  componentSetName: string,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap
): boolean {
  if (node.componentId) {
    const setName = resolveComponentSetName(node.componentId, components, componentSets);
    if (setName != null) {
      return setName === componentSetName;
    }
  }

  logger.warn(
    `"${node.name}" (${node.id}): couldn't resolve a component set via componentId, ` +
      `falling back to node.name — this is unreliable since designers can rename instances`
  );
  return node.name === componentSetName;
}

/**
 * Extract button data from an INSTANCE node's raw Figma payload, using
 * `components`/`componentSets` (from the same `getFile`/`getNodes` response
 * the node came from) to confirm it's actually a "Button - Nova" instance.
 * Returns `null` (rather than throwing) when the node isn't a Button - Nova
 * instance, or is missing the properties a button instance should have, so
 * callers can skip unexpected nodes without a try/catch per call.
 */
export function parseButtonComponent(
  node: FigmaNode,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap
): ParsedButton | null {
  if (!isInstanceOf(node, BUTTON_COMPONENT_SET_NAME, components, componentSets)) {
    return null;
  }

  const properties = node.componentProperties;
  const size = findProperty(properties, 'Size');
  const variant = findProperty(properties, 'Variant');
  const state = findProperty(properties, 'State');

  if (size?.type !== 'VARIANT' || variant?.type !== 'VARIANT' || state?.type !== 'VARIANT') {
    logger.warn(
      `Skipping "${node.name}" (${node.id}): missing Size/Variant/State component properties, ` +
        "doesn't look like a Button - Nova instance"
    );
    return null;
  }

  const labelNode = (node.children ?? []).find((child) => child.type === 'TEXT');

  return {
    size: String(size.value),
    variant: String(variant.value),
    state: String(state.value),
    hasLeftIcon: findProperty(properties, 'Show left icon')?.value === true,
    hasRightIcon: findProperty(properties, 'Show right icon')?.value === true,
    hasSpinner: findProperty(properties, 'Show spinner')?.value === true,
    label: labelNode?.characters ?? '',
    rawVariantName: node.name,
  };
}

/**
 * Extract label data from an INSTANCE node's raw Figma payload. Same
 * componentId-based identification and null-on-mismatch pattern as
 * `parseButtonComponent`.
 */
export function parseLabelComponent(
  node: FigmaNode,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap
): ParsedLabel | null {
  if (!isInstanceOf(node, LABEL_COMPONENT_SET_NAME, components, componentSets)) {
    return null;
  }

  const properties = node.componentProperties;
  const layout = findProperty(properties, 'Layout');
  const state = findProperty(properties, 'State');
  const weight = findProperty(properties, 'Weight');

  if (layout?.type !== 'VARIANT' || state?.type !== 'VARIANT' || weight?.type !== 'VARIANT') {
    logger.warn(
      `Skipping "${node.name}" (${node.id}): missing Layout/State/Weight component properties, ` +
        "doesn't look like a Label instance"
    );
    return null;
  }

  const textNode = (node.children ?? []).find((child) => child.type === 'TEXT');

  return {
    layout: String(layout.value),
    state: String(state.value),
    weight: String(weight.value),
    text: textNode?.characters ?? '',
  };
}

/**
 * Extract input data from an INSTANCE node's raw Figma payload. Same
 * componentId-based identification and null-on-mismatch pattern as
 * `parseButtonComponent`.
 */
export function parseInputComponent(
  node: FigmaNode,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap
): ParsedInput | null {
  if (!isInstanceOf(node, INPUT_COMPONENT_SET_NAME, components, componentSets)) {
    return null;
  }

  const properties = node.componentProperties;
  const position = findProperty(properties, 'Position');
  const size = findProperty(properties, 'Size');
  const state = findProperty(properties, 'State');

  if (position?.type !== 'VARIANT' || size?.type !== 'VARIANT' || state?.type !== 'VARIANT') {
    logger.warn(
      `Skipping "${node.name}" (${node.id}): missing Position/Size/State component properties, ` +
        "doesn't look like an Input - Nova instance"
    );
    return null;
  }

  const value = findProperty(properties, 'Value');

  return {
    position: String(position.value),
    size: String(size.value),
    state: String(state.value),
    value: value?.type === 'TEXT' ? String(value.value) : '',
    showDecorationLeft: findProperty(properties, 'Show decoration left')?.value === true,
    showDecorationRight: findProperty(properties, 'Show decoration right')?.value === true,
    showPrependText: findProperty(properties, 'Show prepend text')?.value === true,
    showAppendText: findProperty(properties, 'Show append text')?.value === true,
  };
}

/** Direct children of a section instance that are themselves SLOT nodes, flattened into their content. */
function extractSlotContent(sectionNode: FigmaNode): FigmaNode[] {
  return (sectionNode.children ?? [])
    .filter((child) => child.type === 'SLOT')
    .flatMap((slot) => (slot.children ?? []).filter((grandchild) => grandchild.visible !== false));
}

/**
 * Extract Header/Body/Footer content from a "Card - Nova" instance.
 *
 * Card - Nova's three sections are all instances of the SAME component set
 * (".Card Section - Nova") with identical componentProperties
 * (Spacing/Background/Show border) — there's no property that says
 * "I'm the header". The only signal Figma gives us for *which* section a
 * given child is is that child's own `node.name` ("Header"/"Body"/
 * "Footer").
 *
 * This deliberately breaks our usual "never trust node.name" rule (see
 * `resolveComponentSetName`) — but note it's a narrower claim than the one
 * we normally distrust. We're not using node.name to identify WHAT
 * component something is (componentId + `isInstanceOf` still does that,
 * confirming this really is a ".Card Section - Nova" instance first); we
 * only use it to read a section's ROLE within a card whose identity is
 * already confirmed. A designer renaming "Header" to something else would
 * break this (logged as a warning below), but they'd have no reason to —
 * unlike an arbitrary button instance, which routinely gets renamed to
 * whatever it's used for ("Login", "Submit", ...).
 *
 * `parseChildFn` lets the caller (frame-parser.ts) supply its own
 * recursive node parser for each section's content, avoiding a circular
 * import between this file and frame-parser.ts.
 */
export function parseCardComponent<TNode>(
  node: FigmaNode,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap,
  parseChildFn: (node: FigmaNode) => TNode
): ParsedCard<TNode> | null {
  if (!isInstanceOf(node, CARD_COMPONENT_SET_NAME, components, componentSets)) {
    return null;
  }

  const card: ParsedCard<TNode> = { header: null, body: null, footer: null };

  for (const child of node.children ?? []) {
    if (child.type !== 'INSTANCE' || !child.componentId) {
      continue;
    }
    const sectionSetName = resolveComponentSetName(child.componentId, components, componentSets);
    if (sectionSetName !== CARD_SECTION_COMPONENT_SET_NAME) {
      continue;
    }

    const content = extractSlotContent(child).map(parseChildFn);
    switch (child.name.trim().toLowerCase()) {
      case 'header':
        card.header = content;
        break;
      case 'body':
        card.body = content;
        break;
      case 'footer':
        card.footer = content;
        break;
      default:
        logger.warn(
          `Skipping Card section "${child.name}" (${child.id}): expected its name to be ` +
            `"Header", "Body", or "Footer" to identify its role, got "${child.name}"`
        );
    }
  }

  return card;
}
