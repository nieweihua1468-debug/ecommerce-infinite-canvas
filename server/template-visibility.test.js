import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPrivateTemplateCopy,
  privateTemplateCopyName,
  templateVisibilityScope,
} from "../shared/template-visibility.js";

test("templateVisibilityScope keeps public and private templates separate", () => {
  assert.equal(templateVisibilityScope({ visibility: "private" }), "private");
  assert.equal(templateVisibilityScope({ visibility: "team" }), "team");
  assert.equal(templateVisibilityScope({ visibility: "global" }), "team");
  assert.equal(templateVisibilityScope({ public: true }), "team");
  assert.equal(templateVisibilityScope({ id: "builtin-demo" }), "team");
});

test("privateTemplateCopyName appends one normalized template suffix", () => {
  assert.equal(privateTemplateCopyName("可灵标准流程"), "可灵标准流程模板");
  assert.equal(privateTemplateCopyName("口播模板"), "口播模板");
  assert.equal(privateTemplateCopyName("口播模版"), "口播模板");
});

test("buildPrivateTemplateCopy always creates a private source-linked payload", () => {
  const source = {
    id: "public-1",
    name: "换装口播",
    visibility: "global",
    revision: 3,
    nodes: [{ id: "input-1" }],
    edges: [{ id: "edge-1" }],
  };
  const copy = buildPrivateTemplateCopy(source);
  assert.equal(copy.name, "换装口播模板");
  assert.equal(copy.visibility, "private");
  assert.equal(copy.public, false);
  assert.equal(copy.sourceTemplateId, "public-1");
  assert.equal(copy.sourceTemplateRevision, 3);
  assert.deepEqual(copy.nodes, source.nodes);
  assert.deepEqual(copy.edges, source.edges);
});

