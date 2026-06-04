import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": "/src/test/server-only.ts",
    },
  },
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
      "/proxy/wikipedia-search": {
        target: "https://fr.wikipedia.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/wikipedia-search/, "/w/api.php"),
      },
      "/proxy/wikipedia-summary": {
        target: "https://fr.wikipedia.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/wikipedia-summary/, "/api/rest_v1/page/summary"),
      },
      "/proxy/google-news-rss": {
        target: "https://news.google.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/google-news-rss/, "/rss/search"),
      },
      "/proxy/reddit-search": {
        target: "https://www.reddit.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/reddit-search/, "/search.json"),
      },
      "/proxy/google-trends-daily": {
        target: "https://trends.google.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/google-trends-daily/, "/trends/api/dailytrends"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
