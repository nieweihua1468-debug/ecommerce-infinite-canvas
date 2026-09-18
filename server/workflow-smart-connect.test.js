import test from "node:test";
import assert from "node:assert/strict";

import { smartConnectionCandidates } from "../shared/workflow-smart-connect.js";

const node = (id, inputs = [], outputs = []) => ({
  id,
  data: { inputs, outputs },
});

test("smart connection prefers an exact port when dragging forward", () => {
  const source = node("image-source", [], [
    { id: "image", type: "IMAGE" },
  ]);
  const target = node(
    "output",
    [
      { id: "video", type: "VIDEO" },
      { id: "image", type: "IMAGE" },
      { id: "media", type: "ANY" },
    ],
    [],
  );

  assert.deepEqual(
    smartConnectionCandidates(
      source,
      { id: "image", type: "source" },
      target,
    )[0],
    {
      source: "image-source",
      sourceHandle: "image",
      target: "output",
      targetHandle: "image",
    },
  );
});

test("smart connection prefers the unified generation input for media", () => {
  const source = node("material", [], [{ id: "asset", type: "IMAGE" }]);
  const target = node(
    "generator",
    [
      { id: "generation_input", type: "ANY" },
      { id: "prompt", type: "TEXT" },
      { id: "image_1", type: "IMAGE" },
    ],
    [],
  );

  assert.equal(
    smartConnectionCandidates(
      source,
      { id: "asset", type: "source" },
      target,
    )[0].targetHandle,
    "generation_input",
  );
});

test("smart connection keeps reverse drags directional", () => {
  const target = node(
    "video",
    [{ id: "prompt", type: "TEXT" }],
    [{ id: "video", type: "VIDEO" }],
  );
  const source = node("writer", [], [{ id: "prompt", type: "TEXT" }]);

  assert.deepEqual(
    smartConnectionCandidates(
      target,
      { id: "prompt", type: "target" },
      source,
    )[0],
    {
      source: "writer",
      sourceHandle: "prompt",
      target: "video",
      targetHandle: "prompt",
    },
  );
});

test("smart connection rejects the same node and missing handles", () => {
  const item = node(
    "same",
    [{ id: "input", type: "ANY" }],
    [{ id: "output", type: "ANY" }],
  );
  assert.deepEqual(
    smartConnectionCandidates(
      item,
      { id: "output", type: "source" },
      item,
    ),
    [],
  );
  assert.deepEqual(
    smartConnectionCandidates(
      item,
      { id: "missing", type: "source" },
      node("other", [{ id: "input", type: "ANY" }], []),
    ),
    [],
  );
});

