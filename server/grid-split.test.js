import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  GRID_SPLIT_LIMITS,
  cleanupExpiredGridSplitFiles,
  displayedImageDimensions,
  gridSplitQueueStats,
  gridTileRects,
  loadGridSplitSource,
  normalizeGridSpec,
  splitImageGrid,
} from "./grid-split.js";
import { readImageDimensions } from "./image2.js";

const execFileAsync = promisify(execFile);

async function waitFor(condition, message = "timed out waiting for condition") {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail(message);
}

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegHeaderWithOrientation(width, height, orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.set([0xff, 0xe1], 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app1,
    exif,
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
}

function readStoredZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    entries.push({
      name: buffer.toString("utf8", nameStart, nameStart + nameLength),
      data: buffer.subarray(dataStart, dataStart + compressedSize),
    });
    offset = dataStart + compressedSize;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  const endOffset = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(endOffset), 0x06054b50);
  assert.equal(buffer.readUInt16LE(endOffset + 10), entries.length);
  assert.equal(buffer.readUInt32LE(endOffset + 16), offset);
  return entries;
}

test("normalizes preset and restricted custom grid sizes", () => {
  assert.deepEqual(normalizeGridSpec({ grid: "2x2" }), {
    rows: 2,
    columns: 2,
    count: 4,
  });
  assert.deepEqual(normalizeGridSpec({ preset: "5×5" }), {
    rows: 5,
    columns: 5,
    count: 25,
  });
  assert.deepEqual(normalizeGridSpec({ rows: 8, columns: 8 }), {
    rows: 8,
    columns: 8,
    count: 64,
  });
  assert.throws(
    () => normalizeGridSpec({ rows: 9, columns: 2 }),
    /单边最多 8 格/,
  );
  assert.throws(
    () => normalizeGridSpec({ rows: 1, columns: 1 }),
    /至少需要 2 个分区/,
  );
  assert.throws(
    () => normalizeGridSpec({ rows: 2.5, columns: 2 }),
    /有效的宫格行数和列数/,
  );
});

test("covers every source pixel once when dimensions have remainders", () => {
  const tiles = gridTileRects(11, 10, 3, 3);
  assert.deepEqual(
    tiles.map(({ index, row, column, x, y, width, height }) => ({
      index,
      row,
      column,
      x,
      y,
      width,
      height,
    })),
    [
      { index: 1, row: 1, column: 1, x: 0, y: 0, width: 4, height: 4 },
      { index: 2, row: 1, column: 2, x: 4, y: 0, width: 4, height: 4 },
      { index: 3, row: 1, column: 3, x: 8, y: 0, width: 3, height: 4 },
      { index: 4, row: 2, column: 1, x: 0, y: 4, width: 4, height: 3 },
      { index: 5, row: 2, column: 2, x: 4, y: 4, width: 4, height: 3 },
      { index: 6, row: 2, column: 3, x: 8, y: 4, width: 3, height: 3 },
      { index: 7, row: 3, column: 1, x: 0, y: 7, width: 4, height: 3 },
      { index: 8, row: 3, column: 2, x: 4, y: 7, width: 4, height: 3 },
      { index: 9, row: 3, column: 3, x: 8, y: 7, width: 3, height: 3 },
    ],
  );
  assert.equal(
    tiles.reduce((pixels, tile) => pixels + tile.width * tile.height, 0),
    110,
  );
});

test("uses the browser-visible dimensions for EXIF-rotated phone photos", () => {
  assert.deepEqual(displayedImageDimensions(jpegHeaderWithOrientation(12, 20, 1)), {
    width: 12,
    height: 20,
    orientation: 1,
  });
  assert.deepEqual(displayedImageDimensions(jpegHeaderWithOrientation(12, 20, 6)), {
    width: 20,
    height: 12,
    orientation: 6,
  });
});

