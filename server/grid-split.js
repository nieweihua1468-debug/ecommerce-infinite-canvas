import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { readImageDimensions } from "./image2.js";

const execFileAsync = promisify(execFile);

export const GRID_SPLIT_LIMITS = Object.freeze({
  maxInputBytes: 24 * 1024 * 1024,
  maxInputPixels: 64_000_000,
  maxAxis: 8,
  maxTiles: 64,
  maxOutputBytes: 256 * 1024 * 1024,
  maxConcurrentJobs: 2,
  maxQueuedJobs: 8,
  outputTtlMs: 24 * 60 * 60 * 1000,
});

const DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpe?g|webp));base64,([a-zA-Z0-9+/]*={0,2})$/;
const IMAGE_EXTENSIONS = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
});
const GRID_OUTPUT_FILE_PATTERN =
  /^grid-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-\d{2}-r\d+-c\d+\.png|\.zip(?:\.partial)?)$/i;

function httpError(message, status = 400, code = "INVALID_GRID_SPLIT_INPUT") {
  return Object.assign(new Error(message), { status, code });
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function normalizeGridSpec(input = {}) {
  const preset = String(input.grid || input.preset || "")
    .trim()
    .toLowerCase();
  const presetMatch = preset.match(/^(\d{1,2})\s*[x×]\s*(\d{1,2})$/);
  const rows = positiveInteger(input.rows || presetMatch?.[1]);
  const columns = positiveInteger(
    input.columns || input.cols || presetMatch?.[2],
  );
  if (!rows || !columns)
    throw httpError("请选择有效的宫格行数和列数");
  if (rows > GRID_SPLIT_LIMITS.maxAxis || columns > GRID_SPLIT_LIMITS.maxAxis)
    throw httpError(`自定义宫格单边最多 ${GRID_SPLIT_LIMITS.maxAxis} 格`);
  const count = rows * columns;
  if (count < 2)
    throw httpError("宫格切分至少需要 2 个分区");
  if (count > GRID_SPLIT_LIMITS.maxTiles)
    throw httpError(`单次最多切分 ${GRID_SPLIT_LIMITS.maxTiles} 张图片`);
  return { rows, columns, count };
}

function axisSegments(total, count) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  let offset = 0;
  return Array.from({ length: count }, (_, index) => {
    const size = base + (index < remainder ? 1 : 0);
    const segment = { offset, size };
    offset += size;
    return segment;
  });
}

export function gridTileRects(widthInput, heightInput, rowsInput, columnsInput) {
  const width = positiveInteger(widthInput);
  const height = positiveInteger(heightInput);
  const { rows, columns } = normalizeGridSpec({
    rows: rowsInput,
    columns: columnsInput,
  });
  if (!width || !height) throw httpError("无法读取原图像素尺寸");
  if (columns > width || rows > height)
    throw httpError("宫格数量不能超过原图像素尺寸");
  const xSegments = axisSegments(width, columns);
  const ySegments = axisSegments(height, rows);
  return ySegments.flatMap((ySegment, rowIndex) =>
    xSegments.map((xSegment, columnIndex) => ({
      index: rowIndex * columns + columnIndex + 1,
      row: rowIndex + 1,
      column: columnIndex + 1,
      x: xSegment.offset,
      y: ySegment.offset,
      width: xSegment.size,
      height: ySegment.size,
    })),
  );
}

function detectedMimeType(buffer) {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  )
    return "image/png";
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8)
    return "image/jpeg";
  if (
    buffer.length >= 16 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return "";
}

