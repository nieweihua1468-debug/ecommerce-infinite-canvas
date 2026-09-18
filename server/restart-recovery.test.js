import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowRecoveryInput,
  findWorkflowVideoTask,
  oldestWorkflowRunsFirst,
  shouldReuseWorkflowStep,
} from "./restart-recovery.js";

test("persists workflow orchestration without embedding runtime media", () => {
  const recovery = buildWorkflowRecoveryInput(
    {
      name: "换装视频",
      nodes: [{ id: "input-1" }, { id: "video-1" }],
      edges: [{ id: "edge-1" }],
      runtimeAssets: {
        "input-1": [{ data: "very-large-base64" }],
      },
      runtimeAssetGroupIds: { "face-1": "group-1" },
      fallbackPrompt: "继续生成",
    },
    { runtimeAssetGroupIds: { "face-2": "group-2" } },
  );
  assert.equal(JSON.stringify(recovery).includes("very-large-base64"), false);
  assert.deepEqual(recovery.runtimeAssetGroupIds, {
    "face-1": "group-1",
    "face-2": "group-2",
  });
  assert.equal(recovery.nodes.length, 2);
});

test("persists the exact node selected for a single-node run", () => {
  const recovery = buildWorkflowRecoveryInput({
    name: "单节点图片生成",
    singleNodeId: "image-2",
    sourceRunId: "run-upstream",
    nodes: [{ id: "input-1" }, { id: "image-2" }, { id: "video-3" }],
    edges: [
      { source: "input-1", target: "image-2" },
      { source: "image-2", target: "video-3" },
    ],
  });
  assert.equal(recovery.singleNodeId, "image-2");
  assert.equal(recovery.sourceRunId, "run-upstream");
  assert.equal(recovery.startNodeId, "");
});

test("reconnects a workflow step to its persisted provider task", () => {
  const tasks = [
    {
      id: "task-1",
      workflowRunId: "run-1",
      workflowNodeId: "video-1",
      status: "processing",
      upstreamTaskId: "provider-1",
    },
  ];
  assert.equal(
    findWorkflowVideoTask(
      tasks,
      { id: "run-1" },
      { nodeId: "video-1", taskId: "task-1" },
    )?.upstreamTaskId,
    "provider-1",
  );
});

test("completed workflow steps are restored instead of submitted twice", () => {
  assert.equal(shouldReuseWorkflowStep({ status: "succeeded" }), true);
  assert.equal(shouldReuseWorkflowStep({ status: "skipped" }), true);
  assert.equal(shouldReuseWorkflowStep({ status: "processing" }), false);
});

test("restores the oldest queued workflow first after a service restart", () => {
  const runs = [
    { id: "newest", createdAt: "2026-07-18T09:02:00.000Z" },
    { id: "oldest", createdAt: "2026-07-18T08:00:00.000Z" },
    { id: "middle", createdAt: "2026-07-18T08:30:00.000Z" },
  ];
  assert.deepEqual(
    oldestWorkflowRunsFirst(runs).map((run) => run.id),
    ["oldest", "middle", "newest"],
  );
  assert.equal(runs[0].id, "newest");
});

