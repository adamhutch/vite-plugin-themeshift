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
