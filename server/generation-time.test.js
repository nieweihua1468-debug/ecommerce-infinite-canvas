import assert from "node:assert/strict";
import test from "node:test";
import {
  generationTiming,
  summarizeGenerationTimes,
  timingPatch,
  withWorkflowGenerationTiming,
} from "./generation-time.js";

const t0 = "2026-07-18T00:00:00.000Z";

test("generationTiming separates queue and generation durations", () => {
  const timing = generationTiming({
    status: "succeeded",
    createdAt: t0,
    startedAt: "2026-07-18T00:00:02.000Z",
    completedAt: "2026-07-18T00:00:12.000Z",
  });
  assert.equal(timing.queueMs, 2_000);
  assert.equal(timing.generationMs, 10_000);
  assert.equal(timing.totalMs, 12_000);
  assert.equal(timing.isFinal, true);
});

test("generationTiming supports active and legacy records", () => {
  const active = generationTiming(
    { status: "processing", createdAt: t0, startedAt: t0 },
    "2026-07-18T00:00:08.000Z",
  );
  assert.equal(active.generationMs, 8_000);
  assert.equal(active.isActive, true);

  const legacy = generationTiming({
    status: "succeeded",
    createdAt: t0,
    updatedAt: "2026-07-18T00:00:05.000Z",
  });
  assert.equal(legacy.generationMs, 5_000);
});

test("workflow timing enriches every step", () => {
  const run = withWorkflowGenerationTiming({
    status: "succeeded",
    createdAt: t0,
    completedAt: "2026-07-18T00:00:20.000Z",
    steps: [
      {
        status: "succeeded",
        createdAt: t0,
        startedAt: t0,
        completedAt: "2026-07-18T00:00:03.000Z",
      },
    ],
  });
  assert.equal(run.timing.generationMs, 20_000);
  assert.equal(run.steps[0].timing.generationMs, 3_000);
});

test("summary uses successful records and groups image, video and steps", () => {
  const summary = summarizeGenerationTimes(
    [
      {
        status: "succeeded",
        outputType: "image",
        createdAt: t0,
        completedAt: "2026-07-18T00:00:04.000Z",
      },
      {
        status: "succeeded",
        outputType: "video",
        createdAt: t0,
        completedAt: "2026-07-18T00:00:10.000Z",
      },
      {
        status: "failed",
        outputType: "image",
        createdAt: t0,
        completedAt: "2026-07-18T00:00:01.000Z",
      },
    ],
    [
      {
        status: "succeeded",
        createdAt: t0,
        completedAt: "2026-07-18T00:00:20.000Z",
        steps: [
          {
            kind: "text",
            status: "succeeded",
            createdAt: t0,
            completedAt: "2026-07-18T00:00:02.000Z",
          },
        ],
      },
    ],
  );
  assert.equal(summary.tasks.count, 2);
  assert.equal(summary.tasks.averageMs, 7_000);
  assert.equal(summary.tasks.byType.image.averageMs, 4_000);
  assert.equal(summary.tasks.byType.video.averageMs, 10_000);
  assert.equal(summary.workflows.averageMs, 20_000);
  assert.equal(summary.steps.byType.text.averageMs, 2_000);
});

test("timingPatch persists start and completion without overwriting them", () => {
  assert.equal(
    timingPatch({}, { status: "processing" }, "2026-07-18T00:00:01.000Z")
      .startedAt,
    "2026-07-18T00:00:01.000Z",
  );
  assert.equal(
    timingPatch(
      { startedAt: t0 },
      { status: "succeeded" },
      "2026-07-18T00:00:05.000Z",
    ).completedAt,
    "2026-07-18T00:00:05.000Z",
  );
  assert.equal(
    timingPatch(
      { completedAt: t0 },
      { status: "failed" },
      "2026-07-18T00:00:05.000Z",
    ).completedAt,
    undefined,
  );
});

