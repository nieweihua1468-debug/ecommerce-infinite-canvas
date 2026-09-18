import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("clean source build skips runtime hot-rank media that is stored outside Git", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-canvas-hot-rank-build-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const missingMediaRoot = path.join(temporary, "hot-rank-media");
  const args = [
    path.resolve("scripts/generate-hot-rank-posters.mjs"),
    "--manifest",
    path.resolve("public/data/hot-rank/manifest.json"),
    "--media-root",
    missingMediaRoot,
  ];
  const strictResult = spawnSync(process.execPath, args, {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
  assert.notEqual(strictResult.status, 0);
  assert.match(strictResult.stderr, /热点榜媒体目录不存在/);

  const result = spawnSync(
    process.execPath,
    [...args, "--if-media-root-present"],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /热点视频封面 0\/0/);
  assert.match(result.stdout, /运行媒体目录未随源码分发/);
});

