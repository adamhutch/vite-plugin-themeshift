import type { Config, LogConfig } from 'style-dictionary/types';

import { pathToCssVarName } from './cssVar';
import type {
  ThemeShiftCssGroup,
  ThemeShiftPlatform,
  ThemeShiftTokenFilter,
  ThemeShiftTokenFilterRule,
} from './plugin';

function serializeTypographyValue(value: Record<string, unknown>) {
  const fontStyle = typeof value.fontStyle === 'string' ? value.fontStyle : '';
  const fontVariant =
    typeof value.fontVariant === 'string' ? value.fontVariant : '';
  const fontWeight =
    typeof value.fontWeight === 'string' || typeof value.fontWeight === 'number'
      ? String(value.fontWeight)
      : '';
  const fontSize =
    typeof value.fontSize === 'string' || typeof value.fontSize === 'number'
      ? String(value.fontSize)
      : '';
  const lineHeight =
    typeof value.lineHeight === 'string' || typeof value.lineHeight === 'number'
      ? String(value.lineHeight)
      : '';
  const fontFamily =
    typeof value.fontFamily === 'string' ? value.fontFamily : '';

  const fontShorthand = [
    fontStyle,
    fontVariant,
    fontWeight,
    fontSize ? `${fontSize}${lineHeight ? `/${lineHeight}` : ''}` : '',
    fontFamily,
  ]
    .filter(Boolean)
    .join(' ');
  return fontShorthand;
}

function getTokenValue(token: any) {
  const value = token.value ?? token.$value ?? '';

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const tokenType = token.type ?? token.$type;
  const looksLikeTypography =
    tokenType === 'typography' ||
    'fontFamily' in value ||
    'fontSize' in value ||
    'lineHeight' in value;

  if (looksLikeTypography) {
    return serializeTypographyValue(value);
  }

  return String(value);
}

const DEFAULT_SCSS_FILTER_RULE: ThemeShiftTokenFilterRule = {
  includePrefixes: ['radius-', 'spacing-', 'font-', 'text-', 'layout-'],
};

const DEFAULT_CSS_GROUPS: ThemeShiftCssGroup[] = [
  { label: 'Colors', match: (n: string) => n.startsWith('color-') },
  {
    label: 'Typography',
    match: (n: string) =>
      n.startsWith('font-') || n.startsWith('typography-'),
  },
  {
    label: 'Accessibility',
    match: (n: string) =>
      n.startsWith('accessibility-') || n.startsWith('a11y-'),
  },
  { label: 'Theme', match: (n: string) => n.startsWith('theme-') },
  {
    label: 'Components',
    match: (n: string) =>
      n.startsWith('component-') || n.startsWith('components-'),
  },
  { label: 'Other', match: (_n: string) => true },
];

function serializeGroups(groups?: ThemeShiftCssGroup[]) {
  return groups?.map((group) => ({
    label: group.label,
    match: group.match.toString(),
  }));
}

function matchesPrefixRule(name: string, rule: ThemeShiftTokenFilterRule) {
  const includePrefixes = rule.includePrefixes ?? [];
  const excludePrefixes = rule.excludePrefixes ?? [];
  const included =
    includePrefixes.length === 0 ||
    includePrefixes.some((prefix) => name.startsWith(prefix));
  const excluded = excludePrefixes.some((prefix) => name.startsWith(prefix));

  return included && !excluded;
}

function applyPlatformFilter(
  tokens: any[],
  platform: ThemeShiftPlatform,
  filters?: Partial<Record<ThemeShiftPlatform, ThemeShiftTokenFilter>>
) {
  const filter = filters?.[platform];

  if (typeof filter === 'function') {
    return tokens.filter((token) => filter(token));
  }

  if (filter) {
    return tokens.filter((token) => matchesPrefixRule(token.name, filter));
  }

  if (platform === 'scss') {
    return tokens.filter((token) => {
      if (token.attributes?.theme) return false;
      return matchesPrefixRule(token.name, DEFAULT_SCSS_FILTER_RULE);
    });
  }

  return tokens;
}

