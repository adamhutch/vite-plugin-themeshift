import { describe, expect, it, vi, beforeEach } from 'vitest';

import { themeShift } from '../src/plugin';
import { makeSassTokenInjection } from '../src/sassTokenInjection';

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
    expect(additional.startsWith(injection)).toBe(true);
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
});
