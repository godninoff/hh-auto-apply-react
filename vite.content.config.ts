import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  configFile: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/content/index.ts"),
      formats: ["iife"],
      name: "HHContent",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
