import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPnpm } from "./run-pnpm.mjs";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
function run(args, extraEnv = {}) {
  const result = runPnpm(args, {
    cwd: rootDir,
    stdio: "inherit",
    env: extraEnv,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

run(["run", "desktop:sync-node-native"]);
run(["exec", "electron", "."], {
  TRAWL_NODE_BINARY: process.execPath,
});
