import path from "node:path";
import type { Plugin, UserConfig, ViteDevServer } from "vite";

import {
  makeSassTokenInjection,
  mergeScssAdditionalData,
} from "./sassTokenInjection";
import { makeStyleDictionaryConfig, registerStyleDictionaryThings } from "./sd";

export type StyleDictionaryThemeShiftPluginOptions = {
  tokensGlob?: string; // default: "tokens/**/*.json" (watch uses tokensDir)
  tokensDir?: string; // default: "tokens"
  watch?: boolean; // default: true
  injectSassTokenFn?: boolean; // default: true
  platforms?: Array<"css" | "scss" | "meta">; // default: all three
  reloadStrategy?: "hmr" | "full"; // default: "hmr"
};

export function styleDictionaryThemeShiftPlugin(
  options: StyleDictionaryThemeShiftPluginOptions = {},
): Plugin {
  const tokensDir = options.tokensDir ?? "tokens";
  const watch = options.watch ?? true;
  const injectSassTokenFn = options.injectSassTokenFn ?? true;
  const platforms = options.platforms ?? ["css", "scss", "meta"];
  const reloadStrategy = options.reloadStrategy ?? "hmr";

  let root = process.cwd();
  let server: ViteDevServer | null = null;
  let cssOutputFile: string | null = null;

  // prevent overlapping builds
  let building: Promise<void> | null = null;

  async function buildOnce() {
    if (building) return building;

    building = (async () => {
      const imported = await import("style-dictionary");
      const StyleDictionary = (imported as any).default ?? imported;

      // register transforms/formats (your code)
      registerStyleDictionaryThings(StyleDictionary);

      // build using your config (relative paths resolve from cwd; set cwd to root)
      const config = makeStyleDictionaryConfig();
      setCssOutputFile(config);

      const sd = await (typeof StyleDictionary.extend === "function"
        ? StyleDictionary.extend(config)
        : new StyleDictionary(config));

      // Style Dictionary uses process.cwd() for relative globs/buildPath.
      // We temporarily chdir to Vite root for correctness.
      const prev = process.cwd();
      process.chdir(root);
      try {
        for (const p of platforms) {
          await sd.buildPlatform(p);
        }
      } finally {
        process.chdir(prev);
      }
    })().finally(() => {
      building = null;
    });

    return building;
  }

  function fullReload() {
    server?.ws.send({ type: "full-reload" });
  }

  function setCssOutputFile(config: ReturnType<typeof makeStyleDictionaryConfig>) {
    if (!platforms.includes("css")) {
      cssOutputFile = null;
      return;
    }
    const cssPlatform = config.platforms?.css;
    const cssFile = cssPlatform?.files?.[0];
    if (!cssPlatform?.buildPath || !cssFile?.destination) {
      cssOutputFile = null;
      return;
    }
    cssOutputFile = path.resolve(root, cssPlatform.buildPath, cssFile.destination);
  }

  function tryCssHmrUpdate(): boolean {
    if (!server || !cssOutputFile) return false;
    const rel = path.relative(root, cssOutputFile);
    if (rel.startsWith("..")) return false;
    const url = "/" + rel.split(path.sep).join("/");
    const mod = server.moduleGraph.getModuleByUrl(url);
    if (!mod) return false;
    server.moduleGraph.invalidateModule(mod);
    server.ws.send({
      type: "update",
      updates: [
        {
          type: "css-update",
          path: url,
          acceptedPath: url,
          timestamp: Date.now(),
        },
      ],
    });
    return true;
  }

  function notifyTokenOutputsUpdated() {
    if (reloadStrategy === "full") {
      fullReload();
      return;
    }
    if (!tryCssHmrUpdate()) fullReload();
  }

  function isTokenJson(file: string) {
    const rel = path.relative(root, file);
    return rel.startsWith(tokensDir + path.sep) && rel.endsWith(".json");
  }

  return {
    name: "vite-plugin-style-dictionary-native",
    enforce: "pre",

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
      await buildOnce();
    },

    async configureServer(_server) {
      server = _server;

      // initial build
      try {
        await buildOnce();
      } catch (err) {
        server.config.logger.error(
          `[style-dictionary] initial build failed:\n${String(err)}`,
        );
      }

      if (!watch) return;

      server.watcher.add(path.join(root, tokensDir));

      const onChange = async (file: string) => {
        if (!isTokenJson(file)) return;
        try {
          await buildOnce();
          notifyTokenOutputsUpdated();
        } catch (err) {
          server?.config.logger.error(
            `[style-dictionary] build failed:\n${String(err)}`,
          );
        }
      };

      server.watcher.on("add", onChange);
      server.watcher.on("change", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}
