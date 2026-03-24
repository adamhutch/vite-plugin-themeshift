import path from 'node:path';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';

import {
  makeSassTokenInjection,
  mergeScssAdditionalData,
} from './sassTokenInjection';
import { makeStyleDictionaryConfig, registerStyleDictionaryThings } from './sd';

export type ThemeShiftOptions = {
  tokensGlob?: string; // default: "tokens/**/*.json" (watch uses tokensDir)
  tokensDir?: string; // default: "tokens"
  watch?: boolean; // default: true
  injectSassTokenFn?: boolean; // default: true
  platforms?: Array<'css' | 'scss' | 'meta'>; // default: all three
  reloadStrategy?: 'hmr' | 'full'; // default: "hmr"
  log?: {
    warnings?: 'warn' | 'error' | 'disabled';
    verbosity?: 'default' | 'silent' | 'verbose';
    errors?: { brokenReferences?: 'throw' | 'console' };
  };
};

export function themeShift(options: ThemeShiftOptions = {}): Plugin {
  const TRANSIENT_BUILD_RETRY_DELAYS_MS = [50, 100, 200];
  const tokensDir = options.tokensDir ?? 'tokens';
  const watch = options.watch ?? true;
  const injectSassTokenFn = options.injectSassTokenFn ?? true;
  const platforms = options.platforms ?? ['css', 'scss', 'meta'];
  const reloadStrategy = options.reloadStrategy ?? 'hmr';
  const log = {
    warnings: 'disabled' as const,
    verbosity: 'silent' as const,
    ...options.log,
    errors: {
      ...options.log?.errors,
    },
  };

  let root = process.cwd();
  let server: ViteDevServer | null = null;
  let cssOutputFile: string | null = null;

  // prevent overlapping builds
  let building: Promise<void> | null = null;

  function sleep(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function withRootCwd<T>(run: () => Promise<T>) {
    const prev = process.cwd();
    process.chdir(root);
    return run().finally(() => {
      process.chdir(prev);
    });
  }

  function isTransientTokenLoadError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return (
      message.includes('Failed to load or parse JSON or JS Object') ||
      message.includes('JSON5: invalid end of input') ||
      message.includes('Unexpected end of JSON input')
    );
  }

  async function buildOnce() {
    if (building) return building;

    building = (async () => {
      const imported = await import('style-dictionary');
      const StyleDictionary = (imported as any).default ?? imported;

      // register transforms/formats (your code)
      registerStyleDictionaryThings(StyleDictionary);

      // build using your config (relative paths resolve from cwd; set cwd to root)
      const config = makeStyleDictionaryConfig({ log });
      setCssOutputFile(config);

      await withRootCwd(async () => {
        const sd = await (typeof StyleDictionary.extend === 'function'
          ? StyleDictionary.extend(config)
          : new StyleDictionary(config));

        for (const p of platforms) {
          await sd.buildPlatform(p);
        }
      });
    })().finally(() => {
      building = null;
    });

    return building;
  }

  async function buildWithRetries() {
    let attempt = 0;

    while (true) {
      try {
        await buildOnce();
        return;
      } catch (err) {
        const retryDelay = TRANSIENT_BUILD_RETRY_DELAYS_MS[attempt];
        if (!retryDelay || !isTransientTokenLoadError(err)) {
          throw err;
        }

        attempt += 1;
        await sleep(retryDelay);
      }
    }
  }

  function fullReload() {
    server?.ws.send({ type: 'full-reload' });
  }

  function setCssOutputFile(
    config: ReturnType<typeof makeStyleDictionaryConfig>
  ) {
    if (!platforms.includes('css')) {
      cssOutputFile = null;
      return;
    }
    const cssPlatform = config.platforms?.css;
    const cssFile = cssPlatform?.files?.[0];
    if (!cssPlatform?.buildPath || !cssFile?.destination) {
      cssOutputFile = null;
      return;
    }
    cssOutputFile = path.resolve(
      root,
      cssPlatform.buildPath,
      cssFile.destination
    );
  }

  async function tryCssHmrUpdate(): Promise<boolean> {
    if (!server || !cssOutputFile) return false;
    const rel = path.relative(root, cssOutputFile);
    if (rel.startsWith('..')) return false;
    const url = '/' + rel.split(path.sep).join('/');
    const mod = await server.moduleGraph.getModuleByUrl(url);
    if (!mod) return false;
    server.moduleGraph.invalidateModule(mod);
    server.ws.send({
      type: 'update',
      updates: [
        {
          type: 'css-update',
          path: url,
          acceptedPath: url,
          timestamp: Date.now(),
        },
      ],
    });
    return true;
  }

  async function notifyTokenOutputsUpdated() {
    if (reloadStrategy === 'full') {
      fullReload();
      return;
    }
    if (!(await tryCssHmrUpdate())) fullReload();
  }

  function isTokenJson(file: string) {
    const rel = path.relative(root, file);
    return rel.startsWith(tokensDir + path.sep) && rel.endsWith('.json');
  }

  return {
    name: 'vite-plugin-style-dictionary-native',
    enforce: 'pre',

    config(userConfig): UserConfig {
      if (!injectSassTokenFn) return {};

      const injection = makeSassTokenInjection();
      const existing =
        userConfig.css?.preprocessorOptions?.scss?.additionalData;
      const merged = mergeScssAdditionalData(existing, injection);

      return {
        css: {
          preprocessorOptions: {
            scss: {
              additionalData: merged,
            },
          },
        },
      };
    },

    configResolved(resolved) {
      root = resolved.root;
    },

    async buildStart() {
      await buildWithRetries();
    },

    async configureServer(_server) {
      server = _server;

      // initial build
      try {
        await buildWithRetries();
      } catch (err) {
        server.config.logger.error(
          `[style-dictionary] initial build failed:\n${String(err)}`
        );
      }

      if (!watch) return;

      server.watcher.add(path.join(root, tokensDir));

      const onChange = async (file: string) => {
        if (!isTokenJson(file)) return;
        try {
          await buildWithRetries();
          await notifyTokenOutputsUpdated();
        } catch (err) {
          server?.config.logger.error(
            `[style-dictionary] build failed:\n${String(err)}`
          );
        }
      };

      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}