test("loads only local generated files or verified image data URLs", async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-source-"));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-data-"));
  const source = pngHeader(12, 10);
  await fs.writeFile(path.join(generatedDir, "safe image.png"), source);
  try {
    const relative = await loadGridSplitSource(
      "/generated/safe%20image.png?download=1",
      { generatedDir, temporaryDir },
    );
    assert.equal(relative.sourceType, "generated");
    assert.deepEqual(relative.buffer, source);

    const absolute = await loadGridSplitSource(
      "http://127.0.0.1:8791/generated/safe%20image.png",
      { generatedDir, temporaryDir },
    );
    assert.equal(absolute.inputPath, relative.inputPath);

    const dataUrl = `data:image/png;base64,${source.toString("base64")}`;
    const inline = await loadGridSplitSource(dataUrl, {
      generatedDir,
      temporaryDir,
    });
    assert.equal(inline.sourceType, "data-url");
    assert.equal(inline.mimeType, "image/png");

    await assert.rejects(
      () =>
        loadGridSplitSource("https://example.com/private.png", {
          generatedDir,
          temporaryDir,
        }),
      /不读取外部网址/,
    );
    await assert.rejects(
      () =>
        loadGridSplitSource("/generated/%2e%2e/secret.png", {
          generatedDir,
          temporaryDir,
        }),
      /仅支持本地 \/generated\/ 图片|生成图片地址不合法/,
    );
    await assert.rejects(
      () =>
        loadGridSplitSource(
          `data:image/jpeg;base64,${source.toString("base64")}`,
          { generatedDir, temporaryDir },
        ),
      /类型不一致/,
    );
  } finally {
    await Promise.all([
      fs.rm(generatedDir, { recursive: true, force: true }),
      fs.rm(temporaryDir, { recursive: true, force: true }),
    ]);
  }
});

test("rejects oversized generated files before reading their content", async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-large-"));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-temp-"));
  const filePath = path.join(generatedDir, "large.png");
  try {
    await fs.writeFile(filePath, pngHeader(10, 10));
    await fs.truncate(filePath, GRID_SPLIT_LIMITS.maxInputBytes + 1);
    await assert.rejects(
      () =>
        loadGridSplitSource("/generated/large.png", {
          generatedDir,
          temporaryDir,
        }),
      (error) => error.status === 413 && error.code === "GRID_INPUT_TOO_LARGE",
    );
  } finally {
    await Promise.all([
      fs.rm(generatedDir, { recursive: true, force: true }),
      fs.rm(temporaryDir, { recursive: true, force: true }),
    ]);
  }
});

test("cleans up only expired grid split artifacts", async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-ttl-"));
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const oldNames = [
    "grid-123e4567-e89b-12d3-a456-426614174000.zip",
    "grid-123e4567-e89b-12d3-a456-426614174000.zip.partial",
    "grid-123e4567-e89b-12d3-a456-426614174000-01-r1-c1.png",
  ];
  const freshName =
    "grid-223e4567-e89b-42d3-b456-426614174000-01-r1-c1.png";
  const unrelatedNames = ["grid-user-photo.png", "normal.png", "grid-note.zip"];
  try {
    await Promise.all(
      [...oldNames, freshName, ...unrelatedNames].map((name) =>
        fs.writeFile(path.join(generatedDir, name), Buffer.from(name)),
      ),
    );
    const expiredDate = new Date(
      now - GRID_SPLIT_LIMITS.outputTtlMs - 1_000,
    );
    const freshDate = new Date(now - GRID_SPLIT_LIMITS.outputTtlMs + 1_000);
    await Promise.all(
      oldNames.map((name) =>
        fs.utimes(path.join(generatedDir, name), expiredDate, expiredDate),
      ),
    );
    await fs.utimes(
      path.join(generatedDir, freshName),
      freshDate,
      freshDate,
    );
    await Promise.all(
      unrelatedNames.map((name) =>
        fs.utimes(path.join(generatedDir, name), expiredDate, expiredDate),
      ),
    );

    const removed = await cleanupExpiredGridSplitFiles(generatedDir, { now });
    assert.deepEqual(removed.sort(), oldNames.sort());
    assert.deepEqual(
      (await fs.readdir(generatedDir)).sort(),
      [freshName, ...unrelatedNames].sort(),
    );
  } finally {
    await fs.rm(generatedDir, { recursive: true, force: true });
  }
});

