import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const sourceDir = path.join(
  projectRoot,
  "data",
  "inspiration-assets",
  "library",
);
const outputDir = path.join(
  projectRoot,
  "data",
  "inspiration-assets",
  "thumbnails",
);
const coverPattern = /-cover\.(?:jpe?g|png|webp)$/i;
const ffmpegPath = ffmpegInstaller.path;

const defaults = {
  jobs: Math.max(1, Math.min(8, os.availableParallelism?.() || os.cpus().length)),
  maxEdge: 960,
  targetBytes: 200 * 1024,
  force: false,
};

function parsePositiveInteger(value, flag) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${flag} 必须是正整数`);
  }
  return number;
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") {
      options.force = true;
    } else if (argument === "--jobs") {
      options.jobs = parsePositiveInteger(argv[++index], "--jobs");
    } else if (argument === "--max-edge") {
      options.maxEdge = parsePositiveInteger(argv[++index], "--max-edge");
    } else if (argument === "--target-kb") {
      options.targetBytes = parsePositiveInteger(argv[++index], "--target-kb") * 1024;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        [
          "用法: node scripts/generate-inspiration-thumbnails.mjs [选项]",
          "",
          "  --jobs <n>       并发 FFmpeg 进程数（默认最多 8）",
          "  --max-edge <px>  首选最长边（默认 960）",
          "  --target-kb <n>  单张目标上限（默认 200KB）",
          "  --force          强制重新生成所有缩略图",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${argument}`);
    }
  }
  return options;
}

