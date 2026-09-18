import test from "node:test";
import assert from "node:assert/strict";
import {
  generatedResultMedia,
  reconcileWorkflowResultNodes,
  stripWorkflowResultNodes,
} from "../shared/workflow-result-nodes.js";

const imageNode = {
  id: "image-1",
  type: "studio",
  position: { x: 100, y: 200 },
  data: {
    kind: "image",
    title: "图片生成",
    aspectRatio: "9:16",
    outputs: [{ id: "image", type: "IMAGE" }],
  },
};

test("creates one connected result node for every generated image", () => {
  const reconciled = reconcileWorkflowResultNodes(
    [imageNode],
    [],
    [
      {
        sourceNodeId: imageNode.id,
        runId: "run-1",
        status: "succeeded",
        result: { imageUrls: ["/one.png", "/two.png", "/three.png"] },
      },
    ],
    { stroke: "#c9ff2e" },
  );
  const results = reconciled.nodes.filter(
    (node) => node.data.runtimeResultNode,
  );
  assert.equal(results.length, 3);
  assert.deepEqual(
    results.map((node) => node.data.runtimePreviews[0].url),
    ["/one.png", "/two.png", "/three.png"],
  );
  assert.equal(reconciled.edges.length, 3);
  assert.ok(
    reconciled.edges.every(
      (edge) => edge.source === imageNode.id && edge.targetHandle === "media",
    ),
  );
});

test("an active rerun replaces stale results with connected progress nodes", () => {
  const completed = reconcileWorkflowResultNodes([imageNode], [], [
    {
      sourceNodeId: imageNode.id,
      runId: "old-run",
      status: "succeeded",
      result: { imageUrl: "/old.png" },
    },
  ]);
  const processing = reconcileWorkflowResultNodes(
    completed.nodes,
    completed.edges,
    [
      {
        sourceNodeId: imageNode.id,
        runId: "new-run",
        status: "processing",
        expectedCount: 3,
        previewKind: "image",
        progress: 36,
        progressLabel: "正在生成第 1 张",
        result: {},
      },
    ],
  );
  const results = processing.nodes.filter((node) => node.data.runtimeResultNode);
  assert.equal(results.length, 3);
  assert.equal(processing.edges.length, 3);
  assert.ok(results.every((node) => node.data.runtimeRunStatus === "processing"));
  assert.ok(results.every((node) => node.data.runtimeProgress === 36));
  assert.ok(results.every((node) => node.data.runtimePreviews.length === 0));
  assert.ok(results.every((node) => node.data.runtimeProgressLabel === "正在生成第 1 张"));
});

test("failed runs keep a visible result node with the frontend error", () => {
  const reconciled = reconcileWorkflowResultNodes([imageNode], [], [
    {
      sourceNodeId: imageNode.id,
      runId: "failed-run",
      status: "failed",
      expectedCount: 2,
      error: "模型服务繁忙",
    },
  ]);
  const results = reconciled.nodes.filter((node) => node.data.runtimeResultNode);
  assert.equal(results.length, 2);
  assert.ok(results.every((node) => node.data.runtimeRunStatus === "failed"));
  assert.ok(results.every((node) => node.data.runtimeError === "模型服务繁忙"));
});

test("result slot identity stays stable while progress becomes media", () => {
  const processing = reconcileWorkflowResultNodes([imageNode], [], [
    {
      sourceNodeId: imageNode.id,
      runId: "run-progress",
      status: "processing",
      expectedCount: 1,
    },
  ]);
  const completed = reconcileWorkflowResultNodes(
    processing.nodes,
    processing.edges,
    [
      {
        sourceNodeId: imageNode.id,
        runId: "run-finished",
        status: "succeeded",
        result: { imageUrl: "/finished.png" },
      },
    ],
  );
  assert.equal(processing.nodes.at(-1).id, completed.nodes.at(-1).id);
  assert.equal(completed.nodes.at(-1).data.runtimeRunStatus, "succeeded");
  assert.equal(completed.nodes.at(-1).data.runtimePreviews[0].url, "/finished.png");
});

test("reconciliation is stable and preserves a moved result position", () => {
  const descriptor = {
    sourceNodeId: imageNode.id,
    runId: "same-run",
    status: "succeeded",
    result: { imageUrl: "/same.png" },
  };
  const first = reconcileWorkflowResultNodes([imageNode], [], [descriptor]);
  const moved = first.nodes.map((node) =>
    node.data.runtimeResultNode
      ? { ...node, position: { x: 900, y: 600 } }
      : node,
  );
  const second = reconcileWorkflowResultNodes(moved, first.edges, [descriptor]);
  assert.deepEqual(second.nodes.at(-1).position, { x: 900, y: 600 });
  assert.equal(second.edges.length, 1);
});

test("runtime result nodes never enter the executable workflow definition", () => {
  const reconciled = reconcileWorkflowResultNodes([imageNode], [], [
    {
      sourceNodeId: imageNode.id,
      runId: "run-2",
      status: "succeeded",
      result: { imageUrl: "/result.png" },
    },
  ]);
  const clean = stripWorkflowResultNodes(reconciled.nodes, reconciled.edges);
  assert.deepEqual(clean.nodes, [imageNode]);
  assert.deepEqual(clean.edges, []);
});

test("normalizes duplicate image URLs and prefers complete image batches", () => {
  assert.deepEqual(
    generatedResultMedia({
      imageUrl: "/one.png",
      imageUrls: ["/one.png", "/two.png"],
    }).map((item) => item.url),
    ["/one.png", "/two.png"],
  );
});

test("creates a media entry for every generated video URL", () => {
  assert.deepEqual(
    generatedResultMedia({
      videoUrl: "/one.mp4",
      videoUrls: ["/one.mp4", "/two.mp4"],
    }).map((item) => item.url),
    ["/one.mp4", "/two.mp4"],
  );
});

