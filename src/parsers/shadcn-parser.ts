import { FigmaComponentPropertyValue, FigmaNode } from '../types/figma';
import { logger } from '../utils/logger';

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
  /** The node's own name, e.g. "Button - Nova", kept as a fallback. */
  rawVariantName: string;
}

/**
 * Look up a componentProperties entry by name prefix instead of exact key.
 *
 * Figma suffixes some property keys with an internal property id that
 * varies per component/instance, e.g. `"Show spinner#6046:3"` instead of
 * plain `"Show spinner"`. Variant properties (Size/Variant/State) are
 * usually unsuffixed, but boolean ones reliably aren't — so every lookup
 * here matches by prefix to handle both cases uniformly.
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
 * Extract button data from a "Button - Nova" INSTANCE node's raw Figma
 * payload. Returns `null` (rather than throwing) when the node doesn't
 * have the properties a button instance should have, so callers can skip
 * unexpected nodes without a try/catch per call.
 */
export function parseButtonComponent(node: FigmaNode): ParsedButton | null {
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
