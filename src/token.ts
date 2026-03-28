import { toCssVarReference } from './cssVar';

export type TokenValueMap = Record<string, unknown>;

export type TokenOptions = {
  prefix?: string;
  target?: Document | Element | ShadowRoot | null;
};

export type TokenValueOptions = {
  values?: TokenValueMap | null;
};

function resolveTarget(target?: TokenOptions['target']) {
  if (typeof Element !== 'undefined' && target instanceof Element) return target;
  if (typeof Document !== 'undefined' && target instanceof Document) {
    return target.documentElement;
  }
  if (typeof ShadowRoot !== 'undefined' && target instanceof ShadowRoot) {
    return typeof Element !== 'undefined' && target.host instanceof Element
      ? target.host
      : null;
  }

  if (typeof document !== 'undefined') {
    return document.documentElement;
  }

  return null;
}

export function token(path: string, options: TokenOptions = {}) {
  const element = resolveTarget(options.target);
  if (!element || typeof getComputedStyle !== 'function') {
    return undefined;
  }

  const value = getComputedStyle(element)
    .getPropertyValue(toCssVarReference(path, options.prefix))
    .trim();

  return value || undefined;
}

export function tokenValue(
  path: string,
  options: TokenValueOptions = {}
) {
  const values = options.values ?? undefined;
  if (!values || !Object.hasOwn(values, path)) {
    return undefined;
  }

  return values[path];
}
