import { defineConfig } from "vitest/config";

// NO aliases — imports resolve through node_modules exactly like a consumer
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
