import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assessDataEntry,
  auditDataTree,
} from "../deploy/data-security.mjs";
import {
  CODE_EXCLUDES,
  assertSeparatedRoots,
  codeArchiveArgs,
  codeArchiveEntries,
  snapshotDirectory,
  validateSnapshotId,
} from "../deploy/release-snapshot.mjs";

const cli = path.resolve("deploy/release-snapshot.mjs");

const runCli = (args) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });

const makeStats = ({
  mode,
  uid = 1000,
  gid = 1000,
  kind = "file",
  nlink = 1,
}) => ({
  mode,
  uid,
  gid,
  nlink,
  isDirectory: () => kind === "directory",
  isFile: () => kind === "file",
  isSymbolicLink: () => kind === "symlink",
});

test("data entry policy allows only production directory and file modes", () => {
  const base = "/srv/app/data";
  assert.deepEqual(
    assessDataEntry({
      entryPath: `${base}/asset.bin`,
      rootPath: base,
      stats: makeStats({ mode: 0o640 }),
      expectedUid: 1000,
      expectedGid: 1000,
    }),
    [],
  );
  assert.deepEqual(
    assessDataEntry({
      entryPath: `${base}/generated`,
      rootPath: base,
      stats: makeStats({ mode: 0o750, kind: "directory" }),
      expectedUid: 1000,
      expectedGid: 1000,
    }),
    [],
  );

  const executable = assessDataEntry({
    entryPath: `${base}/unsafe.sh`,
    rootPath: base,
    stats: makeStats({ mode: 0o700 }),
    expectedUid: 1000,
    expectedGid: 1000,
  });
  assert.match(executable.join("\n"), /可执行位/);
  assert.match(executable.join("\n"), /仅允许 0600 或 0640/);

  const wrongOwner = assessDataEntry({
    entryPath: `${base}/foreign.bin`,
    rootPath: base,
    stats: makeStats({ mode: 0o600, uid: 0, gid: 0 }),
    expectedUid: 1000,
    expectedGid: 1000,
  });
  assert.match(wrongOwner.join("\n"), /owner 0:0/);
});

test("recursive data audit catches symlinks, executable files and 0777 directories", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-data-audit-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "data");
  await fs.mkdir(root, { mode: 0o700 });
  const safe = path.join(root, "safe");
  await fs.mkdir(safe, { mode: 0o750 });
  await fs.writeFile(path.join(safe, "record.json"), "{}\n", { mode: 0o640 });

  const clean = await auditDataTree(root);
  assert.equal(clean.ok, true);
  assert.equal(clean.files, 1);
  assert.equal(clean.directories, 2);

  const openDirectory = path.join(root, "open");
  await fs.mkdir(openDirectory, { mode: 0o700 });
  await fs.chmod(openDirectory, 0o777);
  const linkedSource = path.join(root, "linked.bin");
  await fs.writeFile(linkedSource, "payload", { mode: 0o600 });
  await fs.link(linkedSource, path.join(root, "linked-copy.bin"));
  const executable = path.join(root, "executable.bin");
  await fs.writeFile(executable, "payload", { mode: 0o600 });
  await fs.chmod(executable, 0o700);
  await fs.symlink(safe, path.join(root, "escape"));

  const unsafe = await auditDataTree(root);
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.issues.join("\n"), /0777/);
  assert.match(unsafe.issues.join("\n"), /可执行位/);
  assert.match(unsafe.issues.join("\n"), /禁止符号链接/);
});

test("snapshot path validation rejects traversal, root and overlapping targets", () => {
  assert.equal(validateSnapshotId("pre-2026080401"), "pre-2026080401");
  assert.throws(() => validateSnapshotId("../escape"), /snapshot-id/);
  assert.throws(() => assertSeparatedRoots("/", "/var/backups/commerce-canvas"), /根目录/);
  assert.throws(
    () => assertSeparatedRoots("/opt/commerce-canvas", "/opt/commerce-canvas/backups"),
    /禁止嵌套/,
  );
  assert.equal(
    snapshotDirectory("/var/backups/commerce-canvas", "pre-2026080401"),
    "/var/backups/commerce-canvas/pre-2026080401",
  );
});