function readJpegExifOrientation(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return 1;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return 1;
  let markerOffset = 2;
  while (markerOffset + 4 <= buffer.length) {
    if (buffer[markerOffset] !== 0xff) {
      markerOffset += 1;
      continue;
    }
    const marker = buffer[markerOffset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      markerOffset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(markerOffset + 2);
    if (segmentLength < 2 || markerOffset + 2 + segmentLength > buffer.length)
      break;
    const payloadOffset = markerOffset + 4;
    if (
      marker === 0xe1 &&
      buffer.toString("ascii", payloadOffset, payloadOffset + 6) ===
        "Exif\0\0"
    ) {
      const tiffOffset = payloadOffset + 6;
      const byteOrder = buffer.toString("ascii", tiffOffset, tiffOffset + 2);
      const littleEndian = byteOrder === "II";
      if (!littleEndian && byteOrder !== "MM") return 1;
      const readUInt16 = (offset) =>
        littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
      const readUInt32 = (offset) =>
        littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
      if (tiffOffset + 8 > buffer.length || readUInt16(tiffOffset + 2) !== 42)
        return 1;
      const directoryOffset = tiffOffset + readUInt32(tiffOffset + 4);
      if (directoryOffset + 2 > buffer.length) return 1;
      const entryCount = readUInt16(directoryOffset);
      for (let index = 0; index < entryCount; index += 1) {
        const entryOffset = directoryOffset + 2 + index * 12;
        if (entryOffset + 12 > buffer.length) return 1;
        if (readUInt16(entryOffset) !== 0x0112) continue;
        const type = readUInt16(entryOffset + 2);
        const count = readUInt32(entryOffset + 4);
        if (type !== 3 || count < 1) return 1;
        const orientation = readUInt16(entryOffset + 8);
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
      return 1;
    }
    markerOffset += segmentLength + 2;
  }
  return 1;
}

export function displayedImageDimensions(buffer) {
  const dimensions = readImageDimensions(buffer);
  if (!dimensions) return null;
  const orientation =
    detectedMimeType(buffer) === "image/jpeg"
      ? readJpegExifOrientation(buffer)
      : 1;
  return {
    width: [5, 6, 7, 8].includes(orientation)
      ? dimensions.height
      : dimensions.width,
    height: [5, 6, 7, 8].includes(orientation)
      ? dimensions.width
      : dimensions.height,
    orientation,
  };
}

function generatedPathname(value) {
  const source = String(value || "").trim();
  if (!source) throw httpError("请选择要切分的图片");
  let parsed;
  try {
    parsed = new URL(source, "http://commerce-canvas.local");
  } catch {
    throw httpError("图片地址不合法");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw httpError("仅支持本地生成图片或 data URL");
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw httpError("图片地址编码不合法");
  }
  if (!pathname.startsWith("/generated/"))
    throw httpError("仅支持本地 /generated/ 图片，不读取外部网址");
  const fileName = pathname.slice("/generated/".length);
  if (
    !fileName ||
    fileName !== path.basename(fileName) ||
    fileName.includes("\\") ||
    fileName.includes("\0")
  )
    throw httpError("生成图片地址不合法");
  return { source, fileName };
}

async function loadDataUrl(source, temporaryDir) {
  const maximumEncodedLength =
    Math.ceil(GRID_SPLIT_LIMITS.maxInputBytes / 3) * 4;
  if (source.length > maximumEncodedLength + 80)
    throw httpError("待切分图片不能超过 24MB", 413, "GRID_INPUT_TOO_LARGE");
  const match = source.match(DATA_URL_PATTERN);
  if (!match) throw httpError("data URL 仅支持 PNG、JPG 或 WebP 图片");
  const declaredMimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  if (match[2].length > maximumEncodedLength)
    throw httpError("待切分图片不能超过 24MB", 413, "GRID_INPUT_TOO_LARGE");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw httpError("待切分图片内容为空");
  if (buffer.length > GRID_SPLIT_LIMITS.maxInputBytes)
    throw httpError("待切分图片不能超过 24MB", 413, "GRID_INPUT_TOO_LARGE");
  const mimeType = detectedMimeType(buffer);
  if (!mimeType || mimeType !== declaredMimeType)
    throw httpError("图片内容与 data URL 类型不一致");
  const extension = IMAGE_EXTENSIONS[mimeType];
  const inputPath = path.join(temporaryDir, `source.${extension}`);
  await fs.writeFile(inputPath, buffer, { flag: "wx" });
  return {
    inputPath,
    buffer,
    mimeType,
    sourceType: "data-url",
    sourceUrl: null,
  };
}

async function loadGeneratedImage(source, generatedDir) {
  const { fileName } = generatedPathname(source);
  const root = path.resolve(generatedDir);
  const inputPath = path.resolve(root, fileName);
  if (path.dirname(inputPath) !== root)
    throw httpError("生成图片地址不合法");
  let stat;
  try {
    stat = await fs.lstat(inputPath);
  } catch (error) {
    if (error?.code === "ENOENT")
      throw httpError("待切分的生成图片不存在", 404, "GRID_SOURCE_NOT_FOUND");
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw httpError("待切分的生成图片不是有效文件");
  if (stat.size > GRID_SPLIT_LIMITS.maxInputBytes)
    throw httpError("待切分图片不能超过 24MB", 413, "GRID_INPUT_TOO_LARGE");
  const buffer = await fs.readFile(inputPath);
  const mimeType = detectedMimeType(buffer);
  if (!mimeType) throw httpError("仅支持 PNG、JPG 或 WebP 图片切分");
  return {
    inputPath,
    buffer,
    mimeType,
    sourceType: "generated",
    sourceUrl: `/generated/${encodeURIComponent(fileName)}`,
  };
}

export async function loadGridSplitSource(
  source,
  { generatedDir, temporaryDir },
) {
  const value = String(source || "").trim();
  if (value.startsWith("data:")) return loadDataUrl(value, temporaryDir);
  return loadGeneratedImage(value, generatedDir);
}

let crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, value) => {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1)
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    return current >>> 0;
  });
  return crcTable;
}

