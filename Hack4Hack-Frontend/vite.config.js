import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/user": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
        secure: true,
      },
      "/teams": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
        secure: true,
      },
      "/uploads": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
        secure: true,
      },
      "/submissions": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
        secure: true,
      },
      "/organizer": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
        secure: true,
      },
      "/health": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
      },
      "/hackathon": {
        target: "https://hack4hack-ps02.onrender.com",
        changeOrigin: true,
      },
    },
  },
});
