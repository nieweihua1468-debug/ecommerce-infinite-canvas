import test from "node:test";
import assert from "node:assert/strict";
import { usagePointCost, videoPointCost } from "./points.js";

test("videoPointCost charges one point per second", () => {
  assert.equal(videoPointCost(3), 3);
  assert.equal(videoPointCost("15"), 15);
});

test("videoPointCost rejects invalid durations", () => {
  assert.throws(() => videoPointCost(0), /视频时长不合法/);
  assert.throws(() => videoPointCost(3.5), /视频时长不合法/);
});

test("all model usages follow the configured one-point units", () => {
  assert.equal(usagePointCost("text", 1), 1);
  assert.equal(usagePointCost("image", 4), 4);
  assert.equal(usagePointCost("analysis", 18), 18);
  assert.equal(usagePointCost("video", 15), 15);
  assert.equal(usagePointCost("audio", 1), 1);
});

test("usage point cost rejects unsupported or fractional quantities", () => {
  assert.throws(() => usagePointCost("asset", 1), /计费类型不合法/);
  assert.throws(() => usagePointCost("image", 1.5), /计费数量不合法/);
});