test("splits in reading order with one ffmpeg process and creates a ZIP", async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-run-"));
  await fs.writeFile(path.join(generatedDir, "source.png"), pngHeader(11, 10));
  const calls = [];
  const fakeExec = async (command, args, options) => {
    calls.push({ command, args, options });
    const outputPaths = args.flatMap((value, index) =>
      value === "png" && args[index - 1] === "-c:v" ? [args[index + 1]] : [],
    );
    await Promise.all(
      outputPaths.map((outputPath, index) =>
        fs.writeFile(outputPath, Buffer.from(`tile-${index + 1}`)),
      ),
    );
  };
  try {
    const result = await splitImageGrid(
      { imageUrl: "/generated/source.png", grid: "3x3" },
      { generatedDir, execFile: fakeExec },
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0].args.join(" "), /split=9/);
    assert.match(
      calls[0].args.join(" "),
      /crop=w=4:h=4:x=0:y=0:exact=1/,
    );
    assert.match(
      calls[0].args.join(" "),
      /crop=w=3:h=3:x=8:y=7:exact=1/,
    );
    assert.deepEqual(result.grid, { rows: 3, columns: 3, count: 9 });
    assert.equal(result.rows, 3);
    assert.equal(result.columns, 3);
    assert.equal(result.count, 9);
    assert.equal(result.source.width, 11);
    assert.equal(result.source.height, 10);
    assert.equal(result.tiles.length, 9);
    assert.deepEqual(result.tiles[0], {
      index: 1,
      row: 1,
      column: 1,
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      name: "01-r1-c1.png",
      url: `/generated/${result.id}-01-r1-c1.png`,
    });
    assert.equal(result.tiles[8].name, "09-r3-c3.png");
    assert.equal(result.zipUrl, `/generated/${result.id}.zip`);
    assert.equal(result.archiveUrl, result.zipUrl);
    assert.equal(result.downloadUrl, result.zipUrl);

    const archive = await fs.readFile(
      path.join(generatedDir, `${result.id}.zip`),
    );
    const entries = readStoredZipEntries(archive);
    assert.deepEqual(
      entries.map((entry) => entry.name),
      [
        "01-r1-c1.png",
        "02-r1-c2.png",
        "03-r1-c3.png",
        "04-r2-c1.png",
        "05-r2-c2.png",
        "06-r2-c3.png",
        "07-r3-c1.png",
        "08-r3-c2.png",
        "09-r3-c3.png",
      ],
    );
    assert.equal(entries[0].data.toString(), "tile-1");
    assert.equal(entries[8].data.toString(), "tile-9");
  } finally {
    await fs.rm(generatedDir, { recursive: true, force: true });
  }
});

test("removes partial outputs when image processing fails", async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-fail-"));
  await fs.writeFile(path.join(generatedDir, "source.png"), pngHeader(8, 8));
  const fakeExec = async (_command, args) => {
    const firstOutputIndex = args.findIndex(
      (value, index) => value === "png" && args[index - 1] === "-c:v",
    );
    await fs.writeFile(args[firstOutputIndex + 1], Buffer.from("partial"));
    throw new Error("ffmpeg failed");
  };
  try {
    await assert.rejects(
      () =>
        splitImageGrid(
          { imageUrl: "/generated/source.png", grid: "2x2" },
          { generatedDir, execFile: fakeExec },
        ),
      /ffmpeg failed/,
    );
    assert.deepEqual(await fs.readdir(generatedDir), ["source.png"]);
  } finally {
    await fs.rm(generatedDir, { recursive: true, force: true });
  }
});

test("runs at most two ffmpeg grid jobs concurrently", async () => {
  const roots = await Promise.all(
    Array.from({ length: 3 }, () =>
      fs.mkdtemp(path.join(os.tmpdir(), "grid-queue-")),
    ),
  );
  await Promise.all(
    roots.map((root) =>
      fs.writeFile(path.join(root, "source.png"), pngHeader(8, 8)),
    ),
  );
  let active = 0;
  let maximumActive = 0;
  const releases = [];
  const fakeExec = async (_command, args) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => releases.push(resolve));
    const outputPaths = args.flatMap((value, index) =>
      value === "png" && args[index - 1] === "-c:v" ? [args[index + 1]] : [],
    );
    await Promise.all(
      outputPaths.map((outputPath) => fs.writeFile(outputPath, Buffer.from("tile"))),
    );
    active -= 1;
  };
  try {
    const jobs = roots.map((generatedDir) =>
      splitImageGrid(
        { imageUrl: "/generated/source.png", grid: "2x2" },
        { generatedDir, execFile: fakeExec },
      ),
    );
    await waitFor(
      () => releases.length === 2,
      "timed out waiting for grid split queue",
    );
    assert.equal(active, 2);
    assert.equal(maximumActive, 2);
    releases.splice(0).forEach((release) => release());
    await waitFor(
      () => releases.length === 1,
      "timed out waiting for queued grid split",
    );
    assert.ok(active > 0 && active <= GRID_SPLIT_LIMITS.maxConcurrentJobs);
    releases.shift()();
    await Promise.all(jobs);
    assert.equal(maximumActive, GRID_SPLIT_LIMITS.maxConcurrentJobs);
  } finally {
    await Promise.all(
      roots.map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  }
});

