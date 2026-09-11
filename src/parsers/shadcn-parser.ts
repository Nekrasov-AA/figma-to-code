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
