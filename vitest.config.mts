import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "server-only": fromRoot("./src/test/server-only-stub.ts"),
    },
  },
});
