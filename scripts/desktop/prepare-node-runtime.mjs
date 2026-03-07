import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const outputDir = path.join(rootDir, ".desktop-node");
const outputPath = path.join(
  outputDir,
  process.platform === "win32" ? "node.exe" : "node"
);
const version = process.version.replace(/^v/, "");
const supportedTargets = {
  "darwin-arm64": {
    archiveExt: "tar.gz",
    archiveName: `node-v${version}-darwin-arm64.tar.gz`,
    extractedDir: `node-v${version}-darwin-arm64`,
    binaryPath: ["bin", "node"],
  },
  "darwin-x64": {
    archiveExt: "tar.gz",
    archiveName: `node-v${version}-darwin-x64.tar.gz`,
    extractedDir: `node-v${version}-darwin-x64`,
    binaryPath: ["bin", "node"],
  },
};
const targetKey = `${process.platform}-${process.arch}`;
const target = supportedTargets[targetKey];

if (!target) {
  throw new Error(
    `Unsupported desktop Node runtime target: ${targetKey}. Add an official Node distribution mapping first.`
  );
}

const markerPath = path.join(outputDir, ".version");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }

  if (result.error) {
    throw result.error;
  }
}

async function downloadArchive(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Node runtime from ${url} (${response.status})`);
  }

  const chunks = [];
  for await (const chunk of response.body) {
    chunks.push(chunk);
  }

  fs.writeFileSync(destination, Buffer.concat(chunks));
}

fs.mkdirSync(outputDir, { recursive: true });

const markerValue = JSON.stringify({ version, target: targetKey });
if (
  fs.existsSync(outputPath) &&
  fs.existsSync(markerPath) &&
  fs.readFileSync(markerPath, "utf8") === markerValue
) {
  console.log(`[desktop] Bundled Node runtime: ${outputPath}`);
  process.exit(0);
}

const cacheDir = path.join(outputDir, ".cache");
const archivePath = path.join(cacheDir, target.archiveName);
const extractDir = path.join(cacheDir, target.extractedDir);
const url = `https://nodejs.org/dist/v${version}/${target.archiveName}`;

fs.rmSync(cacheDir, { recursive: true, force: true });
fs.mkdirSync(cacheDir, { recursive: true });

await downloadArchive(url, archivePath);
run("tar", ["-xzf", archivePath, "-C", cacheDir]);

fs.copyFileSync(path.join(extractDir, ...target.binaryPath), outputPath);

if (process.platform !== "win32") {
  fs.chmodSync(outputPath, 0o755);
}

fs.writeFileSync(markerPath, markerValue);
console.log(`[desktop] Bundled Node runtime: ${outputPath}`);
