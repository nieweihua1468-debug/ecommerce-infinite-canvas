import test from "node:test";
import assert from "node:assert/strict";

import { workflowReferencePath } from "../shared/workflow-reference-path.js";

const node = (id, kind) => ({ id, data: { kind } });
const edge = (id, source, target) => ({ id, source, target });

test("selecting a generator reveals every upstream reference path", () => {
  const result = workflowReferencePath(
    [
      node("brief", "input"),
      node("writer", "text"),
      node("photo", "input"),
      node("generator", "image"),
    ],
    [
      edge("brief-writer", "brief", "writer"),
      edge("writer-generator", "writer", "generator"),
      edge("photo-generator", "photo", "generator"),
    ],
    "generator",
  );

  assert.deepEqual(
    [...result.edgeIds].sort(),
    ["brief-writer", "photo-generator", "writer-generator"],
  );
  assert.deepEqual(
    [...result.nodeIds].sort(),
    ["brief", "generator", "photo", "writer"],
  );
});
test("selecting material stops its feedback route at the first generator", () => {
  const result = workflowReferencePath(
    [
      node("material", "input"),
      node("generator", "image"),
      node("result", "output"),
    ],
    [
      edge("material-generator", "material", "generator"),
      edge("generator-result", "generator", "result"),
    ],
    "material",
  );

  assert.deepEqual([...result.edgeIds], ["material-generator"]);
  assert.deepEqual([...result.nodeIds].sort(), ["generator", "material"]);
});

test("reference path lookup is safe for missing selections and graph cycles", () => {
  assert.equal(workflowReferencePath([], [], "missing").edgeIds.size, 0);
  const result = workflowReferencePath(
    [node("a", "input"), node("b", "utility")],
    [edge("a-b", "a", "b"), edge("b-a", "b", "a")],
    "a",
  );
  assert.deepEqual([...result.edgeIds].sort(), ["a-b", "b-a"]);
});

