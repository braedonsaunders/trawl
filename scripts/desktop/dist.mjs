import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPnpm } from "./run-pnpm.mjs";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const extraArgs = process.argv.slice(2);

function run(args) {
  const result = runPnpm(args, {
    cwd: rootDir,
    stdio: "inherit",
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
run(["run", "desktop:icons"]);
run(["build"]);

try {
  run(["exec", "electron-builder", "--publish", "never", ...extraArgs]);
} finally {
  run(["run", "desktop:sync-node-native"]);
}
