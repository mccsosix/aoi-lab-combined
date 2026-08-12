import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "local",
  base: "/",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../local-dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1800,
  },
});
