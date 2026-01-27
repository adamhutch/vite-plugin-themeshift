import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeShiftPlugin } from '../src';

export default defineConfig({
  plugins: [
    react(),
    themeShiftPlugin({
      tokensDir: 'tokens',
      platforms: ['css', 'scss', 'meta'],
      injectSassTokenFn: true,
      watch: true,
    }),
  ],
});
