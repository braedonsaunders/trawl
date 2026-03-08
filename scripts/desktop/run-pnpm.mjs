import path from "node:path";
import { spawnSync } from "node:child_process";

function resolvePnpmInvocation() {
  const npmExecPath = process.env.npm_execpath;

  if (
    typeof npmExecPath === "string" &&
    /^pnpm(?:\.[cm]?js)?$/i.test(path.basename(npmExecPath))
  ) {
    return {
      command: process.execPath,
      baseArgs: [npmExecPath],
    };
  }

  if (process.platform === "win32") {
    throw new Error(
      "Unable to resolve pnpm on Windows. Run this script through `pnpm ...` so npm_execpath is available."
    );
  }

  return {
    command: "pnpm",
    baseArgs: [],
  };
}

export function runPnpm(args, options = {}) {
  const { command, baseArgs } = resolvePnpmInvocation();
  const { env, ...spawnOptions } = options;

  return spawnSync(command, [...baseArgs, ...args], {
    ...spawnOptions,
    env: env ? { ...process.env, ...env } : process.env,
  });
}
