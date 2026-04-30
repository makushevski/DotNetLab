import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        labs: resolve(__dirname, "labs.html"),
        methodology: resolve(__dirname, "methodology.html"),
        aboutAuthor: resolve(__dirname, "about-author.html"),
        privacy: resolve(__dirname, "privacy.html"),
        dictionary: resolve(__dirname, "labs/dictionary.html"),
        concurrentDictionary: resolve(__dirname, "labs/concurrent-dictionary.html")
      }
    }
  }
});
