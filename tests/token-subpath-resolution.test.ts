import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as sass from '../playground/node_modules/sass/sass.node.mjs';

describe('token subpath resolution', () => {
  it('resolves the Sass ./token subpath without a custom importer', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'themeshift-'));

    try {
      const packageRoot = process.cwd();
      const packageDir = path.join(
        tempRoot,
        'node_modules',
        '@themeshift',
        'vite-plugin-themeshift'
      );

      await fs.mkdir(path.dirname(packageDir), { recursive: true });
      await fs.symlink(packageRoot, packageDir, 'dir');

      const result = sass.compileString(
        `@use '@themeshift/vite-plugin-themeshift/token' as * with (
  $var-prefix: 'themeshift'
);

.button {
  color: token('theme.text.base');
}
`,
        {
          loadPaths: [path.join(tempRoot, 'node_modules')],
        }
      );

      expect(result.css).toContain('color: var(--themeshift-theme-text-base);');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('publishes a JS and Sass token subpath contract', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    );
    const rootTokenScss = await fs.readFile(
      path.join(process.cwd(), 'token.scss'),
      'utf8'
    );
    const sourceTokenScss = await fs.readFile(
      path.join(process.cwd(), 'src', 'token.scss'),
      'utf8'
    );

    expect(packageJson.exports['./token']).toEqual({
      types: './dist/token.d.ts',
      import: './dist/token.js',
      sass: './dist/token.scss',
    });
    expect(packageJson.files).toContain('token.scss');
    expect(rootTokenScss).toBe(sourceTokenScss);
  });
});
