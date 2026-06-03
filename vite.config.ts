import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/proxy/gdelt": {
        target: "https://api.gdeltproject.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/gdelt/, "/api/v2/doc/doc"),
      },
      "/proxy/lefigaro": {
        target: "https://video.lefigaro.fr",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/lefigaro/, "/figaro/la-question-du-jour"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
