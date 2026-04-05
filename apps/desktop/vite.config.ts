import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({})],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "main.html"),
        overlay: path.resolve(__dirname, "overlay.html")
      }
    }
  }
});
