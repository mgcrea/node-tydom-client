import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The entry barrel and the CLI carry no logic of their own: the CLI is
      // argument parsing over the client, and everything it calls is covered
      // through src/client.ts and src/utils/.
      exclude: ["src/index.ts", "src/cli/**", "src/typings/**"],
    },
  },
});
