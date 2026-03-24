# @themeshift/vite-plugin-themeshift

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

- 👀 Watches `tokens/**/*.json` and rebuilds on change
- ⚙️ Runs Style Dictionary programmatically (no extra CLI step)
- 🎨 Outputs CSS variables for multi-mode theming
- 🧵 Optional Sass output for static tokens
- ✨ Injects a global Sass `token()` helper
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
type themeShiftOptions = {
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
