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
});
