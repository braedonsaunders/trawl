import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPnpm } from "./run-pnpm.mjs";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const browsersPath = path.join(rootDir, ".playwright-browsers");

const result = runPnpm(["exec", "playwright", "install", "chromium"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
});

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}
