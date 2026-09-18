import { spawnSync } from "node:child_process";
import {
  access,
  constants,
  lstat,
  readFile,
  readdir,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { auditDataTree, dataAuditDetail } from "./data-security.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const results = [];

const record = (name, ok, detail) => results.push({ name, ok, detail });
const value = (name) => String(process.env[name] || "").trim();
const configured = (name) => {
  const current = value(name);
  return Boolean(current) && !/^(replace_with|your_|example|change_me)/i.test(current);
};
const configuredUrl = (name, { https = false } = {}) => {
  if (!configured(name)) return false;
  try {
    const parsed = new URL(value(name));
    return https ? parsed.protocol === "https:" : ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};
const modeText = (mode) => `0${(mode & 0o777).toString(8)}`;

try {
  await access(envPath, constants.R_OK);
  dotenv.config({ path: envPath, override: true, quiet: true });
  const envStat = await stat(envPath);
  const privateMode = (envStat.mode & 0o077) === 0;
  record(
    "environment",
    privateMode,
    privateMode
      ? `.env.local 可读取且权限为 ${modeText(envStat.mode)}`
      : `.env.local 权限为 ${modeText(envStat.mode)}，必须移除组/其他用户权限（建议 0600）`,
  );
} catch {
  record("environment", false, "缺少可读取的 .env.local");
}

const adminPassword = value("ADMIN_PASSWORD");
const sessionSecret = value("ADMIN_SESSION_SECRET");
record(
  "admin credentials",
  configured("ADMIN_USERNAME") && configured("ADMIN_PASSWORD") && adminPassword.length >= 12,
  "管理员账号已配置，密码至少 12 位",
);
record(
  "session secret",
  configured("ADMIN_SESSION_SECRET") && sessionSecret.length >= 32,
  "ADMIN_SESSION_SECRET 至少 32 位且不是示例值",
);

let publicBaseUrlValid = false;
try {
  const publicBaseUrl = new URL(value("PUBLIC_BASE_URL"));
  publicBaseUrlValid =
    publicBaseUrl.protocol === "https:" &&
    !publicBaseUrl.username &&
    !publicBaseUrl.password;
} catch {}
record("public URL", publicBaseUrlValid, "PUBLIC_BASE_URL 必须是无账号信息的 HTTPS 地址");

const klingReady =
  configuredUrl("KLING_BASE_URL") &&
  configured("KLING_ACCESS_KEY") &&
  configured("KLING_SECRET_KEY");
const volcengineTouched = [
  "VOLCENGINE_ACCOUNT_ID",
  "VOLCENGINE_ACCESS_KEY_ID",
  "VOLCENGINE_SECRET_ACCESS_KEY",
  "VOLCENGINE_ENDPOINT_ID",
  "VOLCENGINE_STANDARD_ENDPOINT_ID",
  "VOLCENGINE_FAST_ENDPOINT_ID",
  "VOLCENGINE_ARK_API_KEY",
].some(configured);
const volcengineEndpointReady = [
  "VOLCENGINE_ENDPOINT_ID",
  "VOLCENGINE_STANDARD_ENDPOINT_ID",
  "VOLCENGINE_FAST_ENDPOINT_ID",
].some(configured);
const volcengineCredentialReady =
  configured("VOLCENGINE_ARK_API_KEY") ||
  (configured("VOLCENGINE_ACCESS_KEY_ID") && configured("VOLCENGINE_SECRET_ACCESS_KEY"));
const volcengineReady =
  configuredUrl("VOLCENGINE_ARK_BASE_URL") &&
  volcengineEndpointReady &&
  volcengineCredentialReady;
record(
  "video provider",
  klingReady || volcengineReady,
  `Kling=${klingReady ? "configured" : "missing"}；Volcengine=${volcengineReady ? "configured" : "missing"}`,
);
record(
  "Volcengine callback",
  !volcengineTouched || configured("VOLCENGINE_CALLBACK_SECRET"),
  volcengineTouched
    ? "配置 Volcengine 时必须设置独立的 VOLCENGINE_CALLBACK_SECRET"
    : "未启用 Volcengine，无需回调密钥",
);

const image2Enabled = !/^(0|false|no|off)$/i.test(value("IMAGE2_ENABLED"));
const image2Ready =
  image2Enabled &&
  configuredUrl("IMAGE2_BASE_URL") &&
  configured("IMAGE2_API_KEY") &&
  configured("IMAGE2_MODEL");
const vapeurBaseReady =
  configuredUrl("VAPEUR_BASE_URL") && configured("VAPEUR_API_KEY");
const vapeurImageReady = vapeurBaseReady && configured("VAPEUR_IMAGE_MODEL");
record(
  "image provider",
  image2Ready || vapeurImageReady,
  `Image2=${image2Ready ? "configured" : "missing"}；Vapeur image=${vapeurImageReady ? "configured" : "missing"}`,
);

const deepSeekReady =
  configuredUrl("DEEPSEEK_BASE_URL") &&
  configured("DEEPSEEK_API_KEY") &&
  configured("DEEPSEEK_MODEL");
const vapeurTextReady = vapeurBaseReady && configured("VAPEUR_TEXT_MODEL");
record(
  "text provider",
  deepSeekReady || vapeurTextReady,
  `DeepSeek=${deepSeekReady ? "configured" : "missing"}；Vapeur text=${vapeurTextReady ? "configured" : "missing"}`,
);

const miniMaxReady = configured("MINIMAX_API_KEY");
record(
  "MiniMax audio/video provider",
  miniMaxReady,
  `MiniMax=${miniMaxReady ? "configured" : "missing"}`,
);

const mcpOrigins = value("MCP_ALLOWED_ORIGINS")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const validMcpOrigins =
  mcpOrigins.length > 0 &&
  mcpOrigins.every((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "https:" && parsed.origin === origin;
    } catch {
      return false;
    }
  });
record(
  "MCP origins",
  validMcpOrigins,
  "MCP_ALLOWED_ORIGINS 必须列出一个或多个逗号分隔的 HTTPS Origin，禁止通配符和路径",
);

record(
  "single instance storage",
  value("APP_INSTANCE_COUNT") === "1",
  "JSON 文件存储只支持 APP_INSTANCE_COUNT=1；多实例上线前必须迁移数据库",
);

let packageJson = null;
let releaseJson = null;
try {
  packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  releaseJson = JSON.parse(await readFile(path.join(root, "release.json"), "utf8"));
  const buildText = String(releaseJson.build || "");
  const buildDateText = buildText.slice(0, 8);
  const buildDate = /^\d{10}$/.test(buildText)
    ? new Date(`${buildDateText.slice(0, 4)}-${buildDateText.slice(4, 6)}-${buildDateText.slice(6, 8)}T00:00:00Z`)
    : null;
  const validBuildDate =
    buildDate &&
    Number.isFinite(buildDate.getTime()) &&
    buildDate.toISOString().slice(0, 10).replaceAll("-", "") === buildDateText &&
    buildDate.getTime() <= Date.now() + 24 * 60 * 60_000;
  const validRelease =
    Boolean(releaseJson.version && releaseJson.label) &&
    releaseJson.version === packageJson.version &&
    validBuildDate;
  record(
    "release metadata",
    validRelease,
    validRelease
      ? `v${releaseJson.version} build ${releaseJson.build}`
      : "release.json 版本必须与 package.json 一致，build 必须为非未来的 YYYYMMDDNN",
  );
} catch {
  record("release metadata", false, "package.json 或 release.json 不是有效 JSON");
}

const latestMtime = async (entryPath) => {
  const entry = await lstat(entryPath);
  if (entry.isSymbolicLink()) return 0;
  if (!entry.isDirectory()) return entry.mtimeMs;
  const children = await readdir(entryPath, { withFileTypes: true });
  const childTimes = await Promise.all(
    children
      .filter((child) => !child.isSymbolicLink())
      .map((child) => latestMtime(path.join(entryPath, child.name))),
  );
  // Directory mtimes change when a release archive is extracted or when a
  // staging tree is synchronized, even if every build input is unchanged.
  // Freshness must therefore be based on file contents, not container dirs.
  return Math.max(...childTimes, 0);
};

try {
  const buildInputs = [
    "src",
    "public",
    "index.html",
    "admin.html",
    "vite.config.js",
    "package.json",
    "package-lock.json",
    "release.json",
  ];
  const inputTimes = await Promise.all(
    buildInputs.map((relativePath) => latestMtime(path.join(root, relativePath))),
  );
  const distTimes = await Promise.all(
    ["dist/index.html", "dist/admin.html"].map((relativePath) =>
      latestMtime(path.join(root, relativePath)),
    ),
  );
  const newestInput = Math.max(...inputTimes);
  const oldestEntry = Math.min(...distTimes);
  record(
    "dist freshness",
    oldestEntry >= newestInput,
    oldestEntry >= newestInput
      ? "dist/index.html 与 dist/admin.html 新于全部构建输入"
      : "dist 已过期，请运行 npm run build",
  );
} catch {
  record("dist freshness", false, "dist 缺失或无法读取，请运行 npm run build");
}

try {
  const publicRoot = path.join(root, "public");
  const configuredManifestPath = value("HOT_RANK_MANIFEST");
  const publicManifestPath = configuredManifestPath
    ? path.resolve(configuredManifestPath)
    : path.join(
        publicRoot,
        "data",
        "hot-rank",
        "manifest.json",
      );
  const manifestRelativePath = path.relative(publicRoot, publicManifestPath);
  if (
    !manifestRelativePath ||
    manifestRelativePath === ".." ||
    manifestRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(manifestRelativePath)
  )
    throw new Error("HOT_RANK_MANIFEST 必须位于 public 目录内");
  const [publicText, distText] = await Promise.all([
    readFile(publicManifestPath, "utf8"),
    readFile(path.join(root, "dist", manifestRelativePath), "utf8"),
  ]);
  const publicManifest = JSON.parse(publicText);
  const distManifest = JSON.parse(distText);
  const files = (Array.isArray(publicManifest.items)
    ? publicManifest.items
    : []
  )
    .map((item) => String(item?.local_file_name || "").trim())
    .filter(Boolean);
  const distinctFiles = new Set(files);
  const mediaStats = await Promise.all(
    [...distinctFiles].map((fileName) => {
      if (path.basename(fileName) !== fileName)
        throw new Error(`非法热点榜媒体文件名：${fileName}`);
      return lstat(path.join(root, "data", "hot-rank-media", fileName));
    }),
  );
  const valid =
    publicText === distText &&
    publicManifest.total === 20 &&
    publicManifest.items?.length === 20 &&
    distManifest.items?.length === 20 &&
    distinctFiles.size === 20 &&
    mediaStats.every((entry) => entry.isFile() && !entry.isSymbolicLink());
  record(
    "hot-rank bundle",
    valid,
    valid
      ? "public/dist 热点榜清单一致，20 个原片均存在"
      : "热点榜清单必须在 public/dist 一致，且包含 20 个不同的本地原片",
  );
} catch (error) {
  record(
    "hot-rank bundle",
    false,
    `热点榜发布资源不完整：${error.code || error.message || error.name}`,
  );
}

try {
  const publicDataRoot = path.join(root, "public", "data");
  const collectJson = async (directory, prefix = "") => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        throw new Error(`public/data 禁止符号链接：${path.join(prefix, entry.name)}`);
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory())
        files.push(...(await collectJson(path.join(directory, entry.name), relative)));
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(relative);
    }
    return files;
  };
  const jsonFiles = await collectJson(publicDataRoot);
  const invalid = [];
  const mismatched = [];
  for (const relative of jsonFiles) {
    const [publicText, distText] = await Promise.all([
      readFile(path.join(publicDataRoot, relative), "utf8"),
      readFile(path.join(root, "dist", "data", relative), "utf8"),
    ]);
    try {
      JSON.parse(publicText);
      JSON.parse(distText);
    } catch {
      invalid.push(relative);
    }
    if (publicText !== distText) mismatched.push(relative);
  }
  record(
    "public data bundle",
    jsonFiles.length > 0 && invalid.length === 0 && mismatched.length === 0,
    invalid.length || mismatched.length
      ? `无效 JSON：${invalid.join(", ") || "无"}；public/dist 不一致：${mismatched.join(", ") || "无"}`
      : `${jsonFiles.length} 个 public/data JSON 均可解析且已进入 dist`,
  );
} catch (error) {
  record(
    "public data bundle",
    false,
    `public/data 发布资源不完整：${error.code || error.message || error.name}`,
  );
}

