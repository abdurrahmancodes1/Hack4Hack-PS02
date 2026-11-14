import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Only proxy actual API endpoints!
      "/user": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000", changeOrigin: true },
      "/teams": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000", changeOrigin: true },
      "/uploads": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000", changeOrigin: true },
      "/submissions": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000", changeOrigin: true },
      "/organizer/stats": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/submissions": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/teams": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/hackathon": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/organizer/export": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/health": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000", changeOrigin: true },
      "/hackathon": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000", changeOrigin: true },
    },
  },
});
