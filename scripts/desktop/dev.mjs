import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args, extraEnv = {}) {
  const result = spawnSync(pnpmCommand, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
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
