#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  chown,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const REQUIRED_PROJECT_FILES = ["package.json", "release.json", "server/index.js"];
const FIXED_ARTIFACTS = new Set([
  "code.tar.gz",
  "node_modules.tar.gz",
  "data-json.tar.gz",
  "data-full.tar.gz",
  "environment.env",
  "snapshot.json",
]);
export const CODE_EXCLUDES = Object.freeze([
  "./data",
  "./.env",
  "./.env.*",
  "./node_modules",
  "./.git",
  "./backups",
  "./work",
  "./.playwright-cli",
  "./playwright-report",
  "./test-results",
  "./coverage",
  "./.cache",
  "./tmp",
  "./logs",
]);

const rootEntryExcluded = (name) =>
  CODE_EXCLUDES.some((entry) => {
    const pattern = entry.slice(2);
    return pattern.endsWith("*")
      ? String(name).startsWith(pattern.slice(0, -1))
      : String(name) === pattern;
  });

export const codeArchiveEntries = (entries) =>
  Array.from(entries || [])
    .filter((name) => !rootEntryExcluded(name))
    .toSorted();

export const codeArchiveArgs = (archivePath, projectRoot, entries) => [
  "-czf",
  archivePath,
  "-C",
  projectRoot,
  ...(entries?.length ? entries : ["--files-from", "/dev/null"]),
];

const usage = () => {
  console.log(`Usage:
  node deploy/release-snapshot.mjs snapshot \\
    --project-root /opt/commerce-canvas \\
    --backup-root /var/backups/commerce-canvas-releases \\
    --snapshot-id pre-2026080401 [--data-scope json|full] [--apply]

  node deploy/release-snapshot.mjs restore \\
    --project-root /opt/commerce-canvas \\
    --backup-root /var/backups/commerce-canvas-releases \\
    --snapshot-id pre-2026080401 \\
    [--restore-data --confirm-data-replace] [--restore-env] \\
    [--apply --confirm-service-stopped]

Default mode is dry-run. Snapshot archives code, runtime dependencies, data and
.env.local separately. Restore leaves data and .env.local untouched unless the
corresponding explicit flags are supplied.`);
};

export function validateSnapshotId(value) {
  const snapshotId = String(value || "").trim();
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId) || snapshotId.includes("..")) {
    throw new Error("--snapshot-id 仅允许 1-80 位字母、数字、点、下划线和短横线，且禁止 ..");
  }
  return snapshotId;
}

export function assertSeparatedRoots(projectRoot, backupRoot) {
  const project = path.resolve(projectRoot);
  const backup = path.resolve(backupRoot);
  const inside = (parent, child) =>
    child === parent || child.startsWith(`${parent}${path.sep}`);
  if (project === path.parse(project).root || backup === path.parse(backup).root) {
    throw new Error("项目目录和备份目录都不能是文件系统根目录");
  }
  if (inside(project, backup) || inside(backup, project)) {
    throw new Error("项目目录和备份目录必须彼此独立，禁止嵌套");
  }
  return { project, backup };
}

