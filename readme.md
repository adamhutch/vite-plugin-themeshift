# @themeshift/vite-plugin-themeshift

ThemeShift is a Vite plugin that makes using Style Dictionary easy as pie.
It watches your design tokens, regenerates token outputs automatically, and keeps your app
up to date without extra build scripts. It also injects a global Sass `token()` function so
you can reference CSS variables ergonomically in SCSS. It can also extend token JSON published
by UI packages and layer local app overrides on top. It also ships a standalone Sass module
for explicit `token()` imports.

---

## Why this exists

If you’re already using Style Dictionary to manage design tokens, you usually end up
writing custom scripts to rebuild tokens and wire up live reload. ThemeShift moves that
logic into a Vite plugin so token changes behave like any other frontend change.

---

## Features

- 👀 Watches `tokens/**/*.json` and rebuilds on change
- ⚙️ Runs Style Dictionary programmatically (no extra CLI step)
- 🎨 Outputs CSS variables for multi-mode theming
- 🧵 Optional Sass output for static tokens
- ✨ Injects a global Sass `token()` helper
- 📦 Ships a standalone Sass `token()` module
- 📦 Extends tokens from installed UI packages (like `@themeshift/ui`)
- 🏷️ Supports CSS variable prefixes
- 🔥 Vite HMR for `tokens.css` (fallback to full reload)

---

## Basic usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeShift } from '@themeshift/vite-plugin-themeshift';

export default defineConfig({
  plugins: [react(), themeShift()],
});
```

By default, ThemeShift expects a `tokens/` directory in your project root containing
Style Dictionary JSON files and outputs:

- `src/css/tokens.css`
- `src/sass/_tokens.static.scss`
- `src/design-tokens/token-paths.{json,ts}`

Local tokens continue to work exactly as before. If you do nothing, the plugin only reads
your app's `tokens/**/*.json`.

---

## Getting started (new project)

If you're wiring this up for the first time, this is a good baseline setup:

1. Install packages

```bash
npm install --save-dev @themeshift/vite-plugin-themeshift style-dictionary sass
```

2. Add the plugin to `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeShift } from '@themeshift/vite-plugin-themeshift';

export default defineConfig({
  plugins: [react(), themeShift()],
});
```

3. Create your first tokens file

Create `tokens/theme.json`:

```json
{
  "theme": {
    "text": {
      "base": { "$value": "#0f172a" }
    }
  }
}
```

4. Import the generated CSS

Import the CSS file that ThemeShift generates. For example in `src/main.tsx`:

```ts
import './css/tokens.css';
```

5. Ignore generated outputs

In most apps, these files should be treated as build artifacts rather than source:

```gitignore
src/css/tokens.css
src/sass/_tokens.static.scss
src/design-tokens/
```

6. Optional: import the Sass token helper directly

ThemeShift injects `token()` automatically by default. If you prefer explicit Sass imports,
you can use the published module instead:

```scss
@use '@themeshift/vite-plugin-themeshift/token' as themeShift;

.button {
  color: themeShift.token('theme.text.base');
}
```

If your app uses `cssVarPrefix`, configure the Sass module explicitly:

```scss
@use '@themeshift/vite-plugin-themeshift/token' as themeShift with (
  $var-prefix: 'themeshift'
);

.button {
  color: themeShift.token('components.button.font');
}
```

`@use '@themeshift/vite-plugin-themeshift/token' as *;` also works if you want direct `token(...)` calls.

### Dark/light mode setup

To enable theme modes, split your tokens into separate files:

- `tokens/theme.light.json`
- `tokens/theme.dark.json`

Example:

`tokens/theme.light.json`:

```json
{
  "theme": {
    "light": {
      "text": {
        "base": { "$value": "#0f172a" }
      },
      "surface": {
        "base": { "$value": "#ecf0f1" }
      }
    }
  }
}
```

`tokens/theme.dark.json`:

```json
{
  "theme": {
    "dark": {
      "text": {
        "base": { "$value": "#e2e8f0" }
      },
      "surface": {
        "base": { "$value": "#2c3e50" }
      }
    }
  }
}
```

Then set the data-theme attribute on your document root (usually inside of `index.html`):

```html
<html lang="en" data-theme="dark">
  ...
