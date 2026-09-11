import { FigmaComponentsMap, FigmaComponentSetsMap, FigmaNode } from '../types/figma';
import {
  ParsedButton,
  ParsedCard,
  ParsedInput,
  ParsedLabel,
  parseButtonComponent,
  parseCardComponent,
  parseInputComponent,
  parseLabelComponent,
} from './shadcn-parser';

export interface ParsedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * A generic intermediate representation of a Figma node, ready to hand to
 * a code generator. Recognized components (Button - Nova, Label, Input -
 * Nova, Card - Nova) get their own `kind`; auto-layout frames/groups/slots
 * become `container`; plain text becomes `text`; anything else is
 * `unknown` and left unexpanded.
 */
export type ParsedNode =
  | ({ kind: 'button' } & ParsedButton)
  | ({ kind: 'label' } & ParsedLabel)
  | ({ kind: 'input' } & ParsedInput)
  | ({ kind: 'card' } & ParsedCard<ParsedNode>)
  | { kind: 'text'; content: string }
  | {
      kind: 'container';
      direction: 'row' | 'column';
      gap: number;
      padding: ParsedPadding;
      children: ParsedNode[];
    }
  | { kind: 'unknown'; nodeType: string; name: string };

/**
 * Recursively parse a Figma node into a `ParsedNode`, using
 * `components`/`componentSets` (from the same `getFile`/`getNodes`
 * response the node came from) to identify recognized component
 * instances by componentId rather than by name.
 *
 * Pure and read-only — makes no API calls and mutates nothing.
 */
export function parseFrameNode(
  node: FigmaNode,
  components: FigmaComponentsMap,
  componentSets: FigmaComponentSetsMap
): ParsedNode {
  if (node.type === 'INSTANCE') {
    const card = parseCardComponent(node, components, componentSets, (child) =>
      parseFrameNode(child, components, componentSets)
    );
    if (card) {
      return { kind: 'card', ...card };
    }

    const button = parseButtonComponent(node, components, componentSets);
    if (button) {
      return { kind: 'button', ...button };
    }

    const label = parseLabelComponent(node, components, componentSets);
    if (label) {
      return { kind: 'label', ...label };
    }

    const input = parseInputComponent(node, components, componentSets);
    if (input) {
      return { kind: 'input', ...input };
    }
  }

  if (node.type === 'TEXT') {
    return { kind: 'text', content: node.characters ?? '' };
  }

  // SLOT nodes (instance-swap slot content, e.g. the Header/Body/Footer
  // slots inside a "Card - Nova" instance) carry layoutMode/children just
  // like a FRAME and wrap the card's real content — treat them as a
  // container too, or the whole subtree placed into the slot is silently
  // dropped as "unknown".
  const isLayoutContainer =
    (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'INSTANCE' || node.type === 'SLOT') &&
    (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL');

  if (isLayoutContainer) {
    const children = (node.children ?? [])
      .filter((child) => child.visible !== false)
      .map((child) => parseFrameNode(child, components, componentSets));

    return {
      kind: 'container',
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: node.itemSpacing ?? 0,
      padding: {
        top: node.paddingTop ?? 0,
        right: node.paddingRight ?? 0,
        bottom: node.paddingBottom ?? 0,
        left: node.paddingLeft ?? 0,
      },
      children,
    };
  }

  // Not yet handled: RECTANGLE decoration, INSTANCEs of components without
  // a dedicated parser, etc. Left as a leaf rather than recursed into, so
  // future parsers can claim these node shapes without this function
  // needing to know about them.
  return { kind: 'unknown', nodeType: node.type, name: node.name };
}
