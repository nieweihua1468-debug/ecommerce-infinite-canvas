import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeTaskForList,
  summarizeWorkflowRunForList,
  TASK_PROMPT_PREVIEW_LIMIT,
} from "./record-summary.js";

test("task list summaries keep card fields and bound long prompts", () => {
  const prompt = "x".repeat(TASK_PROMPT_PREVIEW_LIMIT + 40);
  const summary = summarizeTaskForList({
    id: "task-1",
    status: "succeeded",
    videoUrl: "/generated/result.mp4",
    prompt,
  });

  assert.equal(summary.id, "task-1");
  assert.equal(summary.status, "succeeded");
  assert.equal(summary.videoUrl, "/generated/result.mp4");
  assert.equal(summary.promptTruncated, true);
  assert.equal(summary.prompt.length, TASK_PROMPT_PREVIEW_LIMIT + 1);
});

test("workflow list summaries keep progress but omit result payloads and assets", () => {
  const summary = summarizeWorkflowRunForList({
    id: "run-1",
    status: "processing",
    runtimeAssets: { image: [{ data: "large" }] },
    steps: [
      {
        id: "step-1",
        title: "生成图片",
        status: "succeeded",
        result: { type: "image", imageUrl: "/generated/result.jpg" },
      },
    ],
  });

  assert.equal(summary.id, "run-1");
  assert.equal(summary.runtimeAssets, undefined);
  assert.equal(summary.steps[0].title, "生成图片");
  assert.equal(summary.steps[0].result, undefined);
});

