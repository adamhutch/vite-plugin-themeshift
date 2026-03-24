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

describe('themeShift', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sdMocks.buildPlatform.mockClear();
    sdMocks.extend.mockClear();
    sdMocks.registerTransform.mockClear();
    sdMocks.registerFormat.mockClear();
  });

  it('injects Sass helpers into additionalData by default', () => {
    const plugin = themeShift();
    const injection = makeSassTokenInjection();
    const config = plugin.config?.({
      css: { preprocessorOptions: { scss: { additionalData: 'body {}' } } },
    });

    const additional =
      config?.css?.preprocessorOptions?.scss?.additionalData ?? '';

    expect(typeof additional).toBe('string');
    expect(additional).toContain('@use "sass:string" as _themeShiftString;');
    expect(additional).toContain('@function token($path)');
    expect(additional).toContain('body {}');
  });

  it('keeps existing @use rules ahead of injected Sass helpers', () => {
    const additional = mergeScssAdditionalData(
      `@use '@/sass/tokens.runtime' as *;\n.button { color: red; }\n`,
      makeSassTokenInjection()
    );

    expect(typeof additional).toBe('string');
    expect(additional).toMatch(
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use "sass:string" as _themeShiftString;/
    );
    expect(additional).toContain('.button { color: red; }');
  });

  it('keeps existing functional additionalData @use rules ahead of helpers', () => {
    const additional = mergeScssAdditionalData(
      (source: string) =>
        `@use '@/sass/tokens.runtime' as *;\n${source}\n.button { color: red; }\n`,
      makeSassTokenInjection()
    );

    expect(typeof additional).toBe('function');
    expect(additional('body {}', 'Button.module.scss')).toMatch(
      /^@use '@\/sass\/tokens\.runtime' as \*;\n@use "sass:string" as _themeShiftString;/
    );
  });

  it('skips Sass injection when injectSassTokenFn is false', () => {
    const plugin = themeShift({ injectSassTokenFn: false });
    const config = plugin.config?.({});
    expect(config).toEqual({});
  });

  it('builds all default platforms on buildStart', async () => {
    const plugin = themeShift();
    await plugin.buildStart?.();

    const calls = sdMocks.buildPlatform.mock.calls.map((call) => call[0]);
    expect(calls).toEqual(['css', 'scss', 'meta']);
  });

  it('watches token changes and triggers HMR updates', async () => {
    const plugin = themeShift({ tokensDir: 'tokens', watch: true });
    const server = makeServerMocks();

    await plugin.configureServer?.(server as any);

    expect(server.watcher.add).toHaveBeenCalledWith(
      expect.stringContaining('tokens')
    );
    expect(server.watcher.on).toHaveBeenCalledTimes(3);

    const onChange = server.watcher.on.mock.calls[0]?.[1];
    await onChange?.(process.cwd() + '/tokens/theme.json');

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
});
