import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';

import {
  makeSassTokenInjection,
  mergeScssAdditionalData,
} from './sassTokenInjection';
import { makeStyleDictionaryConfig, registerStyleDictionaryThings } from './sd';

export type ThemeShiftExtendSource =
  | string
  | {
      package: string;
      tokensGlob?: string;
      contractFile?: string;
    };

export type ThemeShiftPlatform = 'css' | 'scss' | 'meta';

export type ThemeShiftTokenFilterRule = {
  includePrefixes?: string[];
  excludePrefixes?: string[];
};

export type ThemeShiftTokenFilterPredicate = (token: any) => boolean;

export type ThemeShiftTokenFilter =
  | ThemeShiftTokenFilterRule
  | ThemeShiftTokenFilterPredicate;

export type ThemeShiftCssGroup = {
  label: string;
  match: (name: string) => boolean;
};

export type ThemeShiftOptions = {
  tokensGlob?: string; // default: "tokens/**/*.json" (watch uses tokensDir)
  tokensDir?: string; // default: "tokens"
  extends?: ThemeShiftExtendSource[];
  cssVarPrefix?: string;
  groups?: ThemeShiftCssGroup[];
  defaultTheme?: 'light' | 'dark';
  outputPrintTheme?: boolean;
  watch?: boolean; // default: true
  injectSassTokenFn?: boolean; // default: true
  platforms?: Array<'css' | 'scss' | 'meta'>; // default: all three
  filters?: Partial<Record<ThemeShiftPlatform, ThemeShiftTokenFilter>>;
  reloadStrategy?: 'hmr' | 'full'; // default: "hmr"
  log?: {
    warnings?: 'warn' | 'error' | 'disabled';
    verbosity?: 'default' | 'silent' | 'verbose';
    errors?: { brokenReferences?: 'throw' | 'console' };
  };
};

export function themeShift(options: ThemeShiftOptions = {}): Plugin {
  const TRANSIENT_BUILD_RETRY_DELAYS_MS = [50, 100, 200, 400, 800];
  const tokensDir = options.tokensDir ?? 'tokens';
  const tokensGlob = options.tokensGlob ?? 'tokens/**/*.json';
  const extendsSources = options.extends ?? [];
  const cssVarPrefix = options.cssVarPrefix;
  const groups = options.groups;
  const defaultTheme = options.defaultTheme;
  const outputPrintTheme = options.outputPrintTheme ?? false;
  const watch = options.watch ?? true;
  const injectSassTokenFn = options.injectSassTokenFn ?? true;
  const platforms = options.platforms ?? ['css', 'scss', 'meta'];
  const filters = options.filters;
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
  let command: 'build' | 'serve' = 'build';
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

  async function resolveTokenSources() {
    const packageSources = await resolveExtendedTokenSources();
    const entries = await Array.fromAsync(
      fs.glob(tokensGlob, { cwd: root, exclude: ['**/node_modules/**'] })
    );
    const sources = [...packageSources];

    for (const entry of entries.sort()) {
      const source = entry.split(path.sep).join('/');
      const content = await fs.readFile(path.resolve(root, entry), 'utf8');
      const trimmed = content.trim();

      if (!trimmed) continue;

      try {
        JSON.parse(trimmed);
      } catch {
        if (command === 'serve') continue;
        throw new Error(
          `[style-dictionary] invalid token file: ${source}. Token files must contain valid JSON.`
        );
      }

      sources.push(source);
    }

    return sources;
  }

  async function resolveExtendedTokenSources() {
    const sources: string[] = [];

    for (const extendSource of extendsSources) {
      const resolved = await resolvePackageTokenSource(extendSource);
      sources.push(...resolved);
    }

    return sources;
  }

  async function resolvePackageTokenSource(extendSource: ThemeShiftExtendSource) {
    const descriptor =
      typeof extendSource === 'string'
        ? { package: extendSource }
        : extendSource;
    const packageName = descriptor.package;
    const requireFromRoot = createRequire(path.join(root, 'package.json'));

    let packageJsonPath: string;
    try {
      packageJsonPath = requireFromRoot.resolve(`${packageName}/package.json`);
    } catch (error) {
      throw new Error(
        `[style-dictionary] could not resolve extended token package "${packageName}" from ${root}.`
      );
    }

    const packageRoot = path.dirname(packageJsonPath);
    const contractFile = descriptor.contractFile ?? 'theme-contract.json';
    let tokensGlobFromContract: string | undefined;

    if (!descriptor.tokensGlob) {
      const contractPath = path.resolve(packageRoot, contractFile);
      try {
        const contractRaw = await fs.readFile(contractPath, 'utf8');
        const contract = JSON.parse(contractRaw) as { tokensGlob?: string };
        tokensGlobFromContract = contract.tokensGlob;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(
            `[style-dictionary] failed to read theme contract "${contractFile}" from package "${packageName}".`
          );
        }
      }
    }

    const packageTokensGlob = descriptor.tokensGlob ?? tokensGlobFromContract;

    if (!packageTokensGlob) {
      throw new Error(
        `[style-dictionary] no token source was found for "${packageName}". Provide "tokensGlob" in extends or publish "${contractFile}" with a "tokensGlob" entry.`
      );
    }

    const entries = await Array.fromAsync(fs.glob(packageTokensGlob, { cwd: packageRoot }));
    const sources: string[] = [];

    for (const entry of entries) {
      const absoluteEntry = path.resolve(packageRoot, entry);
      const content = await fs.readFile(absoluteEntry, 'utf8');
      const trimmed = content.trim();

      if (!trimmed) continue;

      try {
        JSON.parse(trimmed);
      } catch {
        throw new Error(
          `[style-dictionary] invalid token file in package "${packageName}": ${entry}. Token files must contain valid JSON.`
        );
      }

      sources.push(absoluteEntry);
    }

    return sources.sort();
  }

  async function buildOnce() {
    if (building) return building;

    building = (async () => {
      const imported = await import('style-dictionary');
      const StyleDictionary = (imported as any).default ?? imported;

      // register transforms/formats (your code)
      registerStyleDictionaryThings(StyleDictionary, {
        cssVarPrefix,
        groups,
        defaultTheme,
        filters,
        outputPrintTheme,
      });

      // build using your config (relative paths resolve from cwd; set cwd to root)
      const source = await resolveTokenSources();
      const config = makeStyleDictionaryConfig({ log, source });
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

    config(userConfig, env): UserConfig {
      command = env?.command ?? command;

      if (!injectSassTokenFn) return {};

      const injection = makeSassTokenInjection(cssVarPrefix);
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
      try {
        await buildWithRetries();
      } catch (err) {
        if (command === 'serve' && isTransientTokenLoadError(err)) {
          return;
        }

        throw err;
      }
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

      server.watcher.on('add', (file) => {
        void onChange(file);
      });
      server.watcher.on('change', (file) => {
        void onChange(file);
      });
      server.watcher.on('unlink', (file) => {
        void onChange(file);
      });
    },
  };
}