async function fileCrc32(filePath) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for await (const chunk of createReadStream(filePath)) {
    for (const byte of chunk) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((Math.floor(date.getSeconds() / 2) || 0) & 0x1f),
    date:
      (((year - 1980) & 0x7f) << 9) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      (date.getDate() & 0x1f),
  };
}

async function writeAt(handle, buffer, position) {
  let written = 0;
  while (written < buffer.length) {
    const result = await handle.write(
      buffer,
      written,
      buffer.length - written,
      position + written,
    );
    written += result.bytesWritten;
  }
  return position + written;
}

export async function createStoreZip(entries, outputPath, options = {}) {
  const prepared = [];
  for (const entry of entries) {
    const stat = await fs.stat(entry.path);
    if (!stat.isFile() || !stat.size)
      throw httpError("宫格图片导出失败：存在空文件", 500, "GRID_OUTPUT_EMPTY");
    prepared.push({
      ...entry,
      size: stat.size,
      crc32: await fileCrc32(entry.path),
    });
  }
  const { time, date } = dosDateTime(options.date);
  const temporaryPath = `${outputPath}.partial`;
  const handle = await fs.open(temporaryPath, "w");
  let offset = 0;
  const centralRecords = [];
  try {
    for (const entry of prepared) {
      const name = Buffer.from(entry.name, "utf8");
      const localOffset = offset;
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x0800, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(time, 10);
      header.writeUInt16LE(date, 12);
      header.writeUInt32LE(entry.crc32, 14);
      header.writeUInt32LE(entry.size, 18);
      header.writeUInt32LE(entry.size, 22);
      header.writeUInt16LE(name.length, 26);
      offset = await writeAt(handle, header, offset);
      offset = await writeAt(handle, name, offset);
      for await (const chunk of createReadStream(entry.path))
        offset = await writeAt(handle, chunk, offset);
      centralRecords.push({ ...entry, name, localOffset });
    }

    const centralOffset = offset;
    for (const entry of centralRecords) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(0x0314, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(time, 12);
      header.writeUInt16LE(date, 14);
      header.writeUInt32LE(entry.crc32, 16);
      header.writeUInt32LE(entry.size, 20);
      header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.length, 28);
      header.writeUInt32LE(entry.localOffset, 42);
      offset = await writeAt(handle, header, offset);
      offset = await writeAt(handle, entry.name, offset);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(centralRecords.length, 8);
    end.writeUInt16LE(centralRecords.length, 10);
    end.writeUInt32LE(offset - centralOffset, 12);
    end.writeUInt32LE(centralOffset, 16);
    await writeAt(handle, end, offset);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  await handle.close();
  await fs.rename(temporaryPath, outputPath);
  return outputPath;
}

function ffmpegGridArgs(inputPath, tiles) {
  const splitLabels = tiles.map((_, index) => `[tile${index}]`).join("");
  const filters = [
    `[0:v]split=${tiles.length}${splitLabels}`,
    ...tiles.map(
      (tile, index) =>
        `[tile${index}]crop=w=${tile.width}:h=${tile.height}:x=${tile.x}:y=${tile.y}:exact=1[out${index}]`,
    ),
  ].join(";");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filters,
  ];
  for (const [index, tile] of tiles.entries())
    args.push(
      "-map",
      `[out${index}]`,
      "-frames:v",
      "1",
      "-c:v",
      "png",
      tile.outputPath,
    );
  return args;
}

let activeGridSplitJobs = 0;
const gridSplitWaiters = [];

async function acquireGridSplitSlot() {
  if (activeGridSplitJobs < GRID_SPLIT_LIMITS.maxConcurrentJobs) {
    activeGridSplitJobs += 1;
    return;
  }
  if (gridSplitWaiters.length >= GRID_SPLIT_LIMITS.maxQueuedJobs)
    throw httpError(
      "宫格切分任务繁忙，请稍后重试",
      429,
      "GRID_SPLIT_BUSY",
    );
  await new Promise((resolve) => gridSplitWaiters.push(resolve));
}

function releaseGridSplitSlot() {
  const next = gridSplitWaiters.shift();
  if (next) next();
  else activeGridSplitJobs -= 1;
}

async function withGridSplitSlot(action) {
  await acquireGridSplitSlot();
  try {
    return await action();
  } finally {
    releaseGridSplitSlot();
  }
}

export function gridSplitQueueStats() {
  return {
    active: activeGridSplitJobs,
    queued: gridSplitWaiters.length,
    concurrency: GRID_SPLIT_LIMITS.maxConcurrentJobs,
    queueLimit: GRID_SPLIT_LIMITS.maxQueuedJobs,
  };
}

