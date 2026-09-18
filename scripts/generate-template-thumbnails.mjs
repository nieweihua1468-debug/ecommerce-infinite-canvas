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
const sourceRoot = path.join(projectRoot, "public", "template-covers");
const outputRoot = path.join(projectRoot, "public", "template-thumbnails");
const sourceDirectories = ["outfit-generated", "detail-social", "custom-brand-current"];
const imagePattern = /\.(?:jpe?g|png|webp)$/i;
const targetBytes = 200 * 1024;
const concurrency = Math.max(
  1,
  Math.min(6, os.availableParallelism?.() || os.cpus().length),
);

const attempts = [
  { edge: 960, quality: 3 },
  { edge: 960, quality: 5 },
  { edge: 864, quality: 5 },
  { edge: 768, quality: 6 },
  { edge: 640, quality: 8 },
];

async function thumbnailJobs() {
  const jobs = [];
  for (const directory of sourceDirectories) {
    const sourceDirectory = path.join(sourceRoot, directory);
    const names = await fs.readdir(sourceDirectory).catch(() => []);
    for (const name of names.filter((entry) => imagePattern.test(entry))) {
      const baseName = name.slice(0, -path.extname(name).length);
      jobs.push({
        source: path.join(sourceDirectory, name),
        output: path.join(outputRoot, directory, `${baseName}.jpg`),
      });
    }
  }
  return jobs;
}

async function generate(job) {
  const [sourceStat, outputStat] = await Promise.all([
    fs.stat(job.source),
    fs.stat(job.output).catch(() => null),
  ]);
  if (
    outputStat?.isFile() &&
    outputStat.size > 0 &&
    outputStat.size <= targetBytes &&
    outputStat.mtimeMs >= sourceStat.mtimeMs
  ) {
    return { skipped: true, bytes: outputStat.size };
  }

  await fs.mkdir(path.dirname(job.output), { recursive: true });
  let smallest = null;
  for (const attempt of attempts) {
    const temporary = `${job.output}.${process.pid}-${Math.random()
      .toString(36)
      .slice(2)}.tmp.jpg`;
    try {
      await execFileAsync(
        ffmpegInstaller.path,
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          job.source,
          "-map_metadata",
          "-1",
          "-vf",
          `scale=${attempt.edge}:${attempt.edge}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
          "-frames:v",
          "1",
          "-threads",
          "1",
          "-q:v",
          String(attempt.quality),
          temporary,
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      );
      const stat = await fs.stat(temporary);
      if (!smallest || stat.size < smallest.bytes) {
        if (smallest) await fs.rm(smallest.path, { force: true });
        smallest = { path: temporary, bytes: stat.size };
      } else {
        await fs.rm(temporary, { force: true });
      }
      if (stat.size <= targetBytes) {
        await fs.rename(smallest.path, job.output);
        return { skipped: false, bytes: stat.size };
      }
    } catch (error) {
      await fs.rm(temporary, { force: true });
      if (!smallest && attempt === attempts.at(-1)) throw error;
    }
  }
  if (smallest) await fs.rm(smallest.path, { force: true });
  throw new Error(`${path.basename(job.source)} 无法压缩到 200KB 以内`);
}

async function mapConcurrent(items, worker) {
  const results = [];
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { ok: true, ...(await worker(items[index])) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, consume),
  );
  return results;
}

const jobs = await thumbnailJobs();
const results = await mapConcurrent(jobs, generate);
const succeeded = results.filter((result) => result.ok);
const failures = results.filter((result) => !result.ok);
const totalBytes = succeeded.reduce((total, result) => total + result.bytes, 0);
process.stdout.write(
  `模版缩略图 ${succeeded.length}/${jobs.length}，新生成 ${
    succeeded.filter((result) => !result.skipped).length
  }，总体积 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB\n`,
);
for (const failure of failures)
  process.stderr.write(`${failure.error?.message || failure.error}\n`);
if (failures.length) process.exitCode = 1;

