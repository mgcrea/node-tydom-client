import { defineConfig } from "tsdown";

// Two entries with deliberately different bundling rules.
export default defineConfig([
  {
    // The library. Real runtime dependencies (debug, ws, http-parser-js,
    // kolorist) stay external so consumers dedupe them normally.
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    outDir: "dist",
    target: "node22",
    platform: "node",
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    // The `tydom` CLI. yargs is a devDependency and gets bundled into the
    // binary rather than shipped: it is only ever used here, and leaving it
    // external would make every library consumer install yargs and its
    // transitive tree for a command they never run.
    entry: ["src/cli/tydom.ts"],
    format: ["esm"],
    outDir: "dist/cli",
    target: "node22",
    platform: "node",
    dts: false,
    clean: false,
    sourcemap: true,
    noExternal: ["yargs"],
  },
]);
