import assert from "node:assert/strict";
import test from "node:test";

import {
  auditWorkflowCanvas,
  classifyWorkflowAgentInstruction,
  improveWorkflowAgentPrompt,
} from "../src/workflow-agent.js";

test("workflow agent classifies director, sync, optimization and batch commands", () => {
  assert.equal(classifyWorkflowAgentInstruction("帮我批量生成每款商品视频"), "batch");
  assert.equal(classifyWorkflowAgentInstruction("同步 @主图 到视频节点"), "sync");
  assert.equal(classifyWorkflowAgentInstruction("优化选中节点提示词"), "optimize");
  assert.equal(classifyWorkflowAgentInstruction("检查当前画布问题"), "audit");
  assert.equal(classifyWorkflowAgentInstruction("检查 @主图 当前画布问题"), "audit");
  assert.equal(classifyWorkflowAgentInstruction("做一个新品口播视频"), "director");
});

test("workflow agent optimization retains material mentions and stays idempotent", () => {
  const once = improveWorkflowAgentPrompt({
    prompt: "@素材1 展示夏季连衣裙",
    kind: "video",
    aspectRatio: "9:16",
    duration: 15,
    materialTokens: ["@素材1", "@素材2"],
  });
  const twice = improveWorkflowAgentPrompt({
    prompt: once,
    kind: "video",
    aspectRatio: "9:16",
    duration: 15,
    materialTokens: ["@素材1", "@素材2"],
  });
  assert.match(twice, /@素材1/);
  assert.match(twice, /@素材2/);
  assert.equal((twice.match(/【智能体优化】/g) || []).length, 1);
});

test("workflow agent audit reports disconnected and incomplete nodes", () => {
  const report = auditWorkflowCanvas(
    [
      { id: "material", data: { kind: "input" } },
      { id: "video", data: { kind: "video", prompt: "" } },
      { id: "batch", data: { kind: "batch-input", runtimeFileCount: 0 } },
    ],
    [{ source: "material", target: "video" }],
  );
  assert.equal(report.stats.nodes, 3);
  assert.equal(report.stats.batches, 1);
  assert.ok(report.score < 100);
  assert.ok(report.issues.some((issue) => issue.label.includes("缺少提示词")));
  assert.ok(report.issues.some((issue) => issue.label.includes("尚未接入")));
  assert.ok(report.issues.some((issue) => issue.label.includes("等待选择素材")));
});

