import { stripWorkflowResultNodes } from "./workflow-result-nodes.js";

const clonePlain = (value) =>
  value == null ? value : JSON.parse(JSON.stringify(value));

const compactId = (value) =>
  String(value || "template")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "template";

function cleanTemplateNodeData(data = {}, template = {}) {
  const next = clonePlain(data) || {};
  [
    "runtimeRunStatus",
    "runtimeRunId",
    "runtimeResultNode",
    "runtimeSourceNodeId",
    "runtimeResultIndex",
    "runtimeResultCount",
    "runtimeText",
    "runtimeAudioUrl",
    "runtimePreviews",
    "runtimeFileCount",
  ].forEach((key) => delete next[key]);
  next.importedTemplateId = String(template.id || "");
  next.importedTemplateName = String(template.name || "团队工作流");
  return next;
}

/**
 * Copy a saved template graph into an existing canvas without mutating either
 * graph. Runtime result nodes are intentionally excluded; the copied
 * generation nodes will create their own result nodes when they run.
 */
export function copyTemplateGraphToCanvas({
  template = {},
  existingNodeIds = [],
  dropPosition = { x: 0, y: 0 },
  importKey = Date.now().toString(36),
} = {}) {
  const stripped = stripWorkflowResultNodes(
    Array.isArray(template.nodes) ? template.nodes : [],
    Array.isArray(template.edges) ? template.edges : [],
  );
  if (!stripped.nodes.length) return { nodes: [], edges: [], idMap: {} };

  const minX = Math.min(
    ...stripped.nodes.map((node) => Number(node.position?.x || 0)),
  );
  const minY = Math.min(
    ...stripped.nodes.map((node) => Number(node.position?.y || 0)),
  );
  const usedIds = new Set(existingNodeIds.map((id) => String(id)));
  const idMap = {};
  const prefix = `template-${compactId(template.id || template.name)}-${compactId(importKey)}`;

  stripped.nodes.forEach((node, index) => {
    const baseId = `${prefix}-${compactId(node.id || index + 1)}`;
    let nextId = baseId;
    let suffix = 2;
    while (usedIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(nextId);
    idMap[node.id] = nextId;
  });

  const nodes = stripped.nodes.map((node) => {
    const cloned = clonePlain(node) || {};
    delete cloned.measured;
    delete cloned.positionAbsolute;
    delete cloned.dragging;
    return {
      ...cloned,
      id: idMap[node.id],
      type: node.type || "studio",
      position: {
        x:
          Number(dropPosition.x || 0) +
          Number(node.position?.x || 0) -
          minX,
        y:
          Number(dropPosition.y || 0) +
          Number(node.position?.y || 0) -
          minY,
      },
      selected: false,
      data: cleanTemplateNodeData(node.data, template),
    };
  });

  const edges = stripped.edges
    .filter((edge) => idMap[edge.source] && idMap[edge.target])
    .map((edge, index) => ({
      ...(clonePlain(edge) || {}),
      id: `${prefix}-edge-${index + 1}`,
      source: idMap[edge.source],
      target: idMap[edge.target],
      selected: false,
    }));

  return { nodes, edges, idMap };
}

