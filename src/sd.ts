import type { Config } from 'style-dictionary/types';

export function registerStyleDictionaryThings(StyleDictionary: any) {
  // Prevent double-registration in dev (Vite can re-run plugin code)
  if (StyleDictionary.__hd_registered) return;
  StyleDictionary.__hd_registered = true;

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

      const isThemedNamespace = (name: string) =>
        name.startsWith('theme-') ||
        name.startsWith('component-') ||
        name.startsWith('message-') ||
        name.startsWith('shadow-');

      const base = all
        .filter((t: any) => !t.attributes?.theme)
        .filter((t: any) => !isThemedNamespace(t.name))
        .sort(byName);

      const light = all
        .filter((t: any) => t.attributes?.theme === 'light')
        .sort(byName);
      const dark = all
        .filter((t: any) => t.attributes?.theme === 'dark')
        .sort(byName);
      const print = all
        .filter((t: any) => t.attributes?.theme === 'print')
        .sort(byName);

      const getValue = (t: any) => t.value ?? t.$value ?? '';

      const GROUPS = [
        { label: 'Palette', match: (n: string) => n.startsWith('palette-') },
        { label: 'Raw colors', match: (n: string) => n.startsWith('color-') },
        { label: 'Typography', match: (n: string) => n.startsWith('font-') },
        { label: 'Text styles', match: (n: string) => n.startsWith('text-') },

        { label: 'Theme', match: (n: string) => n.startsWith('theme-') },
        {
          label: 'Components',
          match: (n: string) => n.startsWith('component-'),
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
              s.tokens.map((t) => `  --${t.name}: ${getValue(t)};`).join('\n')
          )
          .join('\n\n');
      };

      const renderLines = (tokens: any[]) =>
        tokens.map((t) => `    --${t.name}: ${getValue(t)};`).join('\n');

      const out: string[] = [];

      if (base.length) out.push(`:root {\n${render(base)}\n}\n`);
      if (light.length)
        out.push(`\n:root[data-theme='light'] {\n${render(light)}\n}\n`);
      if (dark.length)
        out.push(`\n:root[data-theme='dark'] {\n${render(dark)}\n}\n`);

      if (light.length || print.length) {
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
        lines.push(`${toSassVar(t.name)}: ${t.value ?? t.$value ?? ''};`);
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
          lines.push(`  font: ${t.value ?? t.$value ?? ''};`);
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

export function makeStyleDictionaryConfig(): Config {
  return {
    source: ['tokens/**/*.json'],

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