export async function cleanupExpiredGridSplitFiles(
  generatedDir,
  options = {},
) {
  const root = path.resolve(generatedDir);
  const now = Number(options.now) || Date.now();
  const ttlMs = Math.max(
    1,
    Number(options.ttlMs) || GRID_SPLIT_LIMITS.outputTtlMs,
  );
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch((error) => (error?.code === "ENOENT" ? [] : Promise.reject(error)));
  const removed = [];
  for (const entry of entries) {
    if (!entry.isFile() || !GRID_OUTPUT_FILE_PATTERN.test(entry.name)) continue;
    const filePath = path.join(root, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || now - stat.mtimeMs < ttlMs) continue;
    await fs.rm(filePath, { force: true });
    removed.push(entry.name);
  }
  return removed;
}

export async function splitImageGrid(input = {}, options = {}) {
  const source = input.imageData || input.imageUrl || input.source;
  const grid = normalizeGridSpec(input);
  const generatedDir = path.resolve(options.generatedDir || "data/generated");
  return withGridSplitSlot(async () => {
    await fs.mkdir(generatedDir, { recursive: true });
    await cleanupExpiredGridSplitFiles(generatedDir, {
      now: options.now,
      ttlMs: options.outputTtlMs,
    });
    const temporaryDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "commerce-canvas-grid-"),
    );
    const jobId = `grid-${randomUUID()}`;
    const tilePaths = [];
    const zipPath = path.join(generatedDir, `${jobId}.zip`);
    try {
      const loaded = await loadGridSplitSource(source, {
        generatedDir,
        temporaryDir,
      });
      const dimensions = displayedImageDimensions(loaded.buffer);
      if (!dimensions?.width || !dimensions?.height)
        throw httpError("无法读取原图像素尺寸");
      if (
        dimensions.width * dimensions.height >
        GRID_SPLIT_LIMITS.maxInputPixels
      )
        throw httpError(
          "待切分图片像素过大，长宽乘积不能超过 6400 万",
          413,
          "GRID_INPUT_PIXELS_EXCEEDED",
        );
      const tiles = gridTileRects(
        dimensions.width,
        dimensions.height,
        grid.rows,
        grid.columns,
      ).map((tile) => {
        const sequence = String(tile.index).padStart(2, "0");
        const exportName = `${sequence}-r${tile.row}-c${tile.column}.png`;
        const fileName = `${jobId}-${exportName}`;
        const outputPath = path.join(generatedDir, fileName);
        tilePaths.push(outputPath);
        return { ...tile, exportName, fileName, outputPath };
      });

      const runFfmpeg = options.execFile || execFileAsync;
      await runFfmpeg(
        options.ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg",
        ffmpegGridArgs(loaded.inputPath, tiles),
        { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
      );

      let totalOutputBytes = 0;
      for (const tile of tiles) {
        const stat = await fs.stat(tile.outputPath).catch(() => null);
        if (!stat?.isFile() || !stat.size)
          throw httpError(
            "宫格图片切分失败，请稍后重试",
            500,
            "GRID_OUTPUT_MISSING",
          );
        totalOutputBytes += stat.size;
        if (totalOutputBytes > GRID_SPLIT_LIMITS.maxOutputBytes)
          throw httpError(
            "切分结果超过 256MB，请减小原图或宫格数量",
            413,
            "GRID_OUTPUT_TOO_LARGE",
          );
      }

      await createStoreZip(
        tiles.map((tile) => ({ path: tile.outputPath, name: tile.exportName })),
        zipPath,
      );

      return {
        id: jobId,
        source: {
          type: loaded.sourceType,
          url: loaded.sourceUrl,
          mimeType: loaded.mimeType,
          width: dimensions.width,
          height: dimensions.height,
          orientation: dimensions.orientation,
        },
        grid,
        rows: grid.rows,
        columns: grid.columns,
        count: grid.count,
        tiles: tiles.map(
          ({ outputPath: _outputPath, fileName, exportName, ...tile }) => ({
            ...tile,
            name: exportName,
            url: `/generated/${encodeURIComponent(fileName)}`,
          }),
        ),
        zipUrl: `/generated/${encodeURIComponent(path.basename(zipPath))}`,
        archiveUrl: `/generated/${encodeURIComponent(path.basename(zipPath))}`,
        downloadUrl: `/generated/${encodeURIComponent(path.basename(zipPath))}`,
      };
    } catch (error) {
      await Promise.all([
        ...tilePaths.map((filePath) => fs.rm(filePath, { force: true })),
        fs.rm(zipPath, { force: true }),
        fs.rm(`${zipPath}.partial`, { force: true }),
      ]);
      throw error;
    } finally {
      await fs.rm(temporaryDir, { recursive: true, force: true });
    }
  });
}