export function registerStyleDictionaryThings(
  StyleDictionary: any,
  options: {
    cssVarPrefix?: string;
    groups?: ThemeShiftCssGroup[];
    defaultTheme?: 'light' | 'dark';
    filters?: Partial<Record<ThemeShiftPlatform, ThemeShiftTokenFilter>>;
    outputPrintTheme?: boolean;
  } = {}
) {
  const {
    cssVarPrefix,
    groups,
    defaultTheme,
    filters,
    outputPrintTheme = false,
  } =
    options;

  // Prevent double-registration in dev (Vite can re-run plugin code)
  const registrationKey = JSON.stringify({
    cssVarPrefix: cssVarPrefix ?? null,
    groups: serializeGroups(groups) ?? null,
    defaultTheme: defaultTheme ?? null,
    filters:
      filters &&
      Object.fromEntries(
        Object.entries(filters).map(([platform, filter]) => [
          platform,
          typeof filter === 'function' ? '__fn__' : filter,
        ])
      ),
    outputPrintTheme,
  });
  if (!(StyleDictionary.__hd_registered instanceof Set)) {
    StyleDictionary.__hd_registered = new Set<string>();
  }
  if (StyleDictionary.__hd_registered.has(registrationKey)) return;
  StyleDictionary.__hd_registered.add(registrationKey);

  /**
   * Attribute transform: tag tokens as themed if their path contains light|dark|print.
   */
  StyleDictionary.registerTransform({
    name: 'attribute/theme',
    type: 'attribute',
    transform: (token: any) => {
      const existing = token.attributes ?? {};
      const mode = (token.path ?? []).find(
        (p: string) => p === 'light' || p === 'dark' || p === 'print'
      );

      return mode ? { ...existing, theme: mode } : existing;
    },
  });

  /**
   * Name transform: drop light|dark|print segments so vars collide intentionally.
   */
  StyleDictionary.registerTransform({
    name: 'name/drop-theme-segment',
    type: 'name',
    transform: (token: any) => {
      const path = token.path ?? [];
      const normalizedPath = path.filter(
        (p: string) => p !== 'light' && p !== 'dark' && p !== 'print'
      );

      return normalizedPath
        .join('-')
        .replace(/_/g, '-')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
    },
  });

  /**
   * CSS format: your grouped + modes output (unchanged)
   */
  StyleDictionary.registerFormat({
    name: 'css/variables-modes-grouped',
    format: ({ dictionary }: any) => {
      const all = dictionary.allTokens ?? [];
      const byName = (a: any, b: any) => a.name.localeCompare(b.name);
      const filtered = applyPlatformFilter(all, 'css', filters);
      const activeGroups = groups ?? DEFAULT_CSS_GROUPS;

      const base = filtered.filter((t: any) => !t.attributes?.theme).sort(byName);

      const light = filtered
        .filter((t: any) => t.attributes?.theme === 'light')
        .sort(byName);
      const dark = filtered
        .filter((t: any) => t.attributes?.theme === 'dark')
        .sort(byName);
      const print = filtered
        .filter((t: any) => t.attributes?.theme === 'print')
        .sort(byName);

      const groupTokens = (tokens: any[]) => {
        const remaining = [...tokens];
        const sections: { label: string; tokens: any[] }[] = [];

        for (const g of activeGroups) {
          const picked = remaining.filter((t) => g.match(t.name));
          if (!picked.length) continue;

          for (const t of picked) {
            const idx = remaining.indexOf(t);
            if (idx >= 0) remaining.splice(idx, 1);
          }

          sections.push({ label: g.label, tokens: picked.sort(byName) });
        }

        return sections;
      };

      const render = (tokens: any[]) => {
        const sections = groupTokens(tokens);
        return sections
          .map(
            (s) =>
              `  /* ${s.label} */\n` +
              s.tokens
                .map(
                  (t) =>
                    `  --${pathToCssVarName(t.name, cssVarPrefix)}: ${getTokenValue(t)};`
                )
                .join('\n')
          )
          .join('\n\n');
      };

      const renderLines = (tokens: any[]) =>
        tokens
          .map(
            (t) =>
              `    --${pathToCssVarName(t.name, cssVarPrefix)}: ${getTokenValue(t)};`
          )
          .join('\n');

      const out: string[] = [];
      const rootTokens = [
        ...base,
        ...(defaultTheme === 'light' ? light : []),
        ...(defaultTheme === 'dark' ? dark : []),
      ];

      if (rootTokens.length) out.push(`:root {\n${render(rootTokens)}\n}\n`);
      if (light.length)
        out.push(`\n:root[data-theme='light'] {\n${render(light)}\n}\n`);
      if (dark.length)
        out.push(`\n:root[data-theme='dark'] {\n${render(dark)}\n}\n`);

      if (outputPrintTheme && (light.length || print.length)) {
        const lightVars = light.length ? renderLines(light) : '';
        const printVars = print.length ? renderLines(print) : '';

        out.push(
          `\n:root[data-theme='print'] {\n${[lightVars, printVars].filter(Boolean).join('\n')}\n}\n`
        );

        out.push(
          `\n@media print {\n  :root {\n${[lightVars, printVars].filter(Boolean).join('\n')}\n  }\n}\n`
        );
      }

      return out.join('');
    },
  });

  /**
   * SCSS format: static tokens only (unchanged)
   */
  StyleDictionary.registerFormat({
    name: 'scss/static-tokens',
    format: ({ dictionary }: any) => {
      const all = dictionary.allTokens ?? [];
      const byName = (a: any, b: any) => a.name.localeCompare(b.name);
      const tokens = applyPlatformFilter(all, 'scss', filters).sort(byName);

      const toSassVar = (cssName: string) => `$${cssName.replace(/-/g, '_')}`;

      const lines: string[] = [];
      lines.push(
        '// Auto-generated by Style Dictionary. Do not edit directly.'
      );
      lines.push('');

      for (const t of tokens) {
        lines.push(`${toSassVar(t.name)}: ${getTokenValue(t)};`);
      }

      const typography = tokens.filter((t: any) =>
        t.name.startsWith('text-style-')
      );
      if (typography.length) {
        lines.push('');
        lines.push('// Typography mixins');
        for (const t of typography) {
          const mixinName = t.name.replace(/-/g, '_');
          lines.push(`@mixin ${mixinName} {`);
          lines.push(`  font: ${getTokenValue(t)};`);
          lines.push('}');
        }
      }

      lines.push('');
      return lines.join('\n');
    },
  });

  StyleDictionary.registerFormat({
    name: 'token/paths-json',
    format: ({ dictionary }: any) => {
      const paths = applyPlatformFilter(
        dictionary.allTokens ?? [],
        'meta',
        filters
      ).map((t: any) => t.path.join('.'));
      paths.sort();
      return JSON.stringify(paths, null, 2);
    },
  });

  StyleDictionary.registerFormat({
    name: 'token/paths-ts',
    format: ({ dictionary }: any) => {
      const paths = applyPlatformFilter(
        dictionary.allTokens ?? [],
        'meta',
        filters
      )
        .map((t: any) => t.path.join('.'))
        .sort();
      return `/* auto-generated */
export const tokenPaths = ${JSON.stringify(paths, null, 2)} as const;
export type TokenPath = (typeof tokenPaths)[number];
`;
    },
  });

  StyleDictionary.registerFormat({
    name: 'token/values-json',
    format: ({ dictionary }: any) => {
      const values = Object.fromEntries(
        applyPlatformFilter(dictionary.allTokens ?? [], 'meta', filters)
          .map((t: any) => [t.path.join('.'), t.value ?? t.$value ?? null])
          .sort(([a]: [string, unknown], [b]: [string, unknown]) =>
            a.localeCompare(b)
          )
      );

      return JSON.stringify(values, null, 2);
    },
  });

  StyleDictionary.registerFormat({
    name: 'token/values-ts',
    format: ({ dictionary }: any) => {
      const values = Object.fromEntries(
        applyPlatformFilter(dictionary.allTokens ?? [], 'meta', filters)
          .map((t: any) => [t.path.join('.'), t.value ?? t.$value ?? null])
          .sort(([a]: [string, unknown], [b]: [string, unknown]) =>
            a.localeCompare(b)
          )
      );

      return `/* auto-generated */
export const tokenValues = ${JSON.stringify(values, null, 2)} as const;
export type TokenValuePath = keyof typeof tokenValues;
`;
    },
  });
}

export function makeStyleDictionaryConfig(options: {
  log?: LogConfig;
  source?: string[];
} = {}): Config {
  return {
    log: options.log,
    source: options.source ?? ['tokens/**/*.json'],

    platforms: {
      css: {
        transformGroup: 'css',
        transforms: [
          'attribute/cti',
          'attribute/theme',
          'name/drop-theme-segment',
        ],
        buildPath: 'src/css/',
        files: [
          { destination: 'tokens.css', format: 'css/variables-modes-grouped' },
        ],
      },

      scss: {
        transformGroup: 'scss',
        transforms: [
          'attribute/cti',
          'attribute/theme',
          'name/drop-theme-segment',
        ],
        buildPath: 'src/sass/',
        files: [
          { destination: '_tokens.static.scss', format: 'scss/static-tokens' },
        ],
      },

      meta: {
        transforms: ['attribute/cti', 'name/kebab'],
        buildPath: 'src/design-tokens/',
        files: [
          { destination: 'token-paths.json', format: 'token/paths-json' },
          { destination: 'token-paths.ts', format: 'token/paths-ts' },
          { destination: 'token-values.json', format: 'token/values-json' },
          { destination: 'token-values.ts', format: 'token/values-ts' },
        ],
      },
    },
  };
}
