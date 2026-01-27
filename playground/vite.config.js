import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { styleDictionaryThemeShiftPlugin } from "../src";

export default defineConfig({
  plugins: [
    react(),
    styleDictionaryThemeShiftPlugin({
      tokensDir: "tokens",
      platforms: ["css", "scss", "meta"],
      injectSassTokenFn: true,
      watch: true,
    }),
  ],
});
