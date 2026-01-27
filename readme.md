# vite-plugin-themeshift

ThemeShift is a Vite plugin that makes using Style Dictionary easy as pie.
It watches your design tokens, regenerates token outputs automatically, and keeps your app
up to date without extra build scripts. It also injects a global Sass `token()` function so
you can reference CSS variables ergonomically in SCSS.

---

## Why this exists

If you’re already using Style Dictionary to manage design tokens, you usually end up
writing custom scripts to rebuild tokens and wire up live reload. ThemeShift moves that
logic into a Vite plugin so token changes behave like any other frontend change.

---

## Features

- Watches `tokens/**/*.json` and rebuilds on change
- Runs Style Dictionary programmatically (no extra CLI step)
- Outputs CSS variables for multi-mode theming
- Optional Sass output for static tokens
- Injects a global Sass `token()` helper
- Vite HMR for `tokens.css` (fallback to full reload)

---

## Installation

```bash
npm install --save-dev vite-plugin-themeshift style-dictionary sass
```

---

## Basic usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeShiftPlugin } from 'vite-plugin-themeshift';

export default defineConfig({
  plugins: [react(), themeShiftPlugin()],
});
```

By default, ThemeShift expects a `tokens/` directory in your project root containing
Style Dictionary JSON files and outputs:

- `src/css/tokens.css`
- `src/sass/_tokens.static.scss`
- `src/design-tokens/token-paths.{json,ts}`

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
type themeShiftPluginOptions = {
  tokensGlob?: string; // default: "tokens/**/*.json" (watch uses tokensDir)
  tokensDir?: string; // default: "tokens"
  watch?: boolean; // default: true
  injectSassTokenFn?: boolean; // default: true
  platforms?: Array<'css' | 'scss' | 'meta'>; // default: all three
  reloadStrategy?: 'hmr' | 'full'; // default: "hmr"
};
```

### reloadStrategy

When tokens change, ThemeShift will try to HMR-reload the generated `tokens.css`. If it
can’t find the CSS module in Vite’s module graph, it will fallback to a full reload.
Set `reloadStrategy: "full"` to always reload.

---

## Token workflow notes

- The `token()` Sass helper maps `token("theme.text.base")` → `var(--theme-text-base)`.
- Tokens that include `light`, `dark`, or `print` in their path are treated as mode-specific.
- The CSS output groups common token prefixes for readability.

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
