import assert from "node:assert/strict";
import test from "node:test";
import { buildApiMetrics, buildModelDeployments } from "./model-deployments.js";

const now = "2026-08-04T12:00:00.000Z";

const catalog = [
  {
    id: "kling-v3-omni",
    name: "Kling 3.0 Omni",
    kind: "video",
    configured: true,
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    kind: "image",
    provider: "azure",
    configured: true,
  },
  {
    id: "nano-banana",
    name: "Nano Banana Pro",
    kind: "image",
    configured: false,
  },
];

test("aggregates deployed models, model readiness, success rates and successful durations", () => {
  const result = buildModelDeployments({
    now,
    windowDays: 7,
    modelsCatalog: catalog,
    readinessRecords: [
      {
        provider: "Kling",
        configured: true,
        authenticated: true,
        ready: true,
        modelAvailable: null,
        latencyMs: 81,
        checkedAt: "2026-08-04T11:59:00.000Z",
      },
      {
        provider: "Image2",
        modelId: "gpt-image-2",
        configured: true,
        authenticated: true,
        modelAvailable: true,
        latencyMs: 42,
        checkedAt: "2026-08-04T11:58:00.000Z",
      },
    ],
    tasks: [
      {
        id: "task-ok",
        modelName: "kling-v3-omni",
        provider: "kling",
        status: "succeeded",
        createdAt: "2026-08-04T10:59:50.000Z",
        startedAt: "2026-08-04T11:00:00.000Z",
        completedAt: "2026-08-04T11:01:00.000Z",
      },
      {
        id: "task-failed",
        modelName: "kling-v3-omni",
        provider: "kling",
        status: "failed",
        startedAt: "2026-08-04T11:10:00.000Z",
        completedAt: "2026-08-04T11:10:05.000Z",
        failure: { code: "UPSTREAM_503", message: "供应商暂时不可用" },
      },
      {
        id: "task-active",
        model: "gpt-image-2",
        provider: "azure",
        outputType: "image",
        status: "processing",
        createdAt: "2026-08-04T11:30:00.000Z",
      },
    ],
    runs: [
      {
        id: "run-image",
        steps: [
          {
            id: "image-step",
            nodeId: "image",
            model: "gpt-image-2",
            kind: "image",
            status: "succeeded",
            startedAt: "2026-08-04T09:00:00.000Z",
            completedAt: "2026-08-04T09:00:20.000Z",
          },
        ],
      },
    ],
  });

  assert.deepEqual(result.window, {
    days: 7,
    from: "2026-07-28T12:00:00.000Z",
    to: now,
    basis: "completedAt for final records; startedAt/createdAt for active records",
  });
  const kling = result.data.find((item) => item.id === "kling-v3-omni");
  assert.equal(kling.provider, "kling");
  assert.equal(kling.metrics.requestCount, 2);
  assert.equal(kling.metrics.successCount, 1);
  assert.equal(kling.metrics.failureCount, 1);
  assert.equal(kling.metrics.successRate, 50);
  assert.equal(kling.metrics.failureRate, 50);
  assert.equal(kling.metrics.avgDurationMs, 60_000);
  assert.equal(kling.metrics.p95DurationMs, 60_000);
  assert.equal(kling.deployment.authenticated, true);
  assert.equal(kling.deployment.modelAvailable, true, "a real success proves this model was usable");
  assert.equal(kling.deployment.status, "DEGRADED");
  assert.equal(kling.deployment.lastErrorCode, "UPSTREAM_503");
  assert(kling.issues.some((item) => item.code === "RECENT_FAILURES"));

  const image = result.data.find((item) => item.id === "gpt-image-2");
  assert.equal(image.provider, "image2");
  assert.equal(image.metrics.requestCount, 2);
  assert.equal(image.metrics.activeCount, 1);
  assert.equal(image.metrics.successRate, 100);
  assert.equal(image.metrics.avgDurationMs, 20_000);
  assert.equal(image.deployment.status, "HEALTHY");

  const disabled = result.data.find((item) => item.id === "nano-banana");
  assert.equal(disabled.deployment.status, "UNAVAILABLE");
  assert(disabled.issues.some((item) => item.code === "NOT_CONFIGURED"));
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.requestCount, 4);
  assert.equal(result.summary.successRate, 66.7);
});

test("does not double-count workflow video steps and excludes local, skipped and terminated work", () => {
  const result = buildModelDeployments({
    now,
    modelsCatalog: catalog.slice(0, 1),
    tasks: [
      {
        id: "provider-task",
        workflowRunId: "run-1",
        workflowNodeId: "video",
        modelName: "kling-v3-omni",
        status: "succeeded",
        startedAt: "2026-08-04T10:00:00.000Z",
        completedAt: "2026-08-04T10:01:00.000Z",
      },
    ],
    runs: [
      {
        id: "run-1",
        steps: [
          {
            id: "same-provider-call",
            nodeId: "video",
            kind: "video",
            model: "kling-v3-omni",
            status: "succeeded",
            startedAt: "2026-08-04T10:00:00.000Z",
            completedAt: "2026-08-04T10:01:00.000Z",
          },
          {
            id: "prompt",
            kind: "text",
            model: "local-prompt",
            status: "succeeded",
            completedAt: "2026-08-04T10:00:00.100Z",
          },
          {
            id: "skipped-analysis",
            kind: "media-analysis",
            model: "vapeur-gemini-3.1-pro",
            status: "skipped",
            completedAt: "2026-08-04T10:00:00.200Z",
          },
          {
            id: "terminated-image",
            kind: "image",
            model: "gpt-image-2",
            status: "terminated",
            completedAt: "2026-08-04T10:00:00.300Z",
          },
        ],
      },
    ],
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].metrics.requestCount, 1);
  assert.equal(result.summary.requestCount, 1);
});

