import test from "node:test";
import assert from "node:assert/strict";

import {
  QIANCHUAN_SPEAKING_TEMPLATE,
  QIANCHUAN_SPEAKING_TEMPLATE_ID,
} from "./qianchuan-speaking-template.js";
import {
  orderedWorkflowNodes,
  reachableWorkflowNodes,
  terminalWorkflowExecutionNodeIds,
} from "./workflow-graph.js";

test("千川口播模板公开完整的业务输入字段", () => {
  const template = QIANCHUAN_SPEAKING_TEMPLATE;
  assert.equal(template.id, QIANCHUAN_SPEAKING_TEMPLATE_ID);
  assert.equal(template.experience, "qianchuan-speaking");
  assert.equal(template.runMode, "backend");
  assert.equal(template.manifest.validation.status, "ready");

  const fields = new Map(
    template.manifest.fields.map((field) => [field.nodeId, field]),
  );
  assert.equal(fields.get("qc-remake-reference")?.required, false);
  assert.equal(fields.get("qc-brand-brief")?.type, "text");
  assert.equal(fields.get("qc-brand-brief")?.required, true);
  assert.equal(fields.get("qc-person")?.type, "verified_person");
  assert.equal(fields.get("qc-person")?.required, true);
  assert.equal(fields.get("qc-clothing")?.required, false);
  assert.equal(fields.get("qc-product")?.required, true);
  assert.equal(fields.get("qc-voice")?.type, "audio");
  assert.equal(fields.get("qc-voice")?.required, false);
  const nodePositions = template.nodes.map(
    (node) => `${node.position.x}:${node.position.y}`,
  );
  assert.equal(
    new Set(nodePositions).size,
    nodePositions.length,
    "无限画布的默认节点不应互相重叠",
  );
  assert.match(
    template.nodes.find((node) => node.id === "qc-video")?.data?.prompt || "",
    /没有参考声音时使用自然清晰的 AI 默认口播/,
  );
});

test("千川口播模板从业务输入贯通到有声视频输出", () => {
  const { nodes, edges } = QIANCHUAN_SPEAKING_TEMPLATE;
  const ordered = orderedWorkflowNodes(nodes, edges);
  const terminalIds = terminalWorkflowExecutionNodeIds(nodes, edges);
  assert.deepEqual(terminalIds, ["qc-video"]);
  assert.ok(
    ordered.findIndex((node) => node.id === "qc-brand-brief") <
      ordered.findIndex((node) => node.id === "qc-copy-director"),
  );
  assert.ok(
    ordered.findIndex((node) => node.id === "qc-copy-director") <
      ordered.findIndex((node) => node.id === "qc-video"),
  );

  const reachable = reachableWorkflowNodes(nodes, edges, "qc-video");
  for (const nodeId of [
    "qc-remake-reference",
    "qc-remake-analysis",
    "qc-brand-brief",
    "qc-person",
    "qc-person-whitelist",
    "qc-clothing",
    "qc-product",
    "qc-voice",
    "qc-visual-analysis",
    "qc-copy-director",
    "qc-keyframe",
  ]) {
    assert.equal(reachable.has(nodeId), true, `${nodeId} 应连接到视频输出`);
  }
});

test("模型与系统提示词保持后台可配置，用户只替换开放字段", () => {
  const byId = new Map(
    QIANCHUAN_SPEAKING_TEMPLATE.nodes.map((node) => [node.id, node.data]),
  );
  assert.equal(byId.get("qc-brand-brief")?.remakeEditable, true);
  assert.equal(byId.get("qc-remake-reference")?.remakeGroup, "remake-reference");
  assert.equal(byId.get("qc-remake-analysis")?.kind, "media-analysis");
  assert.equal(byId.get("qc-person-whitelist")?.provider, "volcengine");
  assert.equal(byId.get("qc-person-whitelist")?.assetMethod, "face-image");
  assert.equal(byId.get("qc-copy-director")?.remakeEditable, false);
  assert.equal(byId.get("qc-keyframe")?.model, "gpt-image-2");
  assert.equal(
    byId.get("qc-video")?.model,
    "doubao-seedance-2-0-fast-260128",
  );
  assert.equal(byId.get("qc-video")?.appendConfiguredPrompt, true);
  assert.match(byId.get("qc-copy-director")?.prompt || "", /禁止编造/);
  assert.ok(
    QIANCHUAN_SPEAKING_TEMPLATE.edges.some(
      (edge) =>
        edge.source === "qc-person-whitelist" &&
        edge.target === "qc-video" &&
        edge.targetHandle === "trusted_person_asset_1",
    ),
  );
});

