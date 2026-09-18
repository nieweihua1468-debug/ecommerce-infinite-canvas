import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWorkflowDigitalAssets,
  splitKlingOmniDigitalAssets,
  visibleDigitalAssets,
} from "./workflow-digital-assets.js";

const nodes = [
  { id: "asset", data: { kind: "asset", digitalAssetId: "asset-1" } },
  { id: "video", data: { kind: "video", digitalAssetIds: ["asset-2"] } },
];

test("新工作流在入队前拒绝已删除的数字资产", () => {
  assert.throws(
    () =>
      assertWorkflowDigitalAssets({
        nodes,
        assets: [
          { id: "asset-1", ownerId: "user-1", name: "人物", deletedAt: "2026-07-18" },
          { id: "asset-2", ownerId: "user-1", name: "服装" },
        ],
        ownerId: "user-1",
      }),
    (error) => error.status === 409 && error.message.includes("人物"),
  );
});

test("断点续跑可复用项目状态中软删除的资产", () => {
  assert.doesNotThrow(() =>
    assertWorkflowDigitalAssets({
      nodes,
      assets: [
        { id: "asset-1", ownerId: "user-1", name: "人物", deletedAt: "2026-07-18" },
        { id: "asset-2", ownerId: "user-1", name: "服装" },
      ],
      ownerId: "user-1",
      allowDeleted: true,
    }),
  );
});

test("资产列表隐藏软删除记录", () => {
  assert.deepEqual(
    visibleDigitalAssets([
      { id: "active" },
      { id: "deleted", deletedAt: "2026-07-18" },
    ]).map((asset) => asset.id),
    ["active"],
  );
});

test("Omni 优先把已完成的可灵主体作为 Element 绑定", () => {
  const result = splitKlingOmniDigitalAssets([
    { id: "element", klingElementId: "90800123", images: [{ data: "a" }] },
    { id: "reference", images: [{ data: "b" }] },
  ]);
  assert.deepEqual(result.elementAssets.map((asset) => asset.id), ["element"]);
  assert.deepEqual(result.referenceAssets.map((asset) => asset.id), [
    "reference",
  ]);
  assert.equal(result.elementAssets[0].klingElementId, "90800123");
});

