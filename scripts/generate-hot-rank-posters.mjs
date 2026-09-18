import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import dotenv from "dotenv";
import { hotRankPosterFileName } from "../server/hot-rank.js";

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
  jobs: Math.max(1, Math.min(4, os.availableParallelism?.() || os.cpus().length)),
  force: false,
  ifMediaRootPresent: false,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--if-media-root-present")
      options.ifMediaRootPresent = true;
    else if (argument === "--manifest")
      options.manifest = path.resolve(argv[++index] || "");
    else if (argument === "--media-root")
      options.mediaRoot = path.resolve(argv[++index] || "");
    else if (argument === "--jobs") {
      options.jobs = Number.parseInt(argv[++index], 10);
      if (!Number.isSafeInteger(options.jobs) || options.jobs < 1)
        throw new Error("--jobs 必须是正整数");
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        [
          "用法: node scripts/generate-hot-rank-posters.mjs [选项]",
          "",
          "  --manifest <path>   热点榜 manifest",
          "  --media-root <dir>  原片与封面目录",
          "  --jobs <n>          并发数（默认最多 4）",
          "  --force             强制重新生成",
          "  --if-media-root-present  媒体目录缺失时跳过（供源码构建使用）",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else throw new Error(`未知参数: ${argument}`);
  }
  return options;
}

const temporaryPathFor = (targetPath) =>
  `${targetPath}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp.jpg`;

async function generatePoster(fileName, options) {
  if (path.basename(fileName) !== fileName)
    throw new Error(`非法热点榜媒体文件名: ${fileName}`);
  const sourcePath = path.join(options.mediaRoot, fileName);
  const posterName = hotRankPosterFileName(fileName);
  const targetPath = path.join(options.mediaRoot, posterName);
  const [sourceStat, targetStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(targetPath).catch(() => null),
  ]);
  if (
    !options.force &&
    targetStat?.isFile() &&
    targetStat.size > 0 &&
    targetStat.mtimeMs >= sourceStat.mtimeMs
  ) {
    await fs.chmod(targetPath, 0o640);
    return { fileName, posterName, bytes: targetStat.size, skipped: true };
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
        "-ss",
        "1",
        "-i",
        sourcePath,
        "-map_metadata",
        "-1",
        "-vf",
        "scale=480:-2:flags=lanczos",
        "-frames:v",
        "1",
        "-threads",
        "1",
        "-q:v",
        "4",
        temporaryPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    const stat = await fs.stat(temporaryPath);
    if (!stat.isFile() || stat.size < 1)
      throw new Error(`${fileName} 封面生成为空`);
    await fs.rename(temporaryPath, targetPath);
    await fs.chmod(targetPath, 0o640);
    return { fileName, posterName, bytes: stat.size, skipped: false };
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
const mediaRootStat = await fs.stat(options.mediaRoot).catch((error) => {
  if (error?.code === "ENOENT") return null;
  throw error;
});
if (!mediaRootStat) {
  if (options.ifMediaRootPresent) {
    process.stdout.write(
      `热点视频封面 0/0，跳过：运行媒体目录未随源码分发\n`,
    );
    process.exit(0);
  }
  throw new Error(`热点榜媒体目录不存在: ${options.mediaRoot}`);
}
if (!mediaRootStat.isDirectory())
  throw new Error(`热点榜媒体路径不是目录: ${options.mediaRoot}`);
const manifest = JSON.parse(await fs.readFile(options.manifest, "utf8"));
const fileNames = [
  ...new Set(
    (Array.isArray(manifest.items) ? manifest.items : [])
      .map((item) => String(item?.local_file_name || "").trim())
      .filter(Boolean),
  ),
];
if (!fileNames.length) throw new Error("manifest 中没有可生成封面的原片");
const results = await mapConcurrent(fileNames, options.jobs, (fileName) =>
  generatePoster(fileName, options),
);
const failures = results.filter((result) => !result.ok);
const succeeded = results.filter((result) => result.ok);
const totalBytes = succeeded.reduce((sum, result) => sum + result.bytes, 0);
process.stdout.write(
  `热点视频封面 ${succeeded.length}/${fileNames.length}，新生成 ${
    succeeded.filter((result) => !result.skipped).length
  }，总体积 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB\n`,
);
for (const failure of failures)
  process.stderr.write(`${failure.fileName}: ${failure.error?.message || failure.error}\n`);
if (failures.length) process.exitCode = 1;

