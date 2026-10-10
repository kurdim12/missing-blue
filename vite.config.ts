import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = `http://localhost:${process.env.PORT || 8787}`;

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": API, "/data": API } },
  build: { outDir: "dist", chunkSizeWarningLimit: 3000 },
});
