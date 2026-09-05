import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      vscode: resolve(__dirname, "test/stubs/vscode.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["test/render/**", "jsdom"]],
    setupFiles: ["test/setup.ts"],
  },
});
