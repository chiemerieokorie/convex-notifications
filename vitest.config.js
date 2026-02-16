import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "convex-notifications/test": path.resolve(__dirname, "src/test.ts"),
      "convex-notifications/convex.config.js": path.resolve(__dirname, "src/component/convex.config.ts"),
      "convex-notifications/webhooks": path.resolve(__dirname, "src/component/webhooks/index.ts"),
      "convex-notifications": path.resolve(__dirname, "src/client/index.ts"),
    },
  },
  test: {
    environment: "edge-runtime",
    exclude: [".examples/**", "node_modules/**", "consumer-test/**"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
});