for (const [name, envName] of [
  ["ffmpeg", "FFMPEG_PATH"],
  ["ffprobe", "FFPROBE_PATH"],
]) {
  const executable = value(envName) || name;
  const probe = spawnSync(executable, ["-version"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  record(name, probe.status === 0, `${envName || name} 必须指向可执行文件`);
}

const dataRoot = path.join(root, "data");
try {
  const audit = await auditDataTree(dataRoot);
  record("data recursive security", audit.ok, dataAuditDetail(audit));
} catch (error) {
  record(
    "data recursive security",
    false,
    `data 递归安全检查失败：${error.code || error.name || "Error"}`,
  );
}

try {
  const generated = await lstat(path.join(dataRoot, "generated"));
  record(
    "data/generated directory",
    generated.isDirectory() && !generated.isSymbolicLink(),
    generated.isDirectory() && !generated.isSymbolicLink()
      ? "data/generated 是真实目录"
      : "data/generated 必须是非符号链接的真实目录",
  );
} catch {
  record("data/generated directory", false, "缺少 data/generated 目录");
}

try {
  const entries = await readdir(dataRoot, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const invalid = [];
  const insecure = [];
  for (const entry of jsonFiles) {
    const filePath = path.join(dataRoot, entry.name);
    try {
      JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      invalid.push(entry.name);
    }
    const fileStat = await stat(filePath);
    if ((fileStat.mode & 0o007) !== 0) insecure.push(`${entry.name}(${modeText(fileStat.mode)})`);
  }
  record(
    "data JSON parse",
    invalid.length === 0,
    invalid.length ? `无效 JSON：${invalid.join(", ")}` : `${jsonFiles.length} 个 JSON 文件均可解析`,
  );
  record(
    "data JSON permissions",
    insecure.length === 0,
    insecure.length
      ? `以下文件向其他用户开放：${insecure.join(", ")}；建议 0640 或 0600`
      : `${jsonFiles.length} 个 JSON 文件均未向其他用户开放`,
  );
} catch {
  record("data JSON parse", false, "data 目录无法枚举");
  record("data JSON permissions", false, "data JSON 权限无法检查");
}

try {
  const disk = await statfs(dataRoot);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  const freeMb = Math.floor(freeBytes / (1024 * 1024));
  const minimumMb = Math.max(256, Number.parseInt(value("MIN_FREE_DISK_MB"), 10) || 1024);
  record(
    "free disk",
    freeMb >= minimumMb,
    `data 所在磁盘可用 ${freeMb}MB，最低要求 ${minimumMb}MB`,
  );
} catch {
  record("free disk", false, "无法读取 data 所在磁盘可用空间");
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}: ${result.detail}`);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;

