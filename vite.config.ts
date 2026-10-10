import { defineConfig } from "vite";

const API = `http://localhost:${process.env.PORT || 8787}`;

// JSX is compiled by Vite's built-in esbuild (automatic runtime). @vitejs/plugin-react 6 requires Vite 8 and fails to
// load on Vite 7 ("./internal" not exported), so it is not used; the only loss is React Fast Refresh in dev (full reload instead).
// Dev: Vite serves public/ (so /radar/*.png works) and proxies /api to the Hono server.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: { port: 5173, proxy: { "/api": API } },
  build: { outDir: "dist", chunkSizeWarningLimit: 3000 },
});
