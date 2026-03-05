import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "mcp/server": "src/mcp/server.ts"
  },
  format: ["esm"],
  target: "node18",
  clean: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node"
  }
});