test("rejects excess grid jobs before reading or writing request data", async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "grid-busy-"));
  await fs.writeFile(path.join(generatedDir, "source.png"), pngHeader(8, 8));
  const releases = [];
  const fakeExec = async (_command, args) => {
    await new Promise((resolve) => releases.push(resolve));
    const outputPaths = args.flatMap((value, index) =>
      value === "png" && args[index - 1] === "-c:v" ? [args[index + 1]] : [],
    );
    await Promise.all(
      outputPaths.map((outputPath) =>
        fs.writeFile(outputPath, Buffer.from("tile")),
      ),
    );
  };
  const jobs = [];
  try {
    for (
      let index = 0;
      index <
      GRID_SPLIT_LIMITS.maxConcurrentJobs + GRID_SPLIT_LIMITS.maxQueuedJobs;
      index += 1
    ) {
      jobs.push(
        splitImageGrid(
          { imageUrl: "/generated/source.png", grid: "2x2" },
          { generatedDir, execFile: fakeExec },
        ),
      );
    }

    await waitFor(() => {
      const stats = gridSplitQueueStats();
      return (
        stats.active === GRID_SPLIT_LIMITS.maxConcurrentJobs &&
        stats.queued === GRID_SPLIT_LIMITS.maxQueuedJobs
      );
    }, "timed out filling the grid split queue");

    await assert.rejects(
      () =>
        splitImageGrid(
          { imageUrl: "/generated/does-not-exist.png", grid: "2x2" },
          { generatedDir, execFile: fakeExec },
        ),
      (error) =>
        error.status === 429 &&
        error.code === "GRID_SPLIT_BUSY" &&
        /稍后重试/.test(error.message),
    );
    assert.deepEqual(gridSplitQueueStats(), {
      active: GRID_SPLIT_LIMITS.maxConcurrentJobs,
      queued: GRID_SPLIT_LIMITS.maxQueuedJobs,
      concurrency: GRID_SPLIT_LIMITS.maxConcurrentJobs,
      queueLimit: GRID_SPLIT_LIMITS.maxQueuedJobs,
    });
  } finally {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      releases.splice(0).forEach((release) => release());
      const stats = gridSplitQueueStats();
      if (!stats.active && !stats.queued) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await Promise.allSettled(jobs);
    await fs.rm(generatedDir, { recursive: true, force: true });
  }
  assert.deepEqual(gridSplitQueueStats(), {
    active: 0,
    queued: 0,
    concurrency: GRID_SPLIT_LIMITS.maxConcurrentJobs,
    queueLimit: GRID_SPLIT_LIMITS.maxQueuedJobs,
  });
});

test("real ffmpeg preserves every odd source pixel for PNG and JPEG", async (t) => {
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    await execFileAsync(ffmpegPath, ["-version"], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      t.skip("ffmpeg is not installed");
      return;
    }
    throw error;
  }

  const generatedDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grid-ffmpeg-"),
  );
  const pngPath = path.join(generatedDir, "odd-11x13.png");
  const jpegPath = path.join(generatedDir, "odd-11x13.jpg");
  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=11x13:rate=1",
        "-frames:v",
        "1",
        pngPath,
      ],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        pngPath,
        "-frames:v",
        "1",
        "-pix_fmt",
        "yuvj444p",
        jpegPath,
      ],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );

    for (const sourceName of [path.basename(pngPath), path.basename(jpegPath)]) {
      assert.deepEqual(
        readImageDimensions(
          await fs.readFile(path.join(generatedDir, sourceName)),
        ),
        { width: 11, height: 13 },
      );
      const result = await splitImageGrid(
        { imageUrl: `/generated/${sourceName}`, grid: "3x3" },
        { generatedDir, ffmpegPath },
      );
      let outputArea = 0;
      for (const tile of result.tiles) {
        const fileName = decodeURIComponent(
          tile.url.slice("/generated/".length),
        );
        const actual = readImageDimensions(
          await fs.readFile(path.join(generatedDir, fileName)),
        );
        assert.deepEqual(
          actual,
          { width: tile.width, height: tile.height },
          `${sourceName} tile ${tile.index} dimensions`,
        );
        outputArea += actual.width * actual.height;
      }
      assert.equal(outputArea, result.source.width * result.source.height);
      assert.equal(outputArea, 11 * 13);
    }
  } finally {
    await fs.rm(generatedDir, { recursive: true, force: true });
  }
});

