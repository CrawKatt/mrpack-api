import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_BACKEND_URL || "http://localhost:3000";

  return {
    plugins: [react()],
    base: "/admin/",
    build: {
      outDir: path.resolve(__dirname, "../static/admin"),
      emptyOutDir: true,
      assetsDir: "assets",
      sourcemap: mode !== "production",
      target: "es2020",
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": { target: backend, changeOrigin: false },
        "/login.html": { target: backend, changeOrigin: false },
      },
    },
    preview: {
      port: 4173,
    },
  };
});