async function supportsWebp() {
  const { stdout = "", stderr = "" } = await execFileAsync(
    ffmpegPath,
    ["-hide_banner", "-encoders"],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return /\blibwebp(?:_anim)?\b/.test(`${stdout}\n${stderr}`);
}

function buildAttempts(maxEdge, useWebp) {
  const dimensions = [
    maxEdge,
    Math.min(maxEdge, 864),
    Math.min(maxEdge, 768),
    Math.min(maxEdge, 720),
    Math.min(maxEdge, 640),
  ].filter((value, index, values) => value >= 320 && values.indexOf(value) === index);

  if (useWebp) {
    return [
      { edge: dimensions[0], quality: 74 },
      { edge: dimensions[0], quality: 64 },
      { edge: dimensions[0], quality: 54 },
      { edge: dimensions[1] ?? dimensions[0], quality: 58 },
      { edge: dimensions[2] ?? dimensions.at(-1), quality: 52 },
      { edge: dimensions[3] ?? dimensions.at(-1), quality: 46 },
      { edge: dimensions[4] ?? dimensions.at(-1), quality: 40 },
    ].filter(
      (attempt, index, attempts) =>
        attempts.findIndex(
          (candidate) =>
            candidate.edge === attempt.edge && candidate.quality === attempt.quality,
        ) === index,
    );
  }

  return [
    { edge: dimensions[0], quality: 3 },
    { edge: dimensions[0], quality: 5 },
    { edge: dimensions[1] ?? dimensions[0], quality: 5 },
    { edge: dimensions[2] ?? dimensions.at(-1), quality: 6 },
    { edge: dimensions[3] ?? dimensions.at(-1), quality: 7 },
    { edge: dimensions[4] ?? dimensions.at(-1), quality: 8 },
  ].filter(
    (attempt, index, attempts) =>
      attempts.findIndex(
        (candidate) =>
          candidate.edge === attempt.edge && candidate.quality === attempt.quality,
      ) === index,
  );
}

function outputPathFor(sourceName, useWebp) {
  const basename = sourceName.slice(0, -path.extname(sourceName).length);
  return path.join(outputDir, `${basename}.${useWebp ? "webp" : "jpg"}`);
}

function temporaryPathFor(targetPath) {
  const extension = path.extname(targetPath);
  const basename = path.basename(targetPath, extension);
  const nonce = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  return path.join(outputDir, `.${basename}.${nonce}${extension}`);
}

async function runFfmpeg(inputPath, outputPath, attempt, useWebp) {
  const scale = `scale=${attempt.edge}:${attempt.edge}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
  const codecArgs = useWebp
    ? [
        "-c:v",
        "libwebp",
        "-preset",
        "picture",
        "-quality",
        "good",
        "-compression_level",
        "4",
        "-q:v",
        String(attempt.quality),
      ]
    : ["-c:v", "mjpeg", "-q:v", String(attempt.quality)];

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vf",
      scale,
      "-frames:v",
      "1",
      "-threads",
      "1",
      ...codecArgs,
      outputPath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}

async function canSkip(inputPath, targetPath, targetBytes, force) {
  if (force) return null;
  const [inputStat, outputStat] = await Promise.all([
    fs.stat(inputPath),
    fs.stat(targetPath).catch(() => null),
  ]);
  if (
    outputStat?.isFile() &&
    outputStat.size > 0 &&
    outputStat.size <= targetBytes &&
    outputStat.mtimeMs >= inputStat.mtimeMs
  ) {
    return outputStat;
  }
  return null;
}

async function generateOne(sourceName, options, useWebp) {
  const inputPath = path.join(sourceDir, sourceName);
  const targetPath = outputPathFor(sourceName, useWebp);
  const existing = await canSkip(
    inputPath,
    targetPath,
    options.targetBytes,
    options.force,
  );
  if (existing) {
    return {
      sourceName,
      targetPath,
      bytes: existing.size,
      skipped: true,
      edge: null,
      quality: null,
    };
  }

  const attempts = buildAttempts(options.maxEdge, useWebp);
  let smallest = null;
  let lastError = null;

  for (const attempt of attempts) {
    const temporaryPath = temporaryPathFor(targetPath);
    try {
      await runFfmpeg(inputPath, temporaryPath, attempt, useWebp);
      const stat = await fs.stat(temporaryPath);
      if (!smallest || stat.size < smallest.bytes) {
        if (smallest) await fs.rm(smallest.path, { force: true });
        smallest = { path: temporaryPath, bytes: stat.size, attempt };
      } else {
        await fs.rm(temporaryPath, { force: true });
      }

      if (stat.size <= options.targetBytes) {
        await fs.rename(smallest.path, targetPath);
        return {
          sourceName,
          targetPath,
          bytes: stat.size,
          skipped: false,
          edge: attempt.edge,
          quality: attempt.quality,
        };
      }
    } catch (error) {
      lastError = error;
      await fs.rm(temporaryPath, { force: true });
    }
  }

  if (smallest) {
    await fs.rm(smallest.path, { force: true });
    throw new Error(
      `最小结果 ${(smallest.bytes / 1024).toFixed(1)}KB 仍超过 ${(
        options.targetBytes / 1024
      ).toFixed(0)}KB`,
    );
  }
  throw new Error(lastError?.stderr?.trim() || lastError?.message || "FFmpeg 未产生输出");
}

async function mapConcurrent(items, concurrency, worker, onSettled) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
      onSettled?.(results[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, consume),
  );
  return results;
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * fraction) - 1),
  );
  return sortedValues[index];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const useWebp = await supportsWebp();
  await fs.mkdir(outputDir, { recursive: true });

  const sourceNames = (await fs.readdir(sourceDir))
    .filter((name) => coverPattern.test(name))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  if (!sourceNames.length) {
    throw new Error(`未找到封面: ${sourceDir}/*-cover.*`);
  }

  process.stdout.write(
    `开始处理 ${sourceNames.length} 张封面；格式=${
      useWebp ? "WebP" : "JPEG（FFmpeg 无 libwebp）"
    }，并发=${options.jobs}，目标<=${(options.targetBytes / 1024).toFixed(0)}KB\n`,
  );

  let completed = 0;
  const results = await mapConcurrent(
    sourceNames,
    options.jobs,
    (sourceName) => generateOne(sourceName, options, useWebp),
    () => {
      completed += 1;
      if (completed % 50 === 0 || completed === sourceNames.length) {
        process.stdout.write(`进度 ${completed}/${sourceNames.length}\n`);
      }
    },
  );

  const succeeded = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failed = results
    .map((result, index) => ({ result, sourceName: sourceNames[index] }))
    .filter(({ result }) => result.status === "rejected");
  const sizes = succeeded.map((item) => item.bytes).sort((left, right) => left - right);
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const totalBytes = sizes.reduce((total, size) => total + size, 0);
  const generated = succeeded.filter((item) => !item.skipped).length;
  const skipped = succeeded.length - generated;
  const belowPreferredEdge = succeeded.filter(
    (item) => item.edge && item.edge < options.maxEdge,
  ).length;

  process.stdout.write(
    [
      "",
      "缩略图生成完成",
      `  成功: ${succeeded.length}/${sourceNames.length}（新生成 ${generated}，幂等跳过 ${skipped}）`,
      `  格式: ${useWebp ? "WebP" : "JPEG"}`,
      `  总体积: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`,
      `  最大: ${(Math.max(...sizes, 0) / 1024).toFixed(1)} KiB`,
      `  P95: ${(percentile(sizes, 0.95) / 1024).toFixed(1)} KiB`,
      `  低于首选 ${options.maxEdge}px 的封面: ${belowPreferredEdge}`,
      `  耗时: ${elapsedSeconds.toFixed(2)}s`,
      `  输出: ${outputDir}`,
      `  失败: ${failed.length}`,
      "",
    ].join("\n"),
  );

  for (const { sourceName, result } of failed) {
    process.stderr.write(
      `[失败] ${sourceName}: ${result.reason?.message || String(result.reason)}\n`,
    );
  }
  if (failed.length) process.exitCode = 1;
}

await main().catch((error) => {
  process.stderr.write(`缩略图生成失败: ${error.message}\n`);
  process.exitCode = 1;
});

