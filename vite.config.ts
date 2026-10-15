import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri expects a fixed port and must not fall back to another one.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Prevent Vite from obscuring Rust errors during `tauri dev`.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Don't watch the Rust source tree, Tauri handles that.
      ignored: ["**/src-tauri/**"],
    },
  },
  // Produce a build that Tauri can bundle.
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
