import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
