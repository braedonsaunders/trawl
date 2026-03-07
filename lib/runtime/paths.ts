import * as path from "path";

function resolveBaseDir(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : fallback;
}

export function getAppRoot(): string {
  return resolveBaseDir(process.env.TRAWL_APP_DIR, process.cwd());
}

export function getDataRoot(): string {
  return resolveBaseDir(process.env.TRAWL_DATA_DIR, getAppRoot());
}

export function getDbPath(): string {
  return path.join(getDataRoot(), "trawl.db");
}

export function getMigrationsDir(): string {
  return path.join(getAppRoot(), "lib", "db", "migrations");
}

export function getDefaultScreenshotsDir(): string {
  return path.join(getDataRoot(), "data", "screenshots");
}

export function resolveWritablePath(
  value: string | null | undefined,
  fallback = getDefaultScreenshotsDir()
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  return path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(getDataRoot(), trimmed);
}
