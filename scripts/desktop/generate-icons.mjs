import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const workspaceRoot = path.resolve(process.cwd());
const buildDir = path.join(workspaceRoot, "build");
const sourceSvgPath = path.join(workspaceRoot, "assets", "desktop", "icon-source.svg");

const pngTargets = [
  { name: "icon.png", size: 1024 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-256.png", size: 256 },
  { name: "icon-128.png", size: 128 },
  { name: "icon-64.png", size: 64 },
  { name: "icon-32.png", size: 32 },
  { name: "icon-16.png", size: 16 },
];

function createIco(buffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(buffers.length, 4);

  let offset = 6 + buffers.length * 16;
  const entries = [];

  for (const { size, buffer } of buffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...buffers.map((entry) => entry.buffer)]);
}

function createIcns(buffers) {
  const typeBySize = new Map([
    [16, "icp4"],
    [32, "icp5"],
    [64, "icp6"],
    [128, "ic07"],
    [256, "ic08"],
    [512, "ic09"],
    [1024, "ic10"],
  ]);

  const chunks = buffers.map(({ size, buffer }) => {
    const type = typeBySize.get(size);
    if (!type) {
      throw new Error(`Unsupported ICNS icon size: ${size}`);
    }

    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(buffer.length + 8, 4);
    return Buffer.concat([header, buffer]);
  });

  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, 4, "ascii");
  fileHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([fileHeader, ...chunks]);
}

async function main() {
  await mkdir(buildDir, { recursive: true });
  const svgBuffer = await readFile(sourceSvgPath);

  const rendered = [];
  for (const target of pngTargets) {
    const outputPath = path.join(buildDir, target.name);
    const buffer = await sharp(svgBuffer)
      .resize(target.size, target.size)
      .png()
      .toBuffer();
    await writeFile(outputPath, buffer);
    rendered.push({ size: target.size, buffer });
  }

  const icoBuffer = createIco(
    rendered.filter((entry) => [16, 32, 64, 128, 256].includes(entry.size))
  );
  await writeFile(path.join(buildDir, "icon.ico"), icoBuffer);

  const icnsBuffer = createIcns(
    rendered.filter((entry) => [16, 32, 64, 128, 256, 512, 1024].includes(entry.size))
  );
  await writeFile(path.join(buildDir, "icon.icns"), icnsBuffer);

  console.log("Generated desktop icon assets in build/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
