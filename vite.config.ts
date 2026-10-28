import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const renderer = path.resolve(__dirname, "src/renderer");

export default defineConfig({
  root: renderer,
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: path.join(renderer, "routes"),
      generatedRouteTree: path.join(renderer, "routeTree.gen.ts"),
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": renderer,
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:4317",
        changeOrigin: true,
      },
    },
  },
});