test("code snapshot has hard exclusions for historical backups and browser artifacts", () => {
  for (const required of [
    "./data",
    "./.env.*",
    "./node_modules",
    "./backups",
    "./work",
    "./.playwright-cli",
    "./playwright-report",
    "./test-results",
  ]) {
    assert.equal(CODE_EXCLUDES.includes(required), true, `missing ${required}`);
  }
  const entries = codeArchiveEntries([
    "data",
    ".env.local",
    "node_modules",
    "backups",
    ".playwright-cli",
    "public",
    "server",
    "package.json",
  ]);
  assert.deepEqual(entries, ["package.json", "public", "server"]);
  const args = codeArchiveArgs(
    "/safe/code.tar.gz",
    "/opt/commerce-canvas",
    entries,
  );
  assert.deepEqual(args.slice(-5), [
    "-C",
    "/opt/commerce-canvas",
    "package.json",
    "public",
    "server",
  ]);
});

test("production responsive guard stays after desktop shell overrides", async () => {
  const css = await fs.readFile(
    path.resolve("src/dark-green-theme.css"),
    "utf8",
  );
  const desktopOverride = css.lastIndexOf(
    "grid-template-columns: 192px minmax(0, 1fr);",
  );
  const finalGuard = css.lastIndexOf("Final production breakpoint guard");
  assert.ok(desktopOverride >= 0, "desktop shell override must exist");
  assert.ok(finalGuard > desktopOverride, "mobile guard must follow desktop overrides");
  const guardedCss = css.slice(finalGuard);
  assert.match(guardedCss, /@media \(max-width: 560px\)/);
  assert.match(
    guardedCss,
    /\.app-shell\.sidebar-collapsed:not\(\.workflow-immersive\)/,
  );
  assert.match(guardedCss, /grid-template-columns: minmax\(0, 1fr\)/);
});

