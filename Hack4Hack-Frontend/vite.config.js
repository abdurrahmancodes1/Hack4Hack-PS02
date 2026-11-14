import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Vite config runs in Node, where import.meta.env is not available.
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    env.API_PROXY_TARGET ||
    env.VITE_API_BASE_URL ||
    "http://localhost:4000";
  const apiPaths = [
    "/user",
    "/teams",
    "/uploads",
    "/submissions",
    "/organizer",
    "/health",
    "/hackathon",
  ];

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: Object.fromEntries(
        apiPaths.map((route) => [route, { target: apiTarget, changeOrigin: true }]),
      ),
    },
  };
});
