export type StringCaseMap = {
  camel: string;
  snake: string;
  kebab: string;
  pascal: string;
  constant: string;
};

function splitWords(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function toCamelCase(input: string): string {
  const words = splitWords(input);
  if (words.length === 0) return '';
  return words[0]! + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export function toPascalCase(input: string): string {
  return splitWords(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function toSnakeCase(input: string): string {
  return splitWords(input).join('_');
}

export function toKebabCase(input: string): string {
  return splitWords(input).join('-');
}

export function toConstantCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toUpperCase())
    .join('_');
}

export function convertAllCases(input: string): StringCaseMap {
  return {
    camel: toCamelCase(input),
    snake: toSnakeCase(input),
    kebab: toKebabCase(input),
    pascal: toPascalCase(input),
    constant: toConstantCase(input),
  };
}
