import { ParsedNode } from '../parsers/frame-parser';
import { logger } from '../utils/logger';

/**
 * Figma "Variant" values (from the Obra Nova kit) -> shadcn/ui Button's
 * `variant` prop values. Extend this when wiring up other component sets
 * or when the kit adds variants.
 */
export const BUTTON_VARIANT_MAP: Record<string, string> = {
  Primary: 'default',
  Outline: 'outline',
  Destructive: 'destructive',
  Ghost: 'ghost',
  Secondary: 'secondary',
  Link: 'link',
};

/**
 * Figma "Size" values -> shadcn/ui Button's `size` prop values.
 * `undefined` means "omit the prop" — either because shadcn's default
 * already matches (Default), or because there's no good equivalent.
 */
export const BUTTON_SIZE_MAP: Record<string, string | undefined> = {
  Default: undefined,
  Small: 'sm',
  'Extra small': 'sm',
};

type UsedImport = 'button' | 'input' | 'label' | 'card' | 'cardHeader' | 'cardContent' | 'cardFooter';

function indent(level: number): string {
  return '  '.repeat(level);
}

/** Escapes characters that would otherwise break out of JSX text content. */
function escapeJsxText(text: string): string {
  return text.replace(/[{}]/g, (ch) => (ch === '{' ? '&#123;' : '&#125;'));
}

