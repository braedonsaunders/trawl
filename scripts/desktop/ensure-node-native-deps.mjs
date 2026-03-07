import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const result = spawnSync(
  process.execPath,
  [
    "-e",
    "const sqlite=require('node:sqlite'); const db=new sqlite.DatabaseSync(':memory:'); db.close();",
  ],
  {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  }
);

if (result.error) {
  throw result.error;
}

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}
