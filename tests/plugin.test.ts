import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { themeShift } from '../src/plugin';
import {
  makeSassTokenInjection,
  mergeScssAdditionalData,
} from '../src/sassTokenInjection';
import * as sd from '../src/sd';
import * as sass from '../playground/node_modules/sass/sass.node.mjs';

const sdMocks = vi.hoisted(() => {
  const buildPlatform = vi.fn(async () => {});
  const extend = vi.fn(() => ({ buildPlatform }));
  const registerTransform = vi.fn();
  const registerFormat = vi.fn();
  return { buildPlatform, extend, registerTransform, registerFormat };
});

vi.mock('style-dictionary', () => ({
  default: {
    extend: sdMocks.extend,
    registerTransform: sdMocks.registerTransform,
    registerFormat: sdMocks.registerFormat,
  },
}));

function makeServerMocks() {
  return {
    ws: { send: vi.fn() },
    moduleGraph: {
      getModuleByUrl: vi.fn(async () => ({ id: 'css' })),
      invalidateModule: vi.fn(),
    },
    watcher: {
      add: vi.fn(),
      on: vi.fn(),
    },
    config: { logger: { error: vi.fn() } },
  };
}

const tempRoots: string[] = [];

async function compileConsumerScss(source: string) {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'themeshift-sass-consumer-')
  );

  tempRoots.push(tempRoot);
  await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });

  return sass.compileString(source, {
    url: new URL(`file://${path.join(tempRoot, 'src', 'style.scss')}`),
    loadPaths: [path.join(process.cwd(), 'src')],
  }).css;
}