export function snapshotDirectory(backupRoot, snapshotId) {
  const root = path.resolve(backupRoot);
  const target = path.resolve(root, validateSnapshotId(snapshotId));
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("快照目录越界");
  }
  return target;
}

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  if (!["snapshot", "restore"].includes(command)) {
    usage();
    throw new Error("首个参数必须是 snapshot 或 restore");
  }
  const options = {
    command,
    apply: false,
    dataScope: "json",
    restoreData: false,
    restoreEnv: false,
    confirmServiceStopped: false,
    confirmDataReplace: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--restore-data") options.restoreData = true;
    else if (arg === "--restore-env") options.restoreEnv = true;
    else if (arg === "--confirm-service-stopped")
      options.confirmServiceStopped = true;
    else if (arg === "--confirm-data-replace")
      options.confirmDataReplace = true;
    else if (["--project-root", "--backup-root", "--snapshot-id", "--data-scope"].includes(arg)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少值`);
      const key = {
        "--project-root": "projectRoot",
        "--backup-root": "backupRoot",
        "--snapshot-id": "snapshotId",
        "--data-scope": "dataScope",
      }[arg];
      options[key] = value;
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (!options.projectRoot || !path.isAbsolute(options.projectRoot))
    throw new Error("--project-root 必须是绝对路径");
  if (!options.backupRoot || !path.isAbsolute(options.backupRoot))
    throw new Error("--backup-root 必须是绝对路径");
  options.snapshotId = validateSnapshotId(options.snapshotId);
  if (!new Set(["json", "full"]).has(options.dataScope))
    throw new Error("--data-scope 仅允许 json 或 full");
  if (command === "snapshot" && (options.restoreData || options.restoreEnv))
    throw new Error("snapshot 不接受 restore 选项");
  if (command === "restore" && rest.includes("--data-scope"))
    throw new Error("restore 的 data scope 由快照元数据决定，不接受 --data-scope");
  if (options.apply && command === "restore" && !options.confirmServiceStopped)
    throw new Error("restore --apply 必须同时提供 --confirm-service-stopped");
  if (options.apply && options.restoreData && !options.confirmDataReplace)
    throw new Error("恢复 data 必须同时提供 --confirm-data-replace");
  return options;
};

const assertRealDirectory = async (entryPath, label) => {
  const resolved = path.resolve(entryPath);
  const entry = await lstat(resolved);
  if (!entry.isDirectory() || entry.isSymbolicLink())
    throw new Error(`${label} 必须是非符号链接的真实目录`);
  if ((await realpath(resolved)) !== resolved)
    throw new Error(`${label} 的路径组件不得经过符号链接`);
  return resolved;
};

const assertProjectRoot = async (projectRoot) => {
  const resolved = await assertRealDirectory(projectRoot, "项目目录");
  for (const relative of REQUIRED_PROJECT_FILES) {
    const target = path.join(resolved, relative);
    const entry = await lstat(target).catch(() => null);
    if (!entry?.isFile() || entry.isSymbolicLink())
      throw new Error(`项目目录缺少真实文件 ${relative}`);
  }
  const data = await lstat(path.join(resolved, "data")).catch(() => null);
  if (!data?.isDirectory() || data.isSymbolicLink())
    throw new Error("项目 data 必须是非符号链接的真实目录");
  return resolved;
};

const assertBackupRoot = async (backupRoot, { create = false } = {}) => {
  const resolved = path.resolve(backupRoot);
  if (create && !(await lstat(resolved).catch(() => null))) {
    await assertRealDirectory(path.dirname(resolved), "备份目录父级");
    await mkdir(resolved, { mode: 0o700 });
  }
  return assertRealDirectory(resolved, "备份目录");
};

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} 执行失败（exit ${result.status}）`);
};

const sha256File = async (filePath) => {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
};

