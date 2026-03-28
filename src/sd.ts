import type { Config, LogConfig } from 'style-dictionary/types';

import { pathToCssVarName } from './cssVar';

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

export function registerStyleDictionaryThings(
  StyleDictionary: any,
  options: {
    cssVarPrefix?: string;
    defaultTheme?: 'light' | 'dark';
    outputPrintTheme?: boolean;
  } = {}
) {
  const { cssVarPrefix, defaultTheme, outputPrintTheme = false } = options;

  // Prevent double-registration in dev (Vite can re-run plugin code)
  const registrationKey = JSON.stringify({
    cssVarPrefix: cssVarPrefix ?? null,
    defaultTheme: defaultTheme ?? null,
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

      const base = all.filter((t: any) => !t.attributes?.theme).sort(byName);

      const light = all
        .filter((t: any) => t.attributes?.theme === 'light')
        .sort(byName);
      const dark = all
        .filter((t: any) => t.attributes?.theme === 'dark')
        .sort(byName);
      const print = all
        .filter((t: any) => t.attributes?.theme === 'print')
        .sort(byName);

      const GROUPS = [
        { label: 'Palette', match: (n: string) => n.startsWith('palette-') },
        { label: 'Raw colors', match: (n: string) => n.startsWith('color-') },
        { label: 'Typography', match: (n: string) => n.startsWith('font-') },
        { label: 'Text styles', match: (n: string) => n.startsWith('text-') },
        {
          label: 'Accessibility',
          match: (n: string) =>
            n.startsWith('accessibility-') ||
            n.startsWith('a11y-'),
        },

        { label: 'Theme', match: (n: string) => n.startsWith('theme-') },
        {
          label: 'Components',
          match: (n: string) =>
            n.startsWith('component-') || n.startsWith('components-'),
        },
        { label: 'Messages', match: (n: string) => n.startsWith('message-') },
        { label: 'Shadows', match: (n: string) => n.startsWith('shadow-') },

        { label: 'Other', match: (_n: string) => true },
      ];

      const groupTokens = (tokens: any[]) => {
        const remaining = [...tokens];
        const sections: { label: string; tokens: any[] }[] = [];

        for (const g of GROUPS) {
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

      const ALLOWED_PREFIXES = ['radius-', 'spacing-', 'font-', 'text-'];

      const isAllowed = (name: string) =>
        ALLOWED_PREFIXES.some((p) => name.startsWith(p));

      const tokens = all
        .filter((t: any) => !t.attributes?.theme)
        .filter((t: any) => isAllowed(t.name))
        .sort(byName);

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
      const paths = dictionary.allTokens.map((t: any) => t.path.join('.'));
      paths.sort();
      return JSON.stringify(paths, null, 2);
    },
  });

  StyleDictionary.registerFormat({
    name: 'token/paths-ts',
    format: ({ dictionary }: any) => {
      const paths = dictionary.allTokens
        .map((t: any) => t.path.join('.'))
        .sort();
      return `/* auto-generated */
export const tokenPaths = ${JSON.stringify(paths, null, 2)} as const;
export type TokenPath = (typeof tokenPaths)[number];
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
        ],
      },
    },
  };
}
