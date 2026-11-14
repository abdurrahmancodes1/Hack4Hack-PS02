import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Only proxy actual API endpoints!
      "/user": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/teams": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/uploads": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/submissions": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/stats": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/submissions": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/teams": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/hackathon": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/export": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/health": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/hackathon": {
        target: import.meta.env.API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
