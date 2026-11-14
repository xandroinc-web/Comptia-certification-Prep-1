/**
 * Vite config.
 *
 * PORT / BASE_PATH default (3000 / "/") instead of throwing, so
 * `vite build` works on Vercel without those vars set. The dev server
 * still honours them from the environment / .env.local when present.
 * Dev proxies /api to the api-server on localhost:8081 (its PORT in
 * artifacts/api-server/.env.local); in production the two are
 * same-origin via the Vercel rewrites in the root vercel.json.
 *
 * No Replit plugins: the cartographer / dev-banner /
 * runtime-error-modal imports were Replit-only and are removed.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT ?? "3000") || 3000;
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8081",
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
