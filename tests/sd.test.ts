import { describe, expect, it } from 'vitest';

import { registerStyleDictionaryThings } from '../src/sd';

function makeStyleDictionaryMock() {
  const formats = new Map<string, ({ dictionary }: any) => string>();

  return {
    __hd_registered: false,
    registerTransform() {},
    registerFormat({
      name,
      format,
    }: {
      name: string;
      format: ({ dictionary }: any) => string;
    }) {
      formats.set(name, format);
    },
    getFormat(name: string) {
      return formats.get(name);
    },
  };
}

describe('registerStyleDictionaryThings', () => {
  it('emits unprefixed CSS variables by default', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [{ name: 'components-button-font', value: '600 1rem/1.2 Inter' }],
      },
    });

    expect(output).toContain('--components-button-font: 600 1rem/1.2 Inter;');
  });

  it('emits prefixed CSS variables when cssVarPrefix is set', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      cssVarPrefix: 'themeshift',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [{ name: 'components-button-font', value: '600 1rem/1.2 Inter' }],
      },
    });

    expect(output).toContain(
      '--themeshift-components-button-font: 600 1rem/1.2 Inter;'
    );
    expect(output).not.toContain('--components-button-font: 600 1rem/1.2 Inter;');
  });

  it('serializes typography object values into valid CSS variable values', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      cssVarPrefix: 'themeshift',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'text-style-title',
            type: 'typography',
            value: {
              fontFamily: '"Roboto Slab", Georgia, serif',
              fontSize: '1.25rem',
              lineHeight: '1.3',
              fontWeight: '400',
            },
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain(
      '--themeshift-text-style-title: 400 1.25rem/1.3 "Roboto Slab", Georgia, serif;'
    );
    expect(output).not.toContain('[object Object]');
  });

  it('keeps grouped CSS output valid for primitive and typography tokens together', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      cssVarPrefix: 'themeshift',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'components-button-padding',
            value: '1rem 2rem',
            attributes: {},
          },
          {
            name: 'text-style-title',
            type: 'typography',
            value: {
              fontFamily: '"Roboto Slab", Georgia, serif',
              fontSize: '1.25rem',
              lineHeight: '1.3',
              fontWeight: '400',
            },
            attributes: { theme: 'light' },
          },
          {
            name: 'text-style-title',
            type: 'typography',
            value: {
              fontFamily: '"Roboto Slab", Georgia, serif',
              fontSize: '1.25rem',
              lineHeight: '1.3',
              fontWeight: '500',
            },
            attributes: { theme: 'dark' },
          },
        ],
      },
    });

    expect(output).toContain(
      ':root {\n  /* Components */\n  --themeshift-components-button-padding: 1rem 2rem;'
    );
    expect(output).toContain(
      `:root[data-theme='light'] {\n  /* Other */\n  --themeshift-text-style-title: 400 1.25rem/1.3 "Roboto Slab", Georgia, serif;`
    );
    expect(output).toContain(
      `:root[data-theme='dark'] {\n  /* Other */\n  --themeshift-text-style-title: 500 1.25rem/1.3 "Roboto Slab", Georgia, serif;`
    );
  });

  it('emits a token values manifest with primitive and object values', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('token/values-ts');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            path: ['color', 'brand', 'primary'],
            value: '#005fcc',
          },
          {
            path: ['text', 'style', 'title'],
            value: {
              fontFamily: '"Roboto Slab", Georgia, serif',
              fontSize: '1.25rem',
              lineHeight: '1.3',
              fontWeight: '400',
            },
          },
        ],
      },
    });

    expect(output).toContain('"color.brand.primary": "#005fcc"');
    expect(output).toContain('"text.style.title": {');
    expect(output).toContain('"fontFamily": "\\"Roboto Slab\\", Georgia, serif"');
  });

  it('includes layout tokens in static Sass output with predictable variable names', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('scss/static-tokens');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'layout-breakpoints-mobile',
            value: '0px',
            attributes: {},
          },
          {
            name: 'layout-breakpoints-tablet',
            value: '768px',
            attributes: {},
          },
          {
            name: 'layout-breakpoints-desktop',
            value: '1024px',
            attributes: {},
          },
          {
            name: 'layout-site-max-width',
            value: '1200px',
            attributes: {},
          },
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('$layout_breakpoints_mobile: 0px;');
    expect(output).toContain('$layout_breakpoints_tablet: 768px;');
    expect(output).toContain('$layout_breakpoints_desktop: 1024px;');
    expect(output).toContain('$layout_site_max_width: 1200px;');
    expect(output).not.toContain('$theme_surface_base: #fff;');
  });

  it('supports declarative scss include/exclude prefix filters', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      filters: {
        scss: {
          includePrefixes: ['layout-', 'theme-'],
          excludePrefixes: ['theme-'],
        },
      },
    });

    const format = StyleDictionary.getFormat('scss/static-tokens');
    const output = format?.({
      dictionary: {
        allTokens: [
          { name: 'layout-breakpoints-tablet', value: '768px', attributes: {} },
          { name: 'theme-surface-base', value: '#fff', attributes: {} },
          { name: 'spacing-md', value: '1rem', attributes: {} },
        ],
      },
    });

    expect(output).toContain('$layout_breakpoints_tablet: 768px;');
    expect(output).not.toContain('$theme_surface_base: #fff;');
    expect(output).not.toContain('$spacing_md: 1rem;');
  });

  it('supports predicate scss filters', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      filters: {
        scss: (token) => token.name.startsWith('layout-'),
      },
    });

    const format = StyleDictionary.getFormat('scss/static-tokens');
    const output = format?.({
      dictionary: {
        allTokens: [
          { name: 'layout-breakpoints-desktop', value: '1024px', attributes: {} },
          { name: 'spacing-md', value: '1rem', attributes: {} },
        ],
      },
    });

    expect(output).toContain('$layout_breakpoints_desktop: 1024px;');
    expect(output).not.toContain('$spacing_md: 1rem;');
  });

  it('supports css filters without changing variable naming', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      cssVarPrefix: 'themeshift',
      filters: {
        css: {
          includePrefixes: ['layout-'],
        },
      },
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          { name: 'layout-site-max-width', value: '1200px', attributes: {} },
          { name: 'spacing-md', value: '1rem', attributes: {} },
        ],
      },
    });

    expect(output).toContain('--themeshift-layout-site-max-width: 1200px;');
    expect(output).not.toContain('--themeshift-spacing-md: 1rem;');
  });

  it('supports meta filters consistently for paths and values manifests', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      filters: {
        meta: {
          includePrefixes: ['layout-'],
        },
      },
    });

    const pathsFormat = StyleDictionary.getFormat('token/paths-ts');
    const valuesFormat = StyleDictionary.getFormat('token/values-ts');
    const dictionary = {
      allTokens: [
        {
          name: 'layout-site-max-width',
          path: ['layout', 'site', 'maxWidth'],
          value: '1200px',
          attributes: {},
        },
        {
          name: 'spacing-md',
          path: ['spacing', 'md'],
          value: '1rem',
          attributes: {},
        },
      ],
    };

    const pathsOutput = pathsFormat?.({ dictionary });
    const valuesOutput = valuesFormat?.({ dictionary });

    expect(pathsOutput).toContain('"layout.site.maxWidth"');
    expect(pathsOutput).not.toContain('"spacing.md"');
    expect(valuesOutput).toContain('"layout.site.maxWidth": "1200px"');
    expect(valuesOutput).not.toContain('"spacing.md": "1rem"');
  });

  it('does not emit print theme output by default', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
          {
            name: 'theme-surface-base',
            value: '#f5f5f5',
            attributes: { theme: 'print' },
          },
        ],
      },
    });

    expect(output).not.toContain(":root[data-theme='print']");
    expect(output).not.toContain('@media print');
  });

  it('does not duplicate themed tokens into :root when defaultTheme is unset', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
        ],
      },
    });

    expect(output).not.toContain(':root {\n  /* Theme */');
    expect(output).toContain(":root[data-theme='light'] {\n  /* Theme */");
  });

  it('duplicates light theme tokens into :root when defaultTheme is light', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      defaultTheme: 'light',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
          {
            name: 'theme-surface-base',
            value: '#111',
            attributes: { theme: 'dark' },
          },
        ],
      },
    });

    expect(output).toContain(':root {\n  /* Theme */\n  --theme-surface-base: #fff;');
    expect(output).toContain(
      ":root[data-theme='light'] {\n  /* Theme */\n  --theme-surface-base: #fff;"
    );
    expect(output).toContain(
      ":root[data-theme='dark'] {\n  /* Theme */\n  --theme-surface-base: #111;"
    );
  });

  it('duplicates dark theme tokens into :root when defaultTheme is dark', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      defaultTheme: 'dark',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
          {
            name: 'theme-surface-base',
            value: '#111',
            attributes: { theme: 'dark' },
          },
        ],
      },
    });

    expect(output).toContain(':root {\n  /* Theme */\n  --theme-surface-base: #111;');
    expect(output).toContain(
      ":root[data-theme='light'] {\n  /* Theme */\n  --theme-surface-base: #fff;"
    );
    expect(output).toContain(
      ":root[data-theme='dark'] {\n  /* Theme */\n  --theme-surface-base: #111;"
    );
  });

  it('lets the selected default theme win in :root when names collide with base tokens', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      defaultTheme: 'dark',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'components-button-surface-base',
            value: '#eee',
            attributes: {},
          },
          {
            name: 'components-button-surface-base',
            value: '#111',
            attributes: { theme: 'dark' },
          },
        ],
      },
    });

    expect(output).toContain(
      ':root {\n  /* Components */\n  --components-button-surface-base: #eee;\n  --components-button-surface-base: #111;'
    );
  });

  it('respects cssVarPrefix for defaultTheme fallback output', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      cssVarPrefix: 'themeshift',
      defaultTheme: 'light',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'components-button-surface-base',
            value: '#eee',
            attributes: { theme: 'light' },
          },
        ],
      },
    });

    expect(output).toContain(
      ':root {\n  /* Components */\n  --themeshift-components-button-surface-base: #eee;'
    );
  });

  it('does not emit print fallback blocks when only defaultTheme is set', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      defaultTheme: 'light',
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
          {
            name: 'theme-surface-base',
            value: '#f5f5f5',
            attributes: { theme: 'print' },
          },
        ],
      },
    });

    expect(output).not.toContain(":root[data-theme='print']");
    expect(output).not.toContain('@media print');
  });

  it('emits print theme output when outputPrintTheme is true', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      outputPrintTheme: true,
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
          {
            name: 'theme-surface-base',
            value: '#f5f5f5',
            attributes: { theme: 'print' },
          },
        ],
      },
    });

    expect(output).toContain(":root[data-theme='print']");
    expect(output).toContain('@media print');
  });

  it('groups accessibility tokens into the Accessibility bucket', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'a11y-focus-ring-color',
            value: '#005fcc',
            attributes: {},
          },
          {
            name: 'accessibility-outline-width',
            value: '2px',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('/* Accessibility */');
    expect(output).toContain('--a11y-focus-ring-color: #005fcc;');
    expect(output).toContain('--accessibility-outline-width: 2px;');
  });

  it('groups color tokens into the Colors bucket by default', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'color-brand-primary',
            value: '#005fcc',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('/* Colors */');
    expect(output).toContain('--color-brand-primary: #005fcc;');
  });

  it('groups typography-prefixed tokens into the Typography bucket by default', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'typography-body-md',
            value: '400 1rem/1.5 Inter',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('/* Typography */');
    expect(output).toContain('--typography-body-md: 400 1rem/1.5 Inter;');
  });

  it('groups component and components namespaces into the Components bucket', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    expect(format).toBeTypeOf('function');

    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'theme-surface-base',
            value: '#fff',
            attributes: { theme: 'light' },
          },
          {
            name: 'component-button-text',
            value: '#111',
            attributes: { theme: 'light' },
          },
          {
            name: 'components-button-surface-base',
            value: '#ccc',
            attributes: { theme: 'light' },
          },
        ],
      },
    });

    expect(output).toContain("/* Theme */");
    expect(output).toContain("/* Components */");
    expect(output).toContain('--component-button-text: #111;');
    expect(output).toContain('--components-button-surface-base: #ccc;');
    expect(output).not.toContain("/* Other */\n  --components-button-surface-base");
  });

  it('groups unmatched tokens into the Other bucket by default', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'text-style-title',
            value: '400 1.25rem/1.3 Inter',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('/* Other */');
    expect(output).toContain('--text-style-title: 400 1.25rem/1.3 Inter;');
  });

  it('supports custom css groups with first-match-wins ordering', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      groups: [
        { label: 'Buttons', match: (name) => name.startsWith('components-button-') },
        { label: 'Components', match: (name) => name.startsWith('components-') },
        { label: 'Other', match: (_name) => true },
      ],
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'components-button-text',
            value: '#111',
            attributes: {},
          },
          {
            name: 'components-card-surface',
            value: '#fff',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('/* Buttons */\n  --components-button-text: #111;');
    expect(output).toContain('/* Components */\n  --components-card-surface: #fff;');
    expect(output).not.toContain('/* Components */\n  --components-button-text: #111;');
  });

  it('keeps grouping based on raw token names when cssVarPrefix is set', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary, {
      cssVarPrefix: 'themeshift',
      groups: [
        { label: 'Components', match: (name) => name.startsWith('components-') },
        { label: 'Other', match: (_name) => true },
      ],
    });

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'components-button-text',
            value: '#111',
            attributes: {},
          },
        ],
      },
    });

    expect(output).toContain('/* Components */');
    expect(output).toContain('--themeshift-components-button-text: #111;');
    expect(output).not.toContain('--components-button-text: #111;');
  });

  it('emits mixed component namespaces into base and themed blocks', () => {
    const StyleDictionary = makeStyleDictionaryMock();
    registerStyleDictionaryThings(StyleDictionary);

    const format = StyleDictionary.getFormat('css/variables-modes-grouped');
    expect(format).toBeTypeOf('function');

    const output = format?.({
      dictionary: {
        allTokens: [
          {
            name: 'components-button-padding',
            value: '1rem 2rem 0',
            attributes: {},
          },
          {
            name: 'components-button-surface-base',
            value: '#ccc',
            attributes: { theme: 'light' },
          },
          {
            name: 'components-button-surface-base',
            value: 'hotpink',
            attributes: { theme: 'dark' },
          },
        ],
      },
    });

    expect(output).toContain(':root {\n  /* Components */\n  --components-button-padding: 1rem 2rem 0;');
    expect(output).toContain(
      ":root[data-theme='light'] {\n  /* Components */\n  --components-button-surface-base: #ccc;"
    );
    expect(output).toContain(
      ":root[data-theme='dark'] {\n  /* Components */\n  --components-button-surface-base: hotpink;"
    );
    expect(output).not.toContain(
      ":root[data-theme='light'] {\n  /* Components */\n  --components-button-padding: 1rem 2rem 0;"
    );
    expect(output).not.toContain(
      ":root[data-theme='print'] {\n    --components-button-padding: 1rem 2rem 0;"
    );
  });
});
