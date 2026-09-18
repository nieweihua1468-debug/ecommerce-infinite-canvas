import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import dotenv from "dotenv";
import { hotRankPreviewFileName } from "../server/hot-rank.js";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
dotenv.config({
  path: path.join(projectRoot, ".env.local"),
  override: false,
  quiet: true,
});

const defaults = {
  manifest: path.resolve(
    process.env.HOT_RANK_MANIFEST ||
      path.join(
        projectRoot,
        "public",
        "data",
        "hot-rank",
        "manifest.json",
      ),
  ),
  mediaRoot: path.resolve(
    process.env.HOT_RANK_MEDIA_ROOT ||
      path.join(projectRoot, "data", "hot-rank-media"),
  ),
  jobs: Math.max(
    1,
    Math.min(2, os.availableParallelism?.() || os.cpus().length),
  ),
  width: 540,
  videoBitrate: "700k",
  maxRate: "800k",
  audioBitrate: "64k",
  force: false,
  dryRun: false,
};

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${label} 必须是正整数`);
  return parsed;
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--manifest")
      options.manifest = path.resolve(argv[++index] || "");
    else if (argument === "--media-root")
      options.mediaRoot = path.resolve(argv[++index] || "");
    else if (argument === "--jobs")
      options.jobs = parsePositiveInteger(argv[++index], "--jobs");
    else if (argument === "--width") {
      options.width = parsePositiveInteger(argv[++index], "--width");
      if (options.width % 2 !== 0) throw new Error("--width 必须是偶数");
    } else if (argument === "--video-bitrate")
      options.videoBitrate = String(argv[++index] || "").trim();
    else if (argument === "--maxrate")
      options.maxRate = String(argv[++index] || "").trim();
    else if (argument === "--audio-bitrate")
      options.audioBitrate = String(argv[++index] || "").trim();
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        [
          "用法: node scripts/generate-hot-rank-previews.mjs [选项]",
          "",
          "  --manifest <path>        热点榜 manifest",
          "  --media-root <dir>       原片与预览目录",
          "  --jobs <n>               并发数（默认最多 2）",
          "  --width <px>             预览最大宽度（默认 540）",
          "  --video-bitrate <rate>   平均视频码率（默认 700k）",
          "  --maxrate <rate>         峰值视频码率（默认 800k）",
          "  --audio-bitrate <rate>   音频码率（默认 64k）",
          "  --force                  强制重新生成",
          "  --dry-run                只验证清单与原片",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else throw new Error(`未知参数: ${argument}`);
  }
  for (const [label, value] of [
    ["--video-bitrate", options.videoBitrate],
    ["--maxrate", options.maxRate],
    ["--audio-bitrate", options.audioBitrate],
  ]) {
    if (!/^\d+(?:k|M)$/i.test(value))
      throw new Error(`${label} 必须使用 700k 或 1M 形式`);
  }
  return options;
}

const temporaryPathFor = (targetPath) => {
  const extension = path.extname(targetPath) || ".mp4";
  const stem = targetPath.slice(0, -extension.length);
  return `${stem}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp${extension}`;
};

async function probeMedia(filePath) {
  const { stdout } = await execFileAsync(
    ffprobeInstaller.path,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=index,codec_type,codec_name,width,height,pix_fmt",
      "-of",
      "json",
      filePath,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const payload = JSON.parse(stdout);
  const video = payload.streams?.find((stream) => stream.codec_type === "video");
  const audio = payload.streams?.find((stream) => stream.codec_type === "audio");
  if (!video) throw new Error(`${path.basename(filePath)} 没有视频轨`);
  return {
    bytes: Number(payload.format?.size || 0),
    duration: Number(payload.format?.duration || 0),
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    videoCodec: String(video.codec_name || ""),
    pixelFormat: String(video.pix_fmt || ""),
    audioCodec: String(audio?.codec_name || ""),
  };
}

function validatePreview(source, preview, options) {
  if (preview.videoCodec !== "h264")
    throw new Error(`预览编码应为 h264，实际为 ${preview.videoCodec || "未知"}`);
  if (preview.width < 2 || preview.width > options.width || preview.width % 2)
    throw new Error(`预览宽度异常: ${preview.width}`);
  if (preview.height < 2 || preview.height % 2)
    throw new Error(`预览高度异常: ${preview.height}`);
  if (preview.pixelFormat !== "yuv420p")
    throw new Error(`预览像素格式应为 yuv420p，实际为 ${preview.pixelFormat}`);
  if (
    !Number.isFinite(preview.duration) ||
    Math.abs(preview.duration - source.duration) > 1
  )
    throw new Error(
      `预览时长与原片不一致: ${source.duration.toFixed(2)}s -> ${preview.duration.toFixed(2)}s`,
    );
  if (preview.bytes < 1) throw new Error("预览文件为空");
}

async function generatePreview(fileName, options) {
  if (path.basename(fileName) !== fileName)
    throw new Error(`非法热点榜媒体文件名: ${fileName}`);
  const sourcePath = path.join(options.mediaRoot, fileName);
  const previewName = hotRankPreviewFileName(fileName);
  const targetPath = path.join(options.mediaRoot, previewName);
  const [sourceStat, targetStat, sourceProbe] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(targetPath).catch(() => null),
    probeMedia(sourcePath),
  ]);
  if (!sourceStat.isFile() || sourceStat.size < 1)
    throw new Error(`${fileName} 原片为空`);

  if (options.dryRun)
    return {
      fileName,
      previewName,
      sourceBytes: sourceStat.size,
      bytes: targetStat?.size || 0,
      skipped: true,
      planned: true,
    };

  if (
    !options.force &&
    targetStat?.isFile() &&
    targetStat.size > 0 &&
    targetStat.mtimeMs >= sourceStat.mtimeMs
  ) {
    const previewProbe = await probeMedia(targetPath);
    validatePreview(sourceProbe, previewProbe, options);
    await fs.chmod(targetPath, 0o640);
    return {
      fileName,
      previewName,
      sourceBytes: sourceStat.size,
      bytes: targetStat.size,
      skipped: true,
    };
  }

  const temporaryPath = temporaryPathFor(targetPath);
  try {
    await execFileAsync(
      ffmpegInstaller.path,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map_metadata",
        "-1",
        "-sn",
        "-dn",
        "-vf",
        `scale=w='min(${options.width},iw)':h=-2:flags=lanczos,fps=30`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-profile:v",
        "high",
        "-level",
        "4.0",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        options.videoBitrate,
        "-maxrate",
        options.maxRate,
        "-bufsize",
        "1600k",
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-sc_threshold",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        options.audioBitrate,
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        "-threads",
        "1",
        temporaryPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const [temporaryStat, previewProbe] = await Promise.all([
      fs.stat(temporaryPath),
      probeMedia(temporaryPath),
    ]);
    validatePreview(sourceProbe, previewProbe, options);
    await fs.rename(temporaryPath, targetPath);
    await fs.chmod(targetPath, 0o640);
    return {
      fileName,
      previewName,
      sourceBytes: sourceStat.size,
      bytes: temporaryStat.size,
      skipped: false,
    };
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { ok: true, ...(await worker(items[index])) };
      } catch (error) {
        results[index] = { ok: false, fileName: items[index], error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(await fs.readFile(options.manifest, "utf8"));
const fileNames = [
  ...new Set(
    (Array.isArray(manifest.items) ? manifest.items : [])
      .map((item) => String(item?.local_file_name || "").trim())
      .filter(Boolean),
  ),
];
if (!fileNames.length) throw new Error("manifest 中没有可生成预览的原片");
const results = await mapConcurrent(fileNames, options.jobs, (fileName) =>
  generatePreview(fileName, options),
);
const failures = results.filter((result) => !result.ok);
const succeeded = results.filter((result) => result.ok);
const sourceBytes = succeeded.reduce(
  (sum, result) => sum + result.sourceBytes,
  0,
);
const previewBytes = succeeded.reduce((sum, result) => sum + result.bytes, 0);
const mode = options.dryRun ? "预检" : "预览生成";
process.stdout.write(
  `${mode} ${succeeded.length}/${fileNames.length}，新生成 ${
    options.dryRun ? 0 : succeeded.filter((result) => !result.skipped).length
  }，原片 ${(sourceBytes / 1024 / 1024).toFixed(2)} MiB，预览 ${(
    previewBytes /
    1024 /
    1024
  ).toFixed(2)} MiB${
    previewBytes > 0
      ? `，节省 ${Math.max(0, 100 - (previewBytes / sourceBytes) * 100).toFixed(1)}%`
      : ""
  }\n`,
);
for (const failure of failures)
  process.stderr.write(
    `${failure.fileName}: ${failure.error?.message || failure.error}\n`,
  );
if (failures.length) process.exitCode = 1;

