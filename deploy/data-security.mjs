import { access, constants, lstat, readdir } from "node:fs/promises";
import path from "node:path";

const DIRECTORY_MODES = new Set([0o700, 0o750]);
const FILE_MODES = new Set([0o600, 0o640]);

export const permissionMode = (mode) => `0${(mode & 0o777).toString(8)}`;

const relativeLabel = (root, entryPath) => {
  const relative = path.relative(root, entryPath);
  return relative ? `data/${relative}` : "data";
};

export function assessDataEntry({
  entryPath,
  rootPath,
  stats,
  expectedUid,
  expectedGid,
}) {
  const issues = [];
  const label = relativeLabel(rootPath, entryPath);
  const mode = stats.mode & 0o777;

  if (stats.isSymbolicLink()) {
    issues.push(`${label}: 禁止符号链接`);
    return issues;
  }

  if (stats.uid !== expectedUid || stats.gid !== expectedGid) {
    issues.push(
      `${label}: owner ${stats.uid}:${stats.gid}，期望 ${expectedUid}:${expectedGid}`,
    );
  }

  if (stats.isDirectory()) {
    if (!DIRECTORY_MODES.has(mode)) {
      issues.push(
        `${label}: 目录权限 ${permissionMode(mode)}，仅允许 0700 或 0750`,
      );
    }
    return issues;
  }

  if (stats.isFile()) {
    if ((mode & 0o111) !== 0) {
      issues.push(
        `${label}: 文件权限 ${permissionMode(mode)} 含可执行位；仅允许 0600 或 0640`,
      );
    } else if (!FILE_MODES.has(mode)) {
      issues.push(`${label}: 文件权限 ${permissionMode(mode)}，仅允许 0600 或 0640`);
    }
    return issues;
  }

  issues.push(`${label}: 仅允许普通文件和目录`);
  return issues;
}

export async function auditDataTree(
  rootPath,
  {
    expectedUid = typeof process.getuid === "function" ? process.getuid() : null,
    expectedGid = typeof process.getgid === "function" ? process.getgid() : null,
    maxReportedIssues = 24,
  } = {},
) {
  const resolvedRoot = path.resolve(rootPath);
  const rootStats = await lstat(resolvedRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    return {
      ok: false,
      files: 0,
      directories: 0,
      issues: ["data: 必须是非符号链接的真实目录"],
      totalIssues: 1,
      expectedUid,
      expectedGid,
    };
  }

  const ownerUid = expectedUid ?? rootStats.uid;
  const ownerGid = expectedGid ?? rootStats.gid;
  const stack = [resolvedRoot];
  const issues = [];
  let totalIssues = 0;
  let files = 0;
  let directories = 0;

  while (stack.length) {
    const entryPath = stack.pop();
    const stats = await lstat(entryPath);
    const entryIssues = assessDataEntry({
      entryPath,
      rootPath: resolvedRoot,
      stats,
      expectedUid: ownerUid,
      expectedGid: ownerGid,
    });
    totalIssues += entryIssues.length;
    for (const issue of entryIssues) {
      if (issues.length < maxReportedIssues) issues.push(issue);
    }

    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      directories += 1;
      const children = await readdir(entryPath);
      for (const child of children) stack.push(path.join(entryPath, child));
    } else if (stats.isFile()) {
      files += 1;
    }
  }

  await access(resolvedRoot, constants.R_OK | constants.W_OK);
  return {
    ok: totalIssues === 0,
    files,
    directories,
    issues,
    totalIssues,
    omittedIssues: Math.max(0, totalIssues - issues.length),
    expectedUid: ownerUid,
    expectedGid: ownerGid,
  };
}

export function dataAuditDetail(audit) {
  if (audit.ok) {
    return `${audit.directories} 个目录和 ${audit.files} 个文件通过递归权限、owner、链接与文件类型检查`;
  }
  const suffix = audit.omittedIssues
    ? `；另有 ${audit.omittedIssues} 项未展开`
    : "";
  return `${audit.totalIssues} 项风险：${audit.issues.join("；")}${suffix}`;
}

