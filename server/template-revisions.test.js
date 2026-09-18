import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTemplateChanges,
  createTemplateRevisionEntry,
  diffTemplateNodes,
  templateRevision,
} from "./template-revisions.js";

const node = (id, title, patch = {}) => ({
  id,
  type: "studio",
  position: { x: 10, y: 20 },
  data: { kind: "image", title, model: "gpt-image-2", ...patch },
});

test("template node diff reports added, removed, modified and connection changes", () => {
  const before = {
    nodes: [node("a", "主图"), node("b", "换装", { prompt: "旧词" }), node("d", "旧节点")],
    edges: [{ source: "a", target: "b", targetHandle: "image_1" }],
  };
  const after = {
    nodes: [node("a", "主图"), node("b", "换装", { prompt: "新词" }), node("c", "视频生成")],
    edges: [{ source: "b", target: "c", targetHandle: "image_1" }],
  };
  const changes = diffTemplateNodes(before, after);
  assert.equal(changes.find((item) => item.nodeId === "b")?.changeType, "modified");
  assert.deepEqual(changes.find((item) => item.nodeId === "b")?.fields, [
    "提示词",
    "节点连接",
  ]);
  assert.equal(changes.find((item) => item.nodeId === "c")?.changeType, "added");
  assert.equal(changes.find((item) => item.nodeId === "d")?.changeType, "removed");
  assert.equal(changes.find((item) => item.nodeId === "a")?.changeType, "connection");
});

test("runtime and canvas-only changes do not create template revision alerts", () => {
  const before = { nodes: [node("a", "主图")], edges: [] };
  const after = {
    nodes: [
      {
        ...node("a", "主图", { runtimeText: "临时结果" }),
        position: { x: 900, y: 600 },
        measured: { width: 200, height: 300 },
      },
    ],
    edges: [],
  };
  assert.deepEqual(diffTemplateNodes(before, after), []);
});

test("revision entries aggregate all unacknowledged node changes", () => {
  const first = createTemplateRevisionEntry(
    { revision: 1, nodes: [node("a", "主图")], edges: [] },
    { nodes: [node("a", "主图", { prompt: "第一版" })], edges: [] },
    { revision: 2, updatedAt: "2026-07-18T01:00:00.000Z" },
  );
  const second = createTemplateRevisionEntry(
    { revision: 2, nodes: [node("a", "主图", { prompt: "第一版" })], edges: [] },
    { nodes: [node("a", "主图", { prompt: "第二版", aspectRatio: "9:16" })], edges: [] },
    { revision: 3, updatedAt: "2026-07-18T02:00:00.000Z" },
  );
  const changes = aggregateTemplateChanges([first, second], 1);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].fields, ["提示词", "画幅"]);
  assert.equal(changes[0].revision, 3);
  assert.equal(templateRevision({ revision: 3 }), 3);
  assert.equal(templateRevision({}), 1);
});

