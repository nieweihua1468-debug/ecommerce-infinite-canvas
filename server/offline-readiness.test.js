import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  OFFLINE_READINESS_DEFAULTS,
  assertLoopbackBaseUrl,
  assertSafeGetPath,
  buildBurstPlan,
  offlineReadinessConfig,
  summarizeHttpSamples,
} from "./offline-readiness.js";

test("offline readiness configuration has bounded, overridable defaults", () => {
  assert.deepEqual(offlineReadinessConfig({}), OFFLINE_READINESS_DEFAULTS);
  assert.deepEqual(
    offlineReadinessConfig({
      OFFLINE_CONCURRENCY: "24",
      OFFLINE_ROUNDS: "5",
      OFFLINE_TIMEOUT_MS: "30000",
    }),
    { concurrency: 24, rounds: 5, timeoutMs: 30_000 },
  );
  assert.throws(
    () => offlineReadinessConfig({ OFFLINE_CONCURRENCY: "0" }),
    /1 到 100/,
  );
});

test("offline target is restricted to loopback HTTP addresses", () => {
  assert.equal(assertLoopbackBaseUrl("http://127.0.0.1:8791/"), "http://127.0.0.1:8791");
  assert.equal(assertLoopbackBaseUrl("http://localhost:8791"), "http://localhost:8791");
  assert.throws(
    () => assertLoopbackBaseUrl("https://example.com"),
    /只允许访问/,
  );
});

test("safe GET allowlist preserves query strings and rejects write-like paths", () => {
  assert.equal(
    assertSafeGetPath("/api/admin/model-deployments?windowDays=7&page=1"),
    "/api/admin/model-deployments?windowDays=7&page=1",
  );
  assert.throws(() => assertSafeGetPath("/api/tasks/video"), /拒绝/);
  assert.throws(() => assertSafeGetPath("https://example.com/api/health"), /拒绝/);
});

test("burst plan has exact concurrency per round and rotates safe routes", () => {
  const plan = buildBurstPlan(["/api/health", "/api/models"], {
    concurrency: 3,
    rounds: 2,
  });
  assert.deepEqual(plan, [
    ["/api/health", "/api/models", "/api/health"],
    ["/api/models", "/api/health", "/api/models"],
  ]);
});

test("HTTP sample summary reports failures and nearest-rank p95", () => {
  const result = summarizeHttpSamples([
    { ok: true, latencyMs: 10 },
    { ok: true, latencyMs: 20 },
    { ok: false, latencyMs: 100 },
  ]);
  assert.deepEqual(result, {
    requestCount: 3,
    failureCount: 1,
    failureRate: 33.3,
    avgLatencyMs: 43.3,
    p95LatencyMs: 100,
    maxLatencyMs: 100,
  });
  assert.deepEqual(summarizeHttpSamples([]), {
    requestCount: 0,
    failureCount: 0,
    failureRate: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    maxLatencyMs: 0,
  });
});

test("offline readiness runner remains compatible with production Node 20", async () => {
  const runner = await readFile(
    path.resolve("deploy/offline-readiness.mjs"),
    "utf8",
  );
  assert.doesNotMatch(runner, /Map\.groupBy\(/);
});