const readRelease = async (projectRoot) => {
  const release = JSON.parse(await readFile(path.join(projectRoot, "release.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  return {
    release: {
      version: release.version,
      build: release.build,
      label: release.label,
    },
    packageVersion: packageJson.version,
  };
};

const writeManifest = async (snapshotRoot, artifactNames) => {
  const lines = [];
  for (const name of artifactNames.toSorted()) {
    if (!FIXED_ARTIFACTS.has(name)) throw new Error(`拒绝未知快照产物：${name}`);
    lines.push(`${await sha256File(path.join(snapshotRoot, name))}  ${name}`);
  }
  await writeFile(path.join(snapshotRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, {
    mode: 0o600,
  });
};

const verifyManifest = async (snapshotRoot) => {
  const lines = (await readFile(path.join(snapshotRoot, "SHA256SUMS"), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) throw new Error("SHA256SUMS 为空");
  const names = [];
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/);
    if (!match || !FIXED_ARTIFACTS.has(match[2]))
      throw new Error("SHA256SUMS 含非法条目");
    const actual = await sha256File(path.join(snapshotRoot, match[2]));
    if (actual !== match[1]) throw new Error(`${match[2]} SHA256 校验失败`);
    names.push(match[2]);
  }
  return names;
};

const snapshot = async (options, projectRoot, backupRoot, targetRoot) => {
  const release = await readRelease(projectRoot);
  const dataRoot = path.join(projectRoot, "data");
  const dataRootStats = await lstat(dataRoot);
  const jsonFiles = (await readdir(dataRoot))
    .filter((name) => name.endsWith(".json"))
    .toSorted();
  const envPath = path.join(projectRoot, ".env.local");
  const codeEntries = codeArchiveEntries(await readdir(projectRoot));
  const envStats = await lstat(envPath).catch(() => null);
  if (envStats && (!envStats.isFile() || envStats.isSymbolicLink()))
    throw new Error(".env.local 必须是普通文件且不能是符号链接");

  console.log(`${options.apply ? "APPLY" : "DRY-RUN"} snapshot ${options.snapshotId}`);
  console.log(`project=${projectRoot}`);
  console.log(`target=${targetRoot}`);
  console.log(`code excludes=${CODE_EXCLUDES.join(",")}`);
  console.log(`data scope=${options.dataScope}`);
  console.log(`environment=${envStats ? "separate protected copy" : "absent"}`);
  if (!options.apply) return;

  if (await lstat(targetRoot).catch(() => null))
    throw new Error("目标快照目录已存在，拒绝覆盖");
  await mkdir(targetRoot, { mode: 0o700 });
  await writeFile(path.join(targetRoot, "INCOMPLETE"), "snapshot in progress\n", {
    mode: 0o600,
  });

  const artifacts = [];
  const codeArchive = path.join(targetRoot, "code.tar.gz");
  run("tar", codeArchiveArgs(codeArchive, projectRoot, codeEntries));
  await chmod(codeArchive, 0o600);
  artifacts.push("code.tar.gz");

  const nodeModules = await lstat(path.join(projectRoot, "node_modules")).catch(() => null);
  if (nodeModules?.isDirectory() && !nodeModules.isSymbolicLink()) {
    run("tar", [
      "-czf",
      path.join(targetRoot, "node_modules.tar.gz"),
      "-C",
      projectRoot,
      "node_modules",
    ]);
    await chmod(path.join(targetRoot, "node_modules.tar.gz"), 0o600);
    artifacts.push("node_modules.tar.gz");
  }

  const dataArtifact = options.dataScope === "full" ? "data-full.tar.gz" : "data-json.tar.gz";
  const dataArgs = ["-czf", path.join(targetRoot, dataArtifact)];
  if (options.dataScope === "full") dataArgs.push("-C", projectRoot, "data");
  else if (jsonFiles.length) dataArgs.push("-C", dataRoot, ...jsonFiles);
  else dataArgs.push("--files-from", "/dev/null");
  run("tar", dataArgs);
  await chmod(path.join(targetRoot, dataArtifact), 0o600);
  artifacts.push(dataArtifact);

  if (envStats) {
    await copyFile(envPath, path.join(targetRoot, "environment.env"));
    await chmod(path.join(targetRoot, "environment.env"), 0o600);
    artifacts.push("environment.env");
  }

  const metadata = {
    schemaVersion: 1,
    snapshotId: options.snapshotId,
    createdAt: new Date().toISOString(),
    sourceRoot: projectRoot,
    dataScope: options.dataScope,
    dataFiles: options.dataScope === "json" ? jsonFiles : null,
    includesEnvironment: Boolean(envStats),
    environmentOwner: envStats ? { uid: envStats.uid, gid: envStats.gid } : null,
    includesNodeModules: artifacts.includes("node_modules.tar.gz"),
    dataOwner: { uid: dataRootStats.uid, gid: dataRootStats.gid },
    ...release,
  };
  await writeFile(
    path.join(targetRoot, "snapshot.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    { mode: 0o600 },
  );
  artifacts.push("snapshot.json");
  await writeManifest(targetRoot, artifacts);
  await rm(path.join(targetRoot, "INCOMPLETE"));
  await writeFile(path.join(targetRoot, "COMPLETE"), "verified\n", { mode: 0o600 });
  console.log(`snapshot complete: ${targetRoot}`);
};

const restoreJsonData = async (stagingRoot, snapshotRoot, projectRoot, metadata) => {
  const extracted = path.join(stagingRoot, "data-json");
  await mkdir(extracted, { mode: 0o700 });
  run("tar", ["-xzf", path.join(snapshotRoot, "data-json.tar.gz"), "-C", extracted]);
  const dataRoot = path.join(projectRoot, "data");
  const expected = new Set(metadata.dataFiles || []);
  for (const name of await readdir(dataRoot)) {
    if (!name.endsWith(".json") || expected.has(name)) continue;
    const target = path.join(dataRoot, name);
    const entry = await lstat(target);
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error(`拒绝删除非普通 JSON：${target}`);
    await rm(target);
  }
  for (const name of expected) {
    const source = path.join(extracted, name);
    const sourceStats = await lstat(source);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink())
      throw new Error(`快照 JSON 非普通文件：${name}`);
    await copyFile(source, path.join(dataRoot, name));
    await chmod(path.join(dataRoot, name), 0o600);
    if (Number.isInteger(metadata.dataOwner?.uid) && Number.isInteger(metadata.dataOwner?.gid)) {
      await chown(path.join(dataRoot, name), metadata.dataOwner.uid, metadata.dataOwner.gid);
    }
  }
};

const restore = async (options, projectRoot, backupRoot, targetRoot) => {
  await assertRealDirectory(targetRoot, "快照目录");
  if (!(await lstat(path.join(targetRoot, "COMPLETE")).catch(() => null)))
    throw new Error("快照没有 COMPLETE 标记，拒绝恢复");
  const metadata = JSON.parse(await readFile(path.join(targetRoot, "snapshot.json"), "utf8"));
  if (metadata.snapshotId !== options.snapshotId || metadata.schemaVersion !== 1)
    throw new Error("快照元数据与请求不匹配");
  const artifacts = await verifyManifest(targetRoot);
  if (!artifacts.includes("code.tar.gz") || !artifacts.includes("snapshot.json"))
    throw new Error("快照缺少代码或元数据");

  console.log(`${options.apply ? "APPLY" : "DRY-RUN"} restore ${options.snapshotId}`);
  console.log(`project=${projectRoot}`);
  console.log(`snapshot=${targetRoot}`);
  console.log(`verified artifacts=${artifacts.join(",")}`);
  console.log(`data=${options.restoreData ? "replace from snapshot" : "protected/untouched"}`);
  console.log(`environment=${options.restoreEnv ? "restore protected copy" : "protected/untouched"}`);
  console.log("service restart, systemd and nginx are intentionally outside this helper");
  if (!options.apply) return;

  const stagingRoot = path.join(
    path.dirname(projectRoot),
    `.commerce-canvas-restore-${options.snapshotId}-${process.pid}`,
  );
  if (await lstat(stagingRoot).catch(() => null)) throw new Error("恢复暂存目录已存在");
  await mkdir(stagingRoot, { mode: 0o700 });
  const codeRoot = path.join(stagingRoot, "code");
  await mkdir(codeRoot, { mode: 0o700 });
  run("tar", ["-xzf", path.join(targetRoot, "code.tar.gz"), "--no-same-owner", "-C", codeRoot]);
  if (metadata.includesNodeModules) {
    run("tar", ["-xzf", path.join(targetRoot, "node_modules.tar.gz"), "--no-same-owner", "-C", codeRoot]);
  }
  const rsyncArgs = [
    "-a",
    "--delete",
    "--no-owner",
    "--no-group",
    ...CODE_EXCLUDES.filter((entry) => entry !== "./node_modules").map(
      (entry) => `--exclude=/${entry.slice(2)}`,
    ),
  ];
  if (!metadata.includesNodeModules) rsyncArgs.push("--exclude=node_modules");
  rsyncArgs.push(`${codeRoot}${path.sep}`, `${projectRoot}${path.sep}`);
  run("rsync", rsyncArgs);

  if (options.restoreEnv) {
    if (!metadata.includesEnvironment || !artifacts.includes("environment.env"))
      throw new Error("快照不包含 environment.env");
    const destination = path.join(projectRoot, ".env.local");
    const current = await lstat(destination).catch(() => null);
    if (current?.isSymbolicLink()) throw new Error("拒绝覆盖符号链接 .env.local");
    await copyFile(path.join(targetRoot, "environment.env"), destination);
    await chmod(destination, 0o600);
    if (
      Number.isInteger(metadata.environmentOwner?.uid) &&
      Number.isInteger(metadata.environmentOwner?.gid)
    ) {
      await chown(
        destination,
        metadata.environmentOwner.uid,
        metadata.environmentOwner.gid,
      );
    }
  }

  if (options.restoreData) {
    if (metadata.dataScope === "json") {
      await restoreJsonData(stagingRoot, targetRoot, projectRoot, metadata);
    } else if (metadata.dataScope === "full") {
      const extracted = path.join(stagingRoot, "data-full");
      await mkdir(extracted, { mode: 0o700 });
      run("tar", ["-xzf", path.join(targetRoot, "data-full.tar.gz"), "-C", extracted]);
      run("rsync", ["-a", "--delete", `${path.join(extracted, "data")}${path.sep}`, `${path.join(projectRoot, "data")}${path.sep}`]);
    } else {
      throw new Error("未知 data scope");
    }
  }

  await rm(stagingRoot, { recursive: true });
  console.log("restore complete; run preflight before starting the service");
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { project, backup } = assertSeparatedRoots(options.projectRoot, options.backupRoot);
  const projectRoot = await assertProjectRoot(project);
  let backupRoot;
  if (options.command === "snapshot" && !options.apply) {
    const existing = await lstat(backup).catch(() => null);
    if (existing) backupRoot = await assertBackupRoot(backup);
    else backupRoot = backup;
  } else {
    backupRoot = await assertBackupRoot(backup, {
      create: options.command === "snapshot" && options.apply,
    });
  }
  const targetRoot = snapshotDirectory(backupRoot, options.snapshotId);
  if (options.command === "snapshot")
    await snapshot(options, projectRoot, backupRoot, targetRoot);
  else await restore(options, projectRoot, backupRoot, targetRoot);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}

