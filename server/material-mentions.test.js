import assert from "node:assert/strict";
import test from "node:test";
import {
  completeMaterialMention,
  materialMentionQueryAtCaret,
  orderedMaterialRefs,
  removeMaterialRef,
  swapMaterialRefs,
} from "../src/material-mentions.js";

test("completes a partial material mention with a typing boundary", () => {
  assert.deepEqual(completeMaterialMention("生成 @素", "@素材1", 5), {
    value: "生成 @素材1 ",
    caret: 8,
  });
});

test("finishes a repeated material selection instead of leaving its query open", () => {
  assert.deepEqual(
    completeMaterialMention("@素材1 保持人物，@素材", "@素材1", 13),
    {
      value: "@素材1 保持人物， @素材1 ",
      caret: 16,
    },
  );
});

test("clicking an existing material token creates a safe caret boundary", () => {
  assert.deepEqual(completeMaterialMention("@素材1", "@素材1", 4), {
    value: "@素材1 ",
    caret: 5,
  });
});

test("does not reopen the picker while typing after a completed token", () => {
  assert.equal(materialMentionQueryAtCaret("@素材1继续描述", 8, ["@素材1"]), null);
  assert.equal(materialMentionQueryAtCaret("继续 @素", 5, ["@素材1"]), "素");
  assert.equal(materialMentionQueryAtCaret("继续 @", 4, ["@素材1"]), "");
});

const targetNode = {
  id: "generate",
  data: {
    inputs: [
      { id: "prompt", type: "TEXT" },
      { id: "image_1", type: "IMAGE" },
      { id: "image_2", type: "IMAGE" },
      { id: "image_3", type: "IMAGE" },
      { id: "reference_audio", type: "AUDIO" },
    ],
  },
};

test("orders material refs by the target input ports instead of insertion order", () => {
  const refs = [
    { id: "garment", targetHandle: "image_2", mentionIndex: 2 },
    { id: "voice", targetHandle: "reference_audio", mentionIndex: 4 },
    { id: "subject", targetHandle: "image_1", mentionIndex: 1 },
    { id: "detail", targetHandle: "image_3", mentionIndex: 3 },
  ];

  assert.deepEqual(
    orderedMaterialRefs(targetNode, refs).map((ref) => ref.id),
    ["subject", "garment", "detail", "voice"],
  );
  assert.deepEqual(
    refs.map((ref) => ref.id),
    ["garment", "voice", "subject", "detail"],
    "the caller's refs are not mutated",
  );
});

test("uses mentionIndex to order media refs without moving text inputs", () => {
  const refs = [
    { id: "prompt", targetHandle: "prompt" },
    { id: "subject", targetHandle: "image_1", mentionIndex: 2 },
    { id: "garment", targetHandle: "image_2", mentionIndex: 1 },
  ];

  assert.deepEqual(
    orderedMaterialRefs(targetNode, refs).map((ref) => ref.id),
    ["prompt", "garment", "subject"],
  );
});

test("orders and swaps references that share one unified generation input", () => {
  const unifiedNode = {
    id: "generate",
    data: {
      inputs: [
        { id: "generation_input", type: "ANY", multiple: true },
      ],
    },
  };
  const refs = [
    {
      id: "subject-edge",
      targetHandle: "generation_input",
      data: { mentionIndex: 1 },
    },
    {
      id: "garment-edge",
      targetHandle: "generation_input",
      data: { mentionIndex: 2 },
    },
  ];

  const swapped = swapMaterialRefs(
    unifiedNode,
    refs,
    "subject-edge",
    "garment-edge",
  );

  assert.deepEqual(
    swapped.map((ref) => [ref.id, ref.targetHandle, ref.data.mentionIndex]),
    [
      ["garment-edge", "generation_input", 1],
      ["subject-edge", "generation_input", 2],
    ],
  );
  assert.deepEqual(removeMaterialRef(unifiedNode, swapped, "garment-edge"), [
    {
      id: "subject-edge",
      targetHandle: "generation_input",
      data: { mentionIndex: 1 },
    },
  ]);
});

