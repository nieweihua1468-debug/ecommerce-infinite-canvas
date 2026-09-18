import test from "node:test";
import assert from "node:assert/strict";

import { copyTemplateGraphToCanvas } from "../shared/workflow-template-import.js";

test("copies a public template around the drop point with new node ids", () => {
  const template = {
    id: "public-lookbook",
    name: "公开穿搭模板",
    nodes: [
      {
        id: "input",
        type: "studio",
        position: { x: 100, y: 80 },
        data: { kind: "input", title: "主图" },
      },
      {
        id: "image",
        type: "studio",
        position: { x: 420, y: 180 },
        data: {
          kind: "image",
          title: "图片生成",
          runtimeRunStatus: "succeeded",
          runtimePreviews: [{ kind: "image", url: "/generated/a.png" }],
        },
      },
      {
        id: "result",
        type: "studio",
        position: { x: 740, y: 180 },
        data: { kind: "preview", runtimeResultNode: true },
      },
    ],
    edges: [
      { id: "e1", source: "input", target: "image" },
      { id: "e2", source: "image", target: "result" },
    ],
  };

  const copied = copyTemplateGraphToCanvas({
    template,
    existingNodeIds: ["input", "image"],
    dropPosition: { x: 600, y: 300 },
    importKey: "test",
  });

  assert.equal(copied.nodes.length, 2);
  assert.equal(copied.edges.length, 1);
  assert.deepEqual(copied.nodes[0].position, { x: 600, y: 300 });
  assert.deepEqual(copied.nodes[1].position, { x: 920, y: 400 });
  assert.notEqual(copied.nodes[0].id, "input");
  assert.equal(copied.edges[0].source, copied.nodes[0].id);
  assert.equal(copied.edges[0].target, copied.nodes[1].id);
  assert.equal(copied.nodes[1].data.runtimeRunStatus, undefined);
  assert.equal(copied.nodes[1].data.runtimePreviews, undefined);
  assert.equal(copied.nodes[1].data.importedTemplateId, template.id);
  assert.equal(copied.nodes[1].data.importedTemplateName, template.name);
});

