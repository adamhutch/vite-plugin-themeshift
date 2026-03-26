export function normalizeCssVarPrefix(prefix?: string): string | undefined {
  const normalized = prefix?.trim().replace(/^-+|-+$/g, '').replace(/_/g, '-');

  return normalized ? normalized : undefined;
}

export function pathToCssVarName(path: string, prefix?: string): string {
  const normalizedPath = path
    .replace(/\./g, '-')
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
  const normalizedPrefix = normalizeCssVarPrefix(prefix);

  return [normalizedPrefix, normalizedPath].filter(Boolean).join('-');
}

export function toCssVarReference(path: string, prefix?: string): string {
  return `--${pathToCssVarName(path, prefix)}`;
}
