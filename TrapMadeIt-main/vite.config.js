import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("three/examples/jsm/postprocessing")) return "three-post";
          if (id.includes("three/examples/jsm/loaders")) return "three-loaders";
          if (id.includes("/node_modules/three/")) return "three-core";
        },
      },
    },
  },
});
