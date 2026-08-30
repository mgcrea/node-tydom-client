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
    // Deliberately no `packages: "external"` here. yargs is only ever used by
    // this CLI, so it is a devDependency and gets bundled into the binary
    // instead — otherwise every library consumer installs yargs and its 12
    // transitive packages for a command they never run. tsup's default keeps
    // the real runtime dependencies (debug, ws, ...) external.
  },
]);
