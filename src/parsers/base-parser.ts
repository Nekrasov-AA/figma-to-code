export interface Component {
  name: string;
  type: 'button' | 'card' | 'input' | 'other';
  props: Record<string, any>;
  children?: Component[];
}

export abstract class BaseParser {
  abstract parse(figmaFile: any): Component[];

  protected identifyComponentType(name: string): Component['type'] {
    const lower = name.toLowerCase();
    if (lower.includes('button')) return 'button';
    if (lower.includes('card')) return 'card';
    if (lower.includes('input')) return 'input';
    return 'other';
  }
}
