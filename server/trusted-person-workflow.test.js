import test from "node:test";
import assert from "node:assert/strict";
import {
  hasDirectSeedanceFaceConnection,
  includeRequiredTrustedPersonAssets,
  injectTrustedPersonAssetNodes,
  mergeTrustedPersonGroupIds,
  resolveWorkflowAssetUri,
  uniqueTrustedAssetUris,
} from "./trusted-person-workflow.js";

const nodes = [
  { id: "face", data: { kind: "face-input", title: "真人人脸输入" } },
  { id: "video", data: { kind: "video", model: "doubao-seedance-2-0-260128" } },
];
const edges = [
  {
    id: "face-video",
    source: "face",
    sourceHandle: "face",
    target: "video",
    targetHandle: "image",
  },
];

test("injects a trusted-person asset step between a face input and Seedance", () => {
  const upgraded = injectTrustedPersonAssetNodes(nodes, edges, {
    face: "group-authorized",
  });
  assert.equal(upgraded.nodes.length, 3);
  assert.equal(upgraded.nodes[2].data.kind, "asset");
  assert.equal(upgraded.nodes[2].data.provider, "volcengine");
  assert.deepEqual(upgraded.runtimeAssetGroupIds, {
    "runtime-trusted-person-face-video": "group-authorized",
  });
  assert.equal(upgraded.edges.length, 2);
  assert.equal(upgraded.edges[0].target, "runtime-trusted-person-face-video");
  assert.equal(upgraded.edges[1].source, "runtime-trusted-person-face-video");
  assert.equal(upgraded.edges[1].targetHandle, "trusted_person_asset_1");
  assert.equal(
    hasDirectSeedanceFaceConnection(upgraded.nodes, upgraded.edges),
    false,
  );
});

test("prefers the current runtime asset-group mapping while retaining legacy clients", () => {
  assert.deepEqual(
    mergeTrustedPersonGroupIds(
      { face: "runtime-group", other: "runtime-other" },
      { face: "legacy-group", legacy: "legacy-only" },
    ),
    {
      face: "runtime-group",
      other: "runtime-other",
      legacy: "legacy-only",
    },
  );
});

test("does not leak a Kling Element ID into a Seedance asset node", () => {
  assert.equal(
    resolveWorkflowAssetUri({ provider: "kling", klingElementId: "123456" }),
    "123456",
  );
  assert.equal(
    resolveWorkflowAssetUri({
      provider: "volcengine",
      klingElementId: "123456",
    }),
    "",
  );
  assert.equal(
    resolveWorkflowAssetUri({
      provider: "volcengine",
      runtimeUri: "asset://asset-authorized",
      klingElementId: "123456",
    }),
    "asset://asset-authorized",
  );
});

test("injects a backend-managed asset step when no group was selected", () => {
  const upgraded = injectTrustedPersonAssetNodes(nodes, edges, {});
  assert.equal(upgraded.nodes.length, 3);
  assert.equal(upgraded.nodes[2].data.kind, "asset");
  assert.equal(upgraded.nodes[2].data.groupId, "");
  assert.deepEqual(upgraded.runtimeAssetGroupIds, {});
  assert.equal(upgraded.edges.length, 2);
  assert.equal(
    hasDirectSeedanceFaceConnection(upgraded.nodes, upgraded.edges),
    false,
  );
});

test("injects a video asset step for an authorized same-person video", () => {
  const videoNodes = [
    {
      id: "person-video",
      data: { kind: "person-video-input", title: "真人人物视频" },
    },
    {
      id: "seedance",
      data: { kind: "video", model: "doubao-seedance-2-0-260128" },
    },
  ];
  const upgraded = injectTrustedPersonAssetNodes(
    videoNodes,
    [
      {
        id: "person-video-seedance",
        source: "person-video",
        sourceHandle: "person_video",
        target: "seedance",
        targetHandle: "media",
      },
    ],
    {},
  );
  assert.equal(upgraded.nodes[2].data.assetMethod, "person-video");
  assert.deepEqual(upgraded.nodes[2].data.inputs, [
    { id: "video", label: "同一真人视频", type: "VIDEO" },
  ]);
  assert.equal(upgraded.edges[0].targetHandle, "video");
  assert.equal(upgraded.edges[1].targetHandle, "trusted_person_asset_1");
  assert.equal(
    hasDirectSeedanceFaceConnection(upgraded.nodes, upgraded.edges),
    false,
  );
});

test("injects a parallel trusted asset route when a face reaches Seedance through image generation", () => {
  const indirectNodes = [
    { id: "face", data: { kind: "face-input", title: "真人人脸输入" } },
    { id: "image", data: { kind: "image", title: "换脸" } },
    {
      id: "video",
      data: { kind: "video", model: "doubao-seedance-2-0-260128" },
    },
  ];
  const indirectEdges = [
    {
      id: "face-image",
      source: "face",
      target: "image",
      targetHandle: "image_1",
    },
    {
      id: "image-video",
      source: "image",
      target: "video",
      targetHandle: "image_1",
    },
  ];
  const upgraded = injectTrustedPersonAssetNodes(
    indirectNodes,
    indirectEdges,
    {},
  );
  assert.equal(upgraded.nodes.length, 4);
  assert.ok(upgraded.edges.some((edge) => edge.id === "face-image"));
  assert.ok(upgraded.edges.some((edge) => edge.id === "image-video"));
  assert.ok(
    upgraded.edges.some(
      (edge) =>
        edge.source === "runtime-trusted-person-face-video" &&
        edge.target === "video" &&
        edge.targetHandle === "trusted_person_asset_1",
    ),
  );
});

test("does not duplicate an explicit trusted asset route", () => {
  const explicitNodes = [
    { id: "face", data: { kind: "face-input" } },
    { id: "asset", data: { kind: "asset", provider: "volcengine" } },
    {
      id: "video",
      data: { kind: "video", model: "doubao-seedance-2-0-260128" },
    },
  ];
  const explicitEdges = [
    { id: "face-asset", source: "face", target: "asset" },
    {
      id: "asset-video",
      source: "asset",
      target: "video",
      targetHandle: "trusted_person_asset_1",
    },
  ];
  const upgraded = injectTrustedPersonAssetNodes(
    explicitNodes,
    explicitEdges,
    {},
  );
  assert.equal(upgraded.nodes.length, 3);
  assert.equal(upgraded.edges.length, 2);
});

test("rerunning a downstream image keeps its required trusted asset conversion step", () => {
  const graphNodes = [
    { id: "image", data: { kind: "image" } },
    { id: "asset", data: { kind: "asset", provider: "volcengine" } },
    {
      id: "video",
      data: { kind: "video", model: "doubao-seedance-2-0-260128" },
    },
  ];
  const graphEdges = [
    { source: "image", target: "video" },
    {
      source: "asset",
      target: "video",
      targetHandle: "trusted_person_asset_1",
    },
  ];
  assert.deepEqual(
    [
      ...includeRequiredTrustedPersonAssets(
        graphNodes,
        graphEdges,
        new Set(["image", "video"]),
      ),
    ].sort(),
    ["asset", "image", "video"],
  );
});

test("deduplicates repeated trusted-person assets before Seedance submission", () => {
  assert.deepEqual(
    uniqueTrustedAssetUris(
      [
        { type: "asset", uri: "asset-same" },
        { type: "asset", uri: "asset-same" },
        { type: "asset", uri: "asset-other" },
        { type: "image", uri: "asset-ignored" },
      ],
      true,
    ),
    [
      { label: "reference_image", uri: "asset-same" },
      { label: "reference_image", uri: "asset-other" },
    ],
  );
});

