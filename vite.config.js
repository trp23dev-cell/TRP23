import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
    watch: {
      // The Unity project carries ~29k generated files (Library/PackageCache alone
      // is most of them). Watching those exhausts the inotify limit and kills the
      // dev server with ENOSPC before it finishes starting. None of it feeds the
      // web build, so none of it needs watching.
      ignored: [
        "**/Unity/**",
        "**/dist/**",
        "**/server/storage/**",
        "**/FP FREE ROAM TEST PHASE 1/**",
        "**/Bibile */**",
        "**/.git/**",
      ],
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
