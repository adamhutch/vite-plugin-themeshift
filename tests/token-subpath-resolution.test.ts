import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('token subpath resolution', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) =>
        fs.rm(root, { recursive: true, force: true })
      )
    );
  });

  it('works in a Vite consumer app without a custom Sass importer', async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'themeshift-vite-consumer-')
    );
    tempRoots.push(tempRoot);

    const packageRoot = process.cwd();
    const packageDir = path.join(
      tempRoot,
      'node_modules',
      '@themeshift',
      'vite-plugin-themeshift'
    );
    const tempPackageDist = path.join(packageDir, 'dist');

    await fs.mkdir(path.dirname(packageDir), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
    await fs.mkdir(tempPackageDist, { recursive: true });
    await fs.symlink(
      path.join(packageRoot, 'playground', 'node_modules', 'sass'),
      path.join(tempRoot, 'node_modules', 'sass'),
      'dir'
    );
    await fs.writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify(
        {
          name: '@themeshift/vite-plugin-themeshift',
          type: 'module',
          exports: {
            './token': {
              sass: './dist/token.scss',
              types: './dist/token.d.ts',
              import: './dist/token.js',
            },
            './token-defaults': {
              sass: './dist/token-defaults.scss',
            },
          },
        },
        null,
        2
      )
    );
    await fs.copyFile(
      path.join(packageRoot, 'src', 'token.scss'),
      path.join(tempPackageDist, 'token.scss')
    );
    await fs.copyFile(
      path.join(packageRoot, 'src', 'token-defaults.scss'),
      path.join(tempPackageDist, 'token-defaults.scss')
    );
    await fs.writeFile(path.join(tempPackageDist, 'token.js'), 'export {};');
    await fs.writeFile(path.join(tempPackageDist, 'token.d.ts'), 'export {};');

    await fs.writeFile(
      path.join(tempRoot, 'index.html'),
      '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>'
    );
    await fs.writeFile(
      path.join(tempRoot, 'src', 'main.js'),
      "import './style.scss';\n"
    );
    await fs.writeFile(
      path.join(tempRoot, 'src', 'style.scss'),
      `@use '@themeshift/vite-plugin-themeshift/token' as themeShift;

.test {
  color: themeShift.token('theme.text.base', 'themeshift');
}
`
    );

    await expect(
      execFileAsync(
        process.execPath,
        [
          path.join(
            packageRoot,
            'playground',
            'node_modules',
            'vite',
            'bin',
            'vite.js'
          ),
          'build',
        ],
        {
          cwd: tempRoot,
        }
      )
    ).resolves.toMatchObject({
      stderr: expect.not.stringContaining("Can't find stylesheet to import"),
    });
  });

  it('publishes the token subpath contract for JS and Sass', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    );
    const rootTokenScss = await fs.readFile(
      path.join(process.cwd(), 'token.scss'),
      'utf8'
    );
    const rootTokenDefaultsScss = await fs.readFile(
      path.join(process.cwd(), 'token-defaults.scss'),
      'utf8'
    );
    const sourceTokenScss = await fs.readFile(
      path.join(process.cwd(), 'src', 'token.scss'),
      'utf8'
    );
    const sourceTokenDefaultsScss = await fs.readFile(
      path.join(process.cwd(), 'src', 'token-defaults.scss'),
      'utf8'
    );

    expect(packageJson.exports['./token']).toEqual({
      sass: './dist/token.scss',
      types: './dist/token.d.ts',
      import: './dist/token.js',
    });
    expect(packageJson.exports['./token-defaults']).toEqual({
      sass: './dist/token-defaults.scss',
    });
    expect(packageJson.files).toContain('token.scss');
    expect(packageJson.files).toContain('token-defaults.scss');
    expect(rootTokenScss).toBe(sourceTokenScss);
    expect(rootTokenDefaultsScss).toBe(sourceTokenDefaultsScss);
  });
});
