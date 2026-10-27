import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const frontendRoot = resolve(process.cwd(), "frontend");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendRoot, "");
  return {
    root: frontendRoot,
    plugins: [react()],
    server: { host: "localhost", port: Number(env.VITE_DEV_PORT || 5174), strictPort: true },
    build: { outDir: resolve(frontendRoot, "../dist/frontend"), emptyOutDir: true }
  };
});
