import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist",
    clean: true,
    splitting: false,
    sourcemap: true,
    target: "node20",
    tsconfig: "tsconfig.build.json",
    esbuildOptions(options) {
      options.packages = "external";
    },
  },
  {
    entry: ["src/cli/tydom.ts"],
    format: ["esm"],
    dts: true,
    outDir: "dist/cli",
    splitting: false,
    sourcemap: true,
    target: "node20",
    tsconfig: "tsconfig.build.json",
    esbuildOptions(options) {
      options.packages = "external";
    },
  },
]);