test("uses completion time for final records, active start time, aliases and standalone analysis tasks", () => {
  const result = buildModelDeployments({
    now,
    windowDays: 2,
    modelsCatalog: [],
    tasks: [
      {
        id: "old-completion",
        modelName: "kling-v3",
        status: "succeeded",
        createdAt: "2026-07-01T00:00:00.000Z",
        startedAt: "2026-07-01T00:00:00.000Z",
        completedAt: "2026-07-01T00:01:00.000Z",
      },
      {
        id: "legacy-fast",
        modelName: "doubao-seedance-2-0-fast",
        provider: "volcengine",
        status: "processing",
        startedAt: "2026-08-04T10:00:00.000Z",
      },
    ],
    analysisTasks: [
      {
        id: "analysis-1",
        model: "vapeur-gemini-3.5-flash",
        status: "succeeded",
        startedAt: "2026-08-04T09:00:00.000Z",
        completedAt: "2026-08-04T09:00:30.000Z",
      },
    ],
  });

  assert.equal(result.data.some((item) => item.id === "kling-v3"), false);
  const fast = result.data.find((item) => item.id === "doubao-seedance-2-0-fast-260128");
  assert.equal(fast.metrics.activeCount, 1);
  assert(fast.issues.some((item) => item.code === "NOT_IN_DEPLOYMENT_CATALOG"));
  const analysis = result.data.find((item) => item.id === "vapeur-gemini-3.5-flash");
  assert.equal(analysis.kind, "analysis");
  assert.equal(analysis.metrics.avgDurationMs, 30_000);
});

test("returns null duration and rates when there are no finalized successful samples", () => {
  const result = buildModelDeployments({ now, modelsCatalog: catalog.slice(0, 1) });
  const metrics = result.data[0].metrics;
  assert.equal(metrics.successRate, null);
  assert.equal(metrics.failureRate, null);
  assert.equal(metrics.avgDurationMs, null);
  assert.equal(metrics.p95DurationMs, null);
});

test("allowlists output and redacts credentials from provider and task errors", () => {
  const result = buildModelDeployments({
    now,
    modelsCatalog: [
      {
        id: "gpt-image-2",
        configured: true,
        prompt: "DO NOT LEAK THIS PROMPT",
        input: { secret: "catalog-input-secret" },
      },
    ],
    readinessRecords: [
      {
        provider: "image2",
        modelId: "gpt-image-2",
        configured: true,
        authenticated: false,
        modelAvailable: false,
        errorMessage: "Authorization: top-secret-token Bearer abc.def.ghi",
        secret: "readiness-secret",
        checkedAt: "2026-08-04T11:00:00.000Z",
      },
    ],
    tasks: [
      {
        id: "failed",
        model: "gpt-image-2",
        status: "failed",
        completedAt: "2026-08-04T11:30:00.000Z",
        prompt: "private task prompt",
        input: { apiKey: "private-key" },
        error: "request failed?api_key=real-key",
      },
    ],
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("DO NOT LEAK"), false);
  assert.equal(serialized.includes("catalog-input-secret"), false);
  assert.equal(serialized.includes("readiness-secret"), false);
  assert.equal(serialized.includes("private task prompt"), false);
  assert.equal(serialized.includes("private-key"), false);
  assert.equal(serialized.includes("top-secret-token"), false);
  assert.equal(serialized.includes("abc.def.ghi"), false);
  assert.match(result.data[0].deployment.lastErrorMessage, /\[REDACTED\]/);
});

test("buildApiMetrics only aggregates current /api traffic and ranks routes by requests", () => {
  const result = buildApiMetrics(
    [
      {
        timestamp: "2026-08-04T11:00:00.000Z",
        method: "GET",
        route: "/api/models?token=must-not-leak",
        status: 200,
        durationMs: 20,
      },
      {
        timestamp: "2026-08-04T11:01:00.000Z",
        method: "GET",
        route: "/api/models",
        status: 500,
        durationMs: 100,
      },
      {
        timestamp: "2026-08-04T11:02:00.000Z",
        method: "POST",
        route: "/api/tasks",
        status: 201,
        latencyMs: 30,
      },
      {
        timestamp: "2026-08-04T11:03:00.000Z",
        method: "GET",
        route: "/release.json",
        status: 500,
        durationMs: 900,
      },
      {
        timestamp: "2026-07-01T11:00:00.000Z",
        method: "GET",
        route: "/api/old",
        status: 500,
        durationMs: 2_000,
      },
    ],
    { now, windowDays: 7 },
  );

  assert.deepEqual(result.summary, {
    requestCount: 3,
    successRate: 66.7,
    failureRate: 33.3,
    avgLatencyMs: 50,
    p95LatencyMs: 100,
  });
  assert.equal(result.routes.length, 2);
  assert.deepEqual(result.routes[0], {
    method: "GET",
    route: "/api/models",
    requestCount: 2,
    failureCount: 1,
    failureRate: 50,
    avgLatencyMs: 60,
    p95LatencyMs: 100,
    lastRequestAt: "2026-08-04T11:01:00.000Z",
  });
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("buildApiMetrics has stable empty-window semantics", () => {
  const result = buildApiMetrics([], { now, windowDays: 1 });
  assert.deepEqual(result.summary, {
    requestCount: 0,
    successRate: null,
    failureRate: null,
    avgLatencyMs: null,
    p95LatencyMs: null,
  });
  assert.deepEqual(result.routes, []);
});

