import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const extraArgs = process.argv.slice(2);

function run(args) {
  const result = spawnSync(pnpmCommand, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`Command failed: pnpm ${args.join(" ")}`);
  }

  if (result.error) {
    throw result.error;
  }
}

run(["run", "desktop:sync-node-native"]);
run(["run", "desktop:install-playwright"]);
run(["run", "desktop:prepare-node-runtime"]);
run(["build"]);

try {
  run(["exec", "electron-builder", "--publish", "never", ...extraArgs]);
} finally {
  run(["run", "desktop:sync-node-native"]);
}
