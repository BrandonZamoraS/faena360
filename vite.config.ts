import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@faena360/domain": resolve(__dirname, "packages/domain/src"),
      "@faena360/application": resolve(__dirname, "packages/application/src"),
      "@faena360/infrastructure": resolve(
        __dirname,
        "packages/infrastructure/src"
      ),
      "@faena360/shared": resolve(__dirname, "packages/shared/src"),
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    includeSource: ["packages/**/*.ts", "apps/**/*.ts", "apps/**/*.tsx"],
  },
});
