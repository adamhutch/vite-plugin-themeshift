import { describe, expect, it, vi, beforeEach } from 'vitest';

import { themeShift } from '../src/plugin';
import {
  makeSassTokenInjection,
  mergeScssAdditionalData,
} from '../src/sassTokenInjection';

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

async function flushMicrotasks(includeMacrotask = false) {
  await Promise.resolve();
  await Promise.resolve();
  if (includeMacrotask) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use "sass:string" as _themeShiftString;/
    );
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
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use "sass:string" as _themeShiftString;/
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
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use '@\/sass\/mixins\/button';\n@use "sass:string" as _themeShiftString;/
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
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use '@\/sass\/mixins\/button';\n@use "sass:string" as _themeShiftString;/
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
    await flushMicrotasks(true);

    expect(sdMocks.buildPlatform).toHaveBeenCalled();
    expect(server.ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update' })
    );
  });

  it('retries transient token parse failures triggered by newly added files', async () => {
    vi.useFakeTimers();

    sdMocks.extend
      .mockRejectedValueOnce(
        new Error(
          'Failed to load or parse JSON or JS Object:\n\nJSON5: invalid end of input at 1:1'
        )
      )
      .mockReturnValue({ buildPlatform: sdMocks.buildPlatform });

    const plugin = themeShift({ tokensDir: 'tokens', watch: true });
    const server = makeServerMocks();

    const configurePromise = plugin.configureServer?.(server as any);
    await vi.runAllTimersAsync();
    await configurePromise;

    expect(sdMocks.extend).toHaveBeenCalledTimes(2);
    expect(server.config.logger.error).not.toHaveBeenCalled();
  });

  it('logs watcher build failures instead of surfacing them as crashes', async () => {
    vi.useFakeTimers();

    sdMocks.extend.mockRejectedValue(
      new Error(
        'Failed to load or parse JSON or JS Object:\n\nJSON5: invalid end of input at 1:1'
      )
    );

    const plugin = themeShift({ tokensDir: 'tokens', watch: true });
    plugin.config?.({}, { command: 'serve', mode: 'test' } as any);
    const server = makeServerMocks();

    const configurePromise = plugin.configureServer?.(server as any);
    await vi.runAllTimersAsync();
    await configurePromise;
    server.config.logger.error.mockClear();

    const onAdd = server.watcher.on.mock.calls.find(
      (call) => call[0] === 'add'
    )?.[1];

    onAdd?.(process.cwd() + '/tokens/theme.json');
    await vi.runAllTimersAsync();
    await flushMicrotasks();

    expect(server.config.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[style-dictionary] build failed:')
    );
  });
});
