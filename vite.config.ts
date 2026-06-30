import { defineConfig } from "vite";

// Phaser is large; keep it in its own chunk so the game logic stays cacheable.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: { phaser: ["phaser"] },
      },
    },
  },
  server: { host: true, port: 5173 },
});