/** Escapes characters that would otherwise break out of a `"..."` JSX attribute value. */
function escapeJsxAttribute(text: string): string {
  return text.replace(/"/g, '&quot;');
}

function mapButtonVariant(rawVariant: string): string {
  if (rawVariant in BUTTON_VARIANT_MAP) {
    return BUTTON_VARIANT_MAP[rawVariant];
  }
  logger.warn(`Unmapped Button variant "${rawVariant}"; falling back to a lowercased variant prop`);
  return rawVariant.toLowerCase();
}

function mapButtonSize(rawSize: string): string | undefined {
  if (rawSize in BUTTON_SIZE_MAP) {
    return BUTTON_SIZE_MAP[rawSize];
  }
  logger.warn(`Unmapped Button size "${rawSize}"; omitting the size prop`);
  return undefined;
}

function buildContainerClassName(node: Extract<ParsedNode, { kind: 'container' }>): string {
  const classes = ['flex', node.direction === 'row' ? 'flex-row' : 'flex-col'];

  if (node.gap > 0) {
    classes.push(`gap-[${node.gap}px]`);
  }

  // Figma's exact pixel values don't map onto Tailwind's default spacing
  // scale, so we use arbitrary-value classes throughout rather than
  // rounding to the nearest scale step. Tailwind's arbitrary shorthand has
  // no way to omit individual zero sides from a T_R_B_L value, so we only
  // drop the padding class entirely when every side is 0 — otherwise keep
  // all four values, zeros included.
  const { top, right, bottom, left } = node.padding;
  if (top > 0 || right > 0 || bottom > 0 || left > 0) {
    const isUniform = top === right && right === bottom && bottom === left;
    classes.push(isUniform ? `p-[${top}px]` : `p-[${top}px_${right}px_${bottom}px_${left}px]`);
  }

  return classes.join(' ');
}

/**
 * Recursively renders a `ParsedNode` tree into a JSX string, indented
 * `indentLevel` levels deep (2 spaces per level).
 */
export function generateJsx(node: ParsedNode, indentLevel = 0): string {
  const pad = indent(indentLevel);

  switch (node.kind) {
    case 'button': {
      const variant = mapButtonVariant(node.variant);
      const size = mapButtonSize(node.size);
      const sizeProp = size ? ` size="${size}"` : '';
      return `${pad}<Button variant="${variant}"${sizeProp}>${escapeJsxText(node.label)}</Button>`;
    }

    case 'label':
      return `${pad}<Label>${escapeJsxText(node.text)}</Label>`;

    case 'input':
      // shadcn's Input has no "controlled example value" prop matching
      // Figma's "Value" property in this kit — that property represents
      // placeholder-style example text, so we map it to `placeholder`.
      return `${pad}<Input placeholder="${escapeJsxAttribute(node.value)}" />`;

    case 'text':
      return `${pad}<p>${escapeJsxText(node.content)}</p>`;

    case 'container': {
      const className = buildContainerClassName(node);
      if (node.children.length === 0) {
        return `${pad}<div className="${className}" />`;
      }
      const childrenJsx = node.children.map((child) => generateJsx(child, indentLevel + 1)).join('\n');
      return `${pad}<div className="${className}">\n${childrenJsx}\n${pad}</div>`;
    }

    case 'card': {
      const sections = [
        node.header?.length ? renderCardSection('CardHeader', node.header, indentLevel + 1) : null,
        node.body?.length ? renderCardSection('CardContent', node.body, indentLevel + 1) : null,
        node.footer?.length ? renderCardSection('CardFooter', node.footer, indentLevel + 1) : null,
      ].filter((section): section is string => section !== null);

      if (sections.length === 0) {
        return `${pad}<Card />`;
      }
      return `${pad}<Card>\n${sections.join('\n')}\n${pad}</Card>`;
    }

    case 'unknown':
      logger.warn(`Unhandled node in generateJsx: ${node.nodeType} "${node.name}"`);
      return `${pad}{/* Unhandled: ${node.nodeType} "${node.name}" */}`;
  }
}

function renderCardSection(tag: string, children: ParsedNode[], indentLevel: number): string {
  const pad = indent(indentLevel);
  const childrenJsx = children.map((child) => generateJsx(child, indentLevel + 1)).join('\n');
  return `${pad}<${tag}>\n${childrenJsx}\n${pad}</${tag}>`;
}

/**
 * Walks the tree collecting which shadcn components are actually used, so
 * imports stay minimal — including only the Card/CardHeader/CardContent/
 * CardFooter sub-imports a given card instance actually renders (see
 * `generateJsx`'s 'card' case, which the checks below mirror).
 */
function collectUsedImports(node: ParsedNode, used: Set<UsedImport> = new Set()): Set<UsedImport> {
  switch (node.kind) {
    case 'button':
    case 'input':
    case 'label':
      used.add(node.kind);
      break;

    case 'card':
      used.add('card');
      if (node.header?.length) {
        used.add('cardHeader');
        node.header.forEach((child) => collectUsedImports(child, used));
      }
      if (node.body?.length) {
        used.add('cardContent');
        node.body.forEach((child) => collectUsedImports(child, used));
      }
      if (node.footer?.length) {
        used.add('cardFooter');
        node.footer.forEach((child) => collectUsedImports(child, used));
      }
      break;

    case 'container':
      node.children.forEach((child) => collectUsedImports(child, used));
      break;
  }
  return used;
}

/** Which module each shadcn import comes from, and its exported name there — several Card imports share one module. */
const IMPORT_SPECS: { key: UsedImport; name: string; module: string }[] = [
  { key: 'button', name: 'Button', module: '@/components/ui/button' },
  { key: 'input', name: 'Input', module: '@/components/ui/input' },
  { key: 'label', name: 'Label', module: '@/components/ui/label' },
  { key: 'card', name: 'Card', module: '@/components/ui/card' },
  { key: 'cardHeader', name: 'CardHeader', module: '@/components/ui/card' },
  { key: 'cardContent', name: 'CardContent', module: '@/components/ui/card' },
  { key: 'cardFooter', name: 'CardFooter', module: '@/components/ui/card' },
];

function buildShadcnImportLines(used: Set<UsedImport>): string[] {
  const namesByModule = new Map<string, string[]>();

  for (const spec of IMPORT_SPECS) {
    if (!used.has(spec.key)) {
      continue;
    }
    const names = namesByModule.get(spec.module) ?? [];
    names.push(spec.name);
    namesByModule.set(spec.module, names);
  }

  return Array.from(namesByModule.entries()).map(
    ([module, names]) => `import { ${names.join(', ')} } from "${module}";`
  );
}

export interface GenerateComponentFileOptions {
  /**
   * Emit `import React from 'react';`. Default `false` — modern React and
   * Next.js use the new JSX transform and don't need it. Set `true` for
   * older setups (e.g. CRA) that still require it in scope.
   */
  includeReactImport?: boolean;
}

/**
 * Renders a full `.tsx` component file — imports, a `{componentName}`
 * function component, and its JSX body — from a parsed node tree.
 */
export function generateComponentFile(
  rootNode: ParsedNode,
  componentName: string,
  options: GenerateComponentFileOptions = {}
): string {
  const { includeReactImport = false } = options;
  const usedImports = collectUsedImports(rootNode);
  const shadcnImportLines = buildShadcnImportLines(usedImports);

  const importLines = [
    ...(includeReactImport ? ["import React from 'react';"] : []),
    ...shadcnImportLines,
  ];
  const jsx = generateJsx(rootNode, 2);

  return [
    ...importLines,
    ...(importLines.length > 0 ? [''] : []),
    `export function ${componentName}() {`,
    '  return (',
    jsx,
    '  );',
    '}',
    '',
  ].join('\n');
}
