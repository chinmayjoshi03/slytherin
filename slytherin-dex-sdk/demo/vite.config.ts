import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: ".",
  server: {
    port: 3000,
    fs: {
      // Allow Vite to serve files from the parent SDK dist directory
      allow: ["..", path.resolve(__dirname, "..")],
    },
  },
  resolve: {
    alias: {
      // Point directly to the SDK source for Vite to bundle
      "slytherin-dex-sdk": path.resolve(__dirname, "../src/index.ts"),
    },
  },
});
