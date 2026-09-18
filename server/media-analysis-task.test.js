import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaAnalysisTaskRecord,
  failInterruptedMediaAnalysisTask,
  mediaAnalysisInputFingerprint,
  patchMediaAnalysisTask,
  publicMediaAnalysisTask,
} from "./media-analysis-task.js";

test("creates a persisted media analysis task without retaining base64 media", () => {
  const task = createMediaAnalysisTaskRecord({
    id: "analysis-1",
    ownerId: "user-1",
    now: "2026-07-17T00:00:00.000Z",
    input: {
      model: "vapeur-gemini-3.1-pro",
      targetType: "video",
      frameLimit: 18,
      videos: [{ name: "look.mp4", data: "very-large-base64" }],
    },
  });
  assert.equal(task.fileName, "look.mp4");
  assert.equal(task.status, "queued");
  assert.equal(task.serverInputFingerprint.length, 64);
  assert.equal(JSON.stringify(task).includes("very-large-base64"), false);
});

test("updates and safely exposes a completed task", () => {
  const task = createMediaAnalysisTaskRecord({
    id: "analysis-1",
    ownerId: "user-1",
    input: {},
  });
  const completed = patchMediaAnalysisTask(
    task,
    { status: "succeeded", content: "可用提示词" },
    "2026-07-17T00:01:00.000Z",
  );
  assert.equal(completed.content, "可用提示词");
  assert.equal(publicMediaAnalysisTask(completed).ownerId, undefined);
});

test("marks only active tasks as failed after a service restart", () => {
  const queued = createMediaAnalysisTaskRecord({
    id: "analysis-1",
    ownerId: "user-1",
    input: {},
  });
  assert.equal(failInterruptedMediaAnalysisTask(queued).status, "failed");
  const succeeded = { ...queued, status: "succeeded" };
  assert.equal(failInterruptedMediaAnalysisTask(succeeded), succeeded);
});

test("fingerprints the actual analysis input and model for safe idempotency", () => {
  const source = {
    model: "vapeur-gpt-5.5",
    instruction: "拆解镜头",
    frameLimit: 12,
    videos: [{ name: "a.mp4", mimeType: "video/mp4", data: "AAAA" }],
  };
  assert.equal(
    mediaAnalysisInputFingerprint(source),
    mediaAnalysisInputFingerprint({ ...source }),
  );
  assert.notEqual(
    mediaAnalysisInputFingerprint(source),
    mediaAnalysisInputFingerprint({
      ...source,
      videos: [{ ...source.videos[0], data: "BBBB" }],
    }),
  );
  assert.notEqual(
    mediaAnalysisInputFingerprint(source),
    mediaAnalysisInputFingerprint({ ...source, model: "deepseek-v4-pro" }),
  );
});