describe('themeShift', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sdMocks.buildPlatform.mockReset();
    sdMocks.extend.mockReset();
    sdMocks.registerTransform.mockReset();
    sdMocks.registerFormat.mockReset();
    sdMocks.buildPlatform.mockImplementation(async () => {});
    sdMocks.extend.mockImplementation(() => ({ buildPlatform: sdMocks.buildPlatform }));
  });

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) =>
        fs.rm(root, { recursive: true, force: true })
      )
    );
  });

  it('passes defaultTheme through to Style Dictionary registration', async () => {
    const registerSpy = vi.spyOn(sd, 'registerStyleDictionaryThings');
    const plugin = themeShift({ defaultTheme: 'dark', cssVarPrefix: 'themeshift' });

    plugin.config?.({}, { command: 'build', mode: 'test' } as any);
    await plugin.buildStart?.();

    expect(registerSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        defaultTheme: 'dark',
        cssVarPrefix: 'themeshift',
      })
    );

    registerSpy.mockRestore();
  });

  it('passes platform filters through to Style Dictionary registration', async () => {
    const registerSpy = vi.spyOn(sd, 'registerStyleDictionaryThings');
    const scssFilter = vi.fn((token) => !token.attributes?.theme);
    const plugin = themeShift({
      filters: {
        scss: scssFilter,
        css: { includePrefixes: ['layout-'] },
      },
    });

    plugin.config?.({}, { command: 'build', mode: 'test' } as any);
    await plugin.buildStart?.();

    expect(registerSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filters: expect.objectContaining({
          scss: scssFilter,
          css: { includePrefixes: ['layout-'] },
        }),
      })
    );

    registerSpy.mockRestore();
  });

  it('passes css groups through to Style Dictionary registration', async () => {
    const registerSpy = vi.spyOn(sd, 'registerStyleDictionaryThings');
    const groups = [
      { label: 'Layout', match: (name: string) => name.startsWith('layout-') },
      { label: 'Other', match: (_name: string) => true },
    ];
    const plugin = themeShift({ groups });

    plugin.config?.({}, { command: 'build', mode: 'test' } as any);
    await plugin.buildStart?.();

    expect(registerSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        groups,
      })
    );

    registerSpy.mockRestore();
  });

  it('injects Sass helpers into additionalData by default', () => {
    const plugin = themeShift();
    const config = plugin.config?.({});

    const additional =
      config?.css?.preprocessorOptions?.scss?.additionalData ?? '';

    expect(typeof additional).toBe('function');
    expect(
      additional(
        `@use '@/sass/tokens.runtime' as *;\n.button { color: token('theme.surface.base'); }\n`,
        'Button.module.scss'
      )
    ).toMatch(
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use "@themeshift\/vite-plugin-themeshift\/token" as \*;/
    );
  });

  it('uses the configured cssVarPrefix in the injected Sass token helper', () => {
    const plugin = themeShift({ cssVarPrefix: 'themeshift' });
    const config = plugin.config?.({});
    const additional =
      config?.css?.preprocessorOptions?.scss?.additionalData ?? '';

    expect(typeof additional).toBe('function');
    expect(
      additional(
        '.button { color: token("components.button.font"); }\n',
        'Button.module.scss'
      )
    ).toContain(
      '@use "@themeshift/vite-plugin-themeshift/token-defaults" as _themeShiftTokenDefaults with ('
    );
  });

  it('renders a standalone Sass token module with an optional prefix argument', async () => {
    const moduleSource = await fs.readFile(
      path.join(process.cwd(), 'src', 'token.scss'),
      'utf8'
    );

    expect(moduleSource).toContain('@use "./token-defaults" as _themeShiftDefaults;');
    expect(moduleSource).toContain('@function _sd_resolve_css_var_prefix($cssVarPrefix: null)');
    expect(moduleSource).toContain('@function token($path, $cssVarPrefix: null)');
  });

  it('uses an explicit prefix passed to token()', async () => {
    const css = await compileConsumerScss(`
@use 'token' as themeShift;

.button {
  color: themeShift.token('components.button.font', 'themeshift');
}
`);

    expect(css).toContain('var(--themeshift-components-button-font)');
  });

  it('falls back to the injected prefix when token() is called without one', async () => {
    const css = await compileConsumerScss(`
${makeSassTokenInjection('theme_shift')
  .replaceAll('@themeshift/vite-plugin-themeshift/token-defaults', 'token-defaults')
  .replaceAll('@themeshift/vite-plugin-themeshift/token', 'token')}@use 'token' as themeShift;

.button {
  color: themeShift.token('components.button.font');
}
`);

    expect(css).toContain('var(--theme-shift-components-button-font)');
  });

  it('emits an unprefixed CSS variable when no prefix is available', async () => {
    const css = await compileConsumerScss(`
@use 'token' as themeShift;

body {
  color: themeShift.token('theme.text.base');
}
`);

    expect(css).toContain('var(--theme-text-base)');
  });

  it('normalizes camelCase and underscores in token paths', async () => {
    const css = await compileConsumerScss(`
@use 'token' as themeShift;

body {
  gap: themeShift.token('layout.gapWidth_base');
}
`);

    expect(css).toContain('var(--layout-gap-width-base)');
  });

  it('keeps source-level @use rules ahead of injected Sass helpers', () => {
    const additional = mergeScssAdditionalData(
      undefined,
      makeSassTokenInjection()
    );

    expect(typeof additional).toBe('function');
    expect(
      additional(
        `@use '@/sass/tokens.runtime' as *;\n.button { color: red; }\n`,
        'Button.module.scss'
      )
    ).toMatch(
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use "@themeshift\/vite-plugin-themeshift\/token" as \*;/
    );
  });

  it('keeps string additionalData and source @use rules ahead of injected helpers', () => {
    const additional = mergeScssAdditionalData(
      `@use '@/sass/tokens.runtime' as *;\n`,
      makeSassTokenInjection()
    );

    expect(typeof additional).toBe('function');
    expect(
      additional(
        `@use '@/sass/mixins/button';\n.button { color: red; }\n`,
        'Button.module.scss'
      )
    ).toMatch(
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use '@\/sass\/mixins\/button';\n@use "@themeshift\/vite-plugin-themeshift\/token" as \*;/
    );
  });

  it('keeps existing functional additionalData @use rules ahead of helpers', () => {
    const additional = mergeScssAdditionalData(
      (source: string) =>
        `@use '@/sass/tokens.runtime' as *;\n${source}\n.button { color: red; }\n`,
      makeSassTokenInjection()
    );

    expect(typeof additional).toBe('function');
    expect(
      additional(
        `@use '@/sass/mixins/button';\nbody {}\n`,
        'Button.module.scss'
      )
    ).toMatch(
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use '@\/sass\/mixins\/button';\n@use "@themeshift\/vite-plugin-themeshift\/token" as \*;/
    );
  });

  it('skips Sass injection when injectSassTokenFn is false', () => {
    const plugin = themeShift({ injectSassTokenFn: false });
    const config = plugin.config?.({});
    expect(config).toEqual({});
  });

  it('builds all default platforms on buildStart', async () => {
    const plugin = themeShift();
    plugin.config?.({}, { command: 'build', mode: 'test' } as any);
    await plugin.buildStart?.();

    const calls = sdMocks.buildPlatform.mock.calls.map((call) => call[0]);
    expect(calls).toEqual(['css', 'scss', 'meta']);
  });

  it('does not crash buildStart in serve mode on transient token load errors', async () => {
    sdMocks.extend.mockRejectedValue(
      new Error(
        'Failed to load or parse JSON or JS Object:\n\nJSON5: invalid end of input at 1:1'
      )
    );

    const plugin = themeShift();
    plugin.config?.({}, { command: 'serve', mode: 'test' } as any);

    await expect(plugin.buildStart?.()).resolves.toBeUndefined();
  });

  it('ignores empty and invalid token files in serve mode', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'themeshift-'));

    try {
      await fs.mkdir(path.join(root, 'tokens'));
      await fs.writeFile(
        path.join(root, 'tokens', 'theme.valid.json'),
        '{"theme":{"text":{"base":{"value":"#000"}}}}'
      );
      await fs.writeFile(path.join(root, 'tokens', 'theme.empty.json'), '');
      await fs.writeFile(
        path.join(root, 'tokens', 'theme.invalid.json'),
        '{"theme":'
      );

      const plugin = themeShift();
      plugin.config?.({}, { command: 'serve', mode: 'test' } as any);
      plugin.configResolved?.({ root } as any);

      await expect(plugin.buildStart?.()).resolves.toBeUndefined();

      expect(sdMocks.extend).toHaveBeenCalledWith(
        expect.objectContaining({
          source: ['tokens/theme.valid.json'],
        })
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('loads extended package tokens before local tokens', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'themeshift-'));

    try {
      const packageRoot = path.join(root, 'node_modules', '@themeshift', 'ui');
      await fs.mkdir(path.join(root, 'tokens'), { recursive: true });
      await fs.mkdir(path.join(packageRoot, 'dist', 'tokens'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(packageRoot, 'package.json'),
        '{"name":"@themeshift/ui","version":"1.0.0"}'
      );
      await fs.writeFile(
        path.join(packageRoot, 'theme-contract.json'),
        '{"name":"@themeshift/ui","tokensGlob":"dist/tokens/**/*.json"}'
      );
      await fs.writeFile(
        path.join(packageRoot, 'dist', 'tokens', 'base.json'),
        '{"components":{"button":{"font":{"value":"500 1rem/1.2 Inter"}}}}'
      );
      await fs.writeFile(
        path.join(root, 'tokens', 'theme.json'),
        '{"components":{"button":{"font":{"value":"600 1rem/1.2 Inter"}}}}'
      );

      const plugin = themeShift({ extends: ['@themeshift/ui'] });
      plugin.config?.({}, { command: 'build', mode: 'test' } as any);
      plugin.configResolved?.({ root } as any);

      await plugin.buildStart?.();

      const config = sdMocks.extend.mock.calls.at(-1)?.[0];
      expect(config?.source).toHaveLength(2);
      expect(config?.source?.[0]).toMatch(
        /node_modules\/@themeshift\/ui\/dist\/tokens\/base\.json$/
      );
      expect(config?.source?.[1]).toBe('tokens/theme.json');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('allows explicit package token globs and keeps local overrides last', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'themeshift-'));

    try {
      const packageRoot = path.join(root, 'node_modules', '@themeshift', 'ui');
      await fs.mkdir(path.join(root, 'tokens'), { recursive: true });
      await fs.mkdir(path.join(packageRoot, 'dist', 'tokens'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(packageRoot, 'package.json'),
        '{"name":"@themeshift/ui","version":"1.0.0"}'
      );
      await fs.writeFile(
        path.join(packageRoot, 'dist', 'tokens', 'base.json'),
        '{"components":{"button":{"font":{"value":"500 1rem/1.2 Inter"}}}}'
      );
      await fs.writeFile(
        path.join(root, 'tokens', 'theme.json'),
        '{"components":{"button":{"font":{"value":"700 1rem/1.2 Inter"}}}}'
      );

      const plugin = themeShift({
        extends: [
          {
            package: '@themeshift/ui',
            tokensGlob: 'dist/tokens/**/*.json',
          },
        ],
      });
      plugin.config?.({}, { command: 'build', mode: 'test' } as any);
      plugin.configResolved?.({ root } as any);

      await plugin.buildStart?.();

      const config = sdMocks.extend.mock.calls.at(-1)?.[0];
      expect(config?.source).toHaveLength(2);
      expect(config?.source?.[0]).toMatch(
        /node_modules\/@themeshift\/ui\/dist\/tokens\/base\.json$/
      );
      expect(config?.source?.[1]).toBe('tokens/theme.json');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails with a clear error when an extended package cannot be resolved', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'themeshift-'));

    try {
      const plugin = themeShift({ extends: ['@themeshift/ui'] });
      plugin.config?.({}, { command: 'build', mode: 'test' } as any);
      plugin.configResolved?.({ root } as any);

      await expect(plugin.buildStart?.()).rejects.toThrow(
        `could not resolve extended token package "@themeshift/ui" from ${root}`
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('watches token changes and triggers HMR updates', async () => {
    const plugin = themeShift({ tokensDir: 'tokens', watch: true });
    plugin.config?.({}, { command: 'serve', mode: 'test' } as any);
    const server = makeServerMocks();

    await plugin.configureServer?.(server as any);

    expect(server.watcher.add).toHaveBeenCalledWith(
      expect.stringContaining('tokens')
    );
    expect(server.watcher.on).toHaveBeenCalledTimes(3);

    const onChange = server.watcher.on.mock.calls[0]?.[1];
    onChange?.(process.cwd() + '/tokens/theme.json');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sdMocks.buildPlatform).toHaveBeenCalled();
    expect(server.ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update' })
    );
  });

  it('retries transient token parse failures triggered by newly added files', async () => {
    sdMocks.extend
      .mockRejectedValueOnce(
        new Error(
          'Failed to load or parse JSON or JS Object:\n\nJSON5: invalid end of input at 1:1'
        )
      )
      .mockReturnValue({ buildPlatform: sdMocks.buildPlatform });

    const plugin = themeShift({ tokensDir: 'tokens', watch: true });
    const server = makeServerMocks();

    await plugin.configureServer?.(server as any);

    expect(sdMocks.extend).toHaveBeenCalledTimes(2);
    expect(server.config.logger.error).not.toHaveBeenCalled();
  });

  it('logs watcher build failures instead of surfacing them as crashes', async () => {
    sdMocks.extend.mockRejectedValue(
      new Error(
        'Failed to load or parse JSON or JS Object:\n\nJSON5: invalid end of input at 1:1'
      )
    );

    const plugin = themeShift({ tokensDir: 'tokens', watch: true });
    plugin.config?.({}, { command: 'serve', mode: 'test' } as any);
    const server = makeServerMocks();

    await plugin.configureServer?.(server as any);
    server.config.logger.error.mockClear();

    const onAdd = server.watcher.on.mock.calls.find(
      (call) => call[0] === 'add'
    )?.[1];

    onAdd?.(process.cwd() + '/tokens/theme.json');
    await new Promise((resolve) => setTimeout(resolve, 1600));

    expect(server.config.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[style-dictionary] build failed:')
    );
  });
});