test("production preflight treats public assets and hot-rank media as release inputs", async () => {
  const preflight = await fs.readFile(path.resolve("deploy/preflight.mjs"), "utf8");
  assert.match(preflight, /const buildInputs = \[[\s\S]*"public"/);
  assert.match(preflight, /"hot-rank bundle"/);
  assert.match(preflight, /publicText === distText/);
  assert.match(preflight, /distinctFiles\.size === 20/);
  assert.doesNotMatch(
    preflight,
    /Math\.max\(entry\.mtimeMs, \.\.\.childTimes/,
    "release extraction must not make unchanged source directories look newer than dist",
  );
});

test("snapshot defaults to dry-run and apply snapshot excludes protected trees", async (t) => {
  const temporary = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-snapshot-")),
  );
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, "project");
  const backup = path.join(temporary, "backup");
  await fs.mkdir(path.join(project, "server"), { recursive: true });
  await fs.mkdir(path.join(project, "public", "data"), { recursive: true });
  await fs.mkdir(path.join(project, "data"), { mode: 0o700 });
  await fs.mkdir(path.join(project, "node_modules", "fixture"), { recursive: true });
  await fs.mkdir(path.join(project, "backups"), { recursive: true });
  await fs.mkdir(path.join(project, ".playwright-cli"), { recursive: true });
  await fs.mkdir(backup, { mode: 0o700 });
  await fs.writeFile(path.join(project, "package.json"), '{"version":"1.2.0"}\n');
  await fs.writeFile(
    path.join(project, "release.json"),
    '{"version":"1.2.0","build":2026080401,"label":"candidate"}\n',
  );
  await fs.writeFile(path.join(project, "server", "index.js"), "export {};\n");
  await fs.writeFile(
    path.join(project, "public", "data", "manifest.json"),
    '{"items":[]}\n',
  );
  await fs.writeFile(path.join(project, "app.txt"), "original\n");
  await fs.writeFile(path.join(project, "data", "users.json"), "[]\n", { mode: 0o600 });
  await fs.writeFile(path.join(project, ".env.local"), "SECRET=not-printed\n", {
    mode: 0o600,
  });
  await fs.writeFile(path.join(project, "node_modules", "fixture", "index.js"), "module.exports=1;\n");
  await fs.writeFile(path.join(project, "backups", "must-not-archive.bin"), "x");
  await fs.writeFile(path.join(project, ".playwright-cli", "must-not-archive.bin"), "x");

  const common = [
    "snapshot",
    "--project-root",
    project,
    "--backup-root",
    backup,
    "--snapshot-id",
    "fixture-1",
  ];
  const dryRun = runCli(common);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /DRY-RUN snapshot/);
  assert.equal(await fs.stat(path.join(backup, "fixture-1")).catch(() => null), null);

  const applied = runCli([...common, "--apply"]);
  assert.equal(applied.status, 0, applied.stderr);
  const snapshotRoot = path.join(backup, "fixture-1");
  assert.equal((await fs.stat(path.join(snapshotRoot, "COMPLETE"))).isFile(), true);
  assert.equal((await fs.stat(path.join(snapshotRoot, "SHA256SUMS"))).isFile(), true);
  assert.equal((await fs.stat(path.join(snapshotRoot, "code.tar.gz"))).mode & 0o777, 0o600);
  assert.equal(
    (await fs.stat(path.join(snapshotRoot, "data-json.tar.gz"))).mode & 0o777,
    0o600,
  );
  assert.equal((await fs.stat(path.join(snapshotRoot, "environment.env"))).mode & 0o777, 0o600);

  const listing = spawnSync("tar", ["-tzf", path.join(snapshotRoot, "code.tar.gz")], {
    encoding: "utf8",
  });
  assert.equal(listing.status, 0, listing.stderr);
  assert.doesNotMatch(listing.stdout, /backups\/must-not-archive/);
  assert.doesNotMatch(listing.stdout, /\.playwright-cli\/must-not-archive/);
  assert.doesNotMatch(listing.stdout, /data\/users\.json/);
  assert.doesNotMatch(listing.stdout, /\.env\.local/);
  assert.match(listing.stdout, /public\/data\/manifest\.json/);

  const restoreDryRun = runCli([
    "restore",
    "--project-root",
    project,
    "--backup-root",
    backup,
    "--snapshot-id",
    "fixture-1",
  ]);
  assert.equal(restoreDryRun.status, 0, restoreDryRun.stderr);
  assert.match(restoreDryRun.stdout, /DRY-RUN restore/);
  assert.match(restoreDryRun.stdout, /data=protected\/untouched/);

  const unconfirmed = runCli([
    "restore",
    "--project-root",
    project,
    "--backup-root",
    backup,
    "--snapshot-id",
    "fixture-1",
    "--apply",
  ]);
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.stderr, /confirm-service-stopped/);

  const unconfirmedData = runCli([
    "restore",
    "--project-root",
    project,
    "--backup-root",
    backup,
    "--snapshot-id",
    "fixture-1",
    "--restore-data",
    "--apply",
    "--confirm-service-stopped",
  ]);
  assert.equal(unconfirmedData.status, 1);
  assert.match(unconfirmedData.stderr, /confirm-data-replace/);

  await fs.writeFile(path.join(project, "app.txt"), "changed\n");
  await fs.writeFile(path.join(project, "new-runtime-file.txt"), "remove me\n");
  await fs.writeFile(path.join(project, "data", "users.json"), '[{"keep":true}]\n');
  await fs.writeFile(path.join(project, ".env.local"), "SECRET=keep-current\n");
  const restored = runCli([
    "restore",
    "--project-root",
    project,
    "--backup-root",
    backup,
    "--snapshot-id",
    "fixture-1",
    "--apply",
    "--confirm-service-stopped",
  ]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(await fs.readFile(path.join(project, "app.txt"), "utf8"), "original\n");
  assert.equal(await fs.stat(path.join(project, "new-runtime-file.txt")).catch(() => null), null);
  assert.equal(
    await fs.readFile(path.join(project, "data", "users.json"), "utf8"),
    '[{"keep":true}]\n',
  );
  assert.equal(
    await fs.readFile(path.join(project, ".env.local"), "utf8"),
    "SECRET=keep-current\n",
  );
  assert.equal((await fs.stat(path.join(project, "backups"))).isDirectory(), true);

  await fs.appendFile(path.join(snapshotRoot, "code.tar.gz"), "tamper");
  const tampered = runCli([
    "restore",
    "--project-root",
    project,
    "--backup-root",
    backup,
    "--snapshot-id",
    "fixture-1",
  ]);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /SHA256 校验失败/);
});