</html>
```

You can toggle `data-theme` between `light` and `dark` to switch modes at runtime. To easily toggle this on the fly
you can use a hook like [useDarkMode](https://usehooks-ts.com/react-hook/use-dark-mode) from [useHooks](https://usehooks-ts.com/) (or you can write your own).

---

## Playground

This repo includes a playground project under `playground/` to try things locally.

```bash
npm install
npm -C playground install
npm run playground
```

---

## Plugin options

```ts
type ThemeShiftExtendSource =
  | string
  | {
      package: string;
      tokensGlob?: string;
      contractFile?: string;
    };

type themeShiftOptions = {
  tokensGlob?: string; // default: "tokens/**/*.json" (watch uses tokensDir)
  tokensDir?: string; // default: "tokens"
  extends?: ThemeShiftExtendSource[];
  cssVarPrefix?: string;
  outputPrintTheme?: boolean; // default: false
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
```

### extends

Use `extends` to load token JSON from installed packages before local app tokens are loaded.
Local files always win.

```ts
themeShift({
  extends: ['@themeshift/ui'],
  cssVarPrefix: 'themeshift',
});
```

Resolution order is:

1. Extended package tokens
2. Local `tokens/**/*.json`

If you pass a string entry like `@themeshift/ui`, ThemeShift resolves that package from the
consuming app root and looks for `theme-contract.json` in the package root by default.

Example contract:

```json
{
  "name": "@themeshift/ui",
  "cssVarPrefix": "themeshift",
  "tokensGlob": "dist/tokens/**/*.json",
  "version": "1.0.0"
}
```

If you do not want to publish a contract file, use the explicit object form:

```ts
themeShift({
  extends: [
    {
      package: '@themeshift/ui',
      tokensGlob: 'dist/tokens/**/*.json',
    },
  ],
});
```

You can also override the contract filename:

```ts
themeShift({
  extends: [
    {
      package: '@themeshift/ui',
      contractFile: 'dist/theme-contract.json',
    },
  ],
});
```

If an extended package cannot be resolved, the build fails with a clear error.

### cssVarPrefix

Use `cssVarPrefix` to make generated CSS variable names part of a stable public contract:

```ts
themeShift({
  cssVarPrefix: 'themeshift',
});
```

This changes output like:

- `--components-button-font`
- to `--themeshift-components-button-font`

The injected Sass helper uses the same naming, so `token('components.button.font')`
resolves to `var(--themeshift-components-button-font)` when a prefix is configured.

The standalone Sass module uses the same naming contract. Set `$var-prefix` to the same
value as `cssVarPrefix` when you need prefixed CSS variables from an explicit `@use`.

### outputPrintTheme

By default, ThemeShift does not emit the `:root[data-theme='print']` block or the matching
`@media print` block.

Set `outputPrintTheme: true` to opt into that output when you have `print` theme tokens:

```ts
themeShift({
  outputPrintTheme: true,
});
```

### reloadStrategy

When tokens change, ThemeShift will try to HMR-reload the generated `tokens.css`. If it
can’t find the CSS module in Vite’s module graph, it will fallback to a full reload.
Set `reloadStrategy: "full"` to always reload.

### log

By default, ThemeShift silences Style Dictionary output (`verbosity: "silent"` and
`warnings: "disabled"`). Override to opt back into logs.

Forwarded to Style Dictionary's logging config. Use this to reduce or silence output.
For example, to hide warnings:

```ts
themeShift({
  log: { warnings: 'disabled' },
});
```

To fully silence Style Dictionary output:

```ts
themeShift({
  log: { verbosity: 'silent', warnings: 'disabled' },
});
```

---

## Token workflow notes

- The `token()` Sass helper maps `token("theme.text.base")` → `var(--theme-text-base)`.
- With `cssVarPrefix: "themeshift"`, the same token becomes `var(--themeshift-theme-text-base)`.
- The standalone Sass module exposes the same `token()` API via `@use '@themeshift/vite-plugin-themeshift/token'`.
- Pass the token's JSON path to `token()`. CamelCase segments like `gapWidth` are normalized to kebab-case CSS vars like `--...-gap-width`.
- Tokens that include `light`, `dark`, or `print` in their path are treated as mode-specific.
- Print-theme CSS blocks are only emitted when `outputPrintTheme` is `true`.
- The CSS output groups common token prefixes for readability.
- CSS variable names are intended to be a public API for consuming packages and apps.

---

## Development

```bash
npm run dev
```

Build:

```bash
npm run build
```

---

## License

MIT