test("swaps targetHandle and mentionIndex as one ordering operation", () => {
  const refs = [
    {
      id: "subject-edge",
      source: "subject",
      target: "generate",
      targetHandle: "image_1",
      mentionIndex: 1,
    },
    {
      id: "garment-edge",
      source: "garment",
      target: "generate",
      targetHandle: "image_2",
      mentionIndex: 2,
    },
  ];

  const swapped = swapMaterialRefs(
    targetNode,
    refs,
    "subject-edge",
    "garment-edge",
  );

  assert.deepEqual(
    swapped.map(({ id, targetHandle, mentionIndex }) => ({
      id,
      targetHandle,
      mentionIndex,
    })),
    [
      { id: "garment-edge", targetHandle: "image_1", mentionIndex: 1 },
      { id: "subject-edge", targetHandle: "image_2", mentionIndex: 2 },
    ],
  );
  assert.equal(refs[0].targetHandle, "image_1");
  assert.equal(refs[0].mentionIndex, 1);
});

test("also swaps ordinary edge refs that do not yet carry mentionIndex", () => {
  const swapped = swapMaterialRefs(
    targetNode,
    [
      { id: "edge-a", targetHandle: "image_1" },
      { id: "edge-b", targetHandle: "image_2" },
    ],
    "edge-a",
    "edge-b",
  );

  assert.deepEqual(
    swapped.map(({ id, targetHandle }) => ({ id, targetHandle })),
    [
      { id: "edge-b", targetHandle: "image_1" },
      { id: "edge-a", targetHandle: "image_2" },
    ],
  );
});

test("reads and swaps React Flow edge data.mentionIndex", () => {
  const refs = [
    {
      id: "subject-edge",
      source: "subject",
      target: "generate",
      targetHandle: "image_1",
      data: { mentionIndex: 1, materialId: "subject" },
    },
    {
      id: "garment-edge",
      source: "garment",
      target: "generate",
      targetHandle: "image_2",
      data: { mentionIndex: 2, materialId: "garment" },
    },
  ];

  const swapped = swapMaterialRefs(
    targetNode,
    refs,
    "subject-edge",
    "garment-edge",
  );

  assert.deepEqual(
    swapped.map((ref) => ({
      id: ref.id,
      targetHandle: ref.targetHandle,
      mentionIndex: ref.data.mentionIndex,
    })),
    [
      { id: "garment-edge", targetHandle: "image_1", mentionIndex: 1 },
      { id: "subject-edge", targetHandle: "image_2", mentionIndex: 2 },
    ],
  );
  assert.equal(refs[0].data.mentionIndex, 1, "nested data stays immutable");
});

test("removes one ref and compacts remaining runtime slots", () => {
  const refs = [
    { id: "first", targetHandle: "image_1", mentionIndex: 1 },
    { id: "second", targetHandle: "image_2", mentionIndex: 2 },
    { id: "third", targetHandle: "image_3", mentionIndex: 3 },
  ];

  assert.deepEqual(removeMaterialRef(targetNode, refs, "second"), [
    { id: "first", targetHandle: "image_1", mentionIndex: 1 },
    { id: "third", targetHandle: "image_2", mentionIndex: 2 },
  ]);
});

test("missing swap/remove ids are safe deterministic no-ops", () => {
  const refs = [
    { id: "second", targetHandle: "image_2", mentionIndex: 2 },
    { id: "first", targetHandle: "image_1", mentionIndex: 1 },
  ];

  assert.deepEqual(
    swapMaterialRefs(targetNode, refs, "missing", "first").map(
      (ref) => ref.id,
    ),
    ["first", "second"],
  );
  assert.deepEqual(
    removeMaterialRef(targetNode, refs, "missing").map((ref) => ref.id),
    ["first", "second"],
  );
});

