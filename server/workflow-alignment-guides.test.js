import test from "node:test";
import assert from "node:assert/strict";
import { alignmentGuidesForNode } from "../shared/workflow-alignment-guides.js";

test("finds vertical and horizontal node alignment guides", () => {
  const result = alignmentGuidesForNode(
    {
      id: "moving",
      position: { x: 101, y: 199 },
      measured: { width: 220, height: 64 },
    },
    [
      {
        id: "target",
        position: { x: 100, y: 200 },
        measured: { width: 220, height: 64 },
      },
    ],
    { threshold: 4 },
  );
  assert.equal(result.vertical.x, 100);
  assert.equal(result.vertical.targetId, "target");
  assert.equal(result.horizontal.y, 200);
  assert.equal(result.horizontal.targetId, "target");
});

test("does not show a guide outside the snap threshold", () => {
  const result = alignmentGuidesForNode(
    { id: "moving", position: { x: 30, y: 30 }, width: 220, height: 64 },
    [{ id: "target", position: { x: 400, y: 300 }, width: 220, height: 64 }],
    { threshold: 5 },
  );
  assert.equal(result.vertical, null);
  assert.equal(result.horizontal, null);
});

