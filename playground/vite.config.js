import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeShift } from '../src';

export default defineConfig({
  plugins: [
    react(),
    themeShift({
      tokensDir: 'tokens',
      platforms: ['css', 'scss', 'meta'],
      injectSassTokenFn: true,
      watch: true,
    }),
  ],
});
