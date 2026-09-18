const GENERATION_NODE_KINDS = new Set([
  "text",
  "media-analysis",
  "image",
  "video",
  "audio-generation",
]);

const nodeKind = (node) => String(node?.data?.kind || "");

/**
 * Finds the reference relationship that should be emphasized for one selected
 * canvas node. Generators reveal every upstream dependency; material and
 * utility nodes reveal their downstream route until the first generator.
 */
export function workflowReferencePath(nodes = [], edges = [], selectedId = "") {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selected = nodeById.get(selectedId);
  if (!selected) return { edgeIds: new Set(), nodeIds: new Set() };

  const edgeIds = new Set();
  const nodeIds = new Set([selectedId]);
  const visited = new Set([selectedId]);
  const queue = [selectedId];
  const backwards = GENERATION_NODE_KINDS.has(nodeKind(selected));
  const linkedEdgesByNode = new Map();

  edges.forEach((edge) => {
    const linkedNodeId = backwards ? edge.target : edge.source;
    if (!linkedEdgesByNode.has(linkedNodeId))
      linkedEdgesByNode.set(linkedNodeId, []);
    linkedEdgesByNode.get(linkedNodeId).push(edge);
  });

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const currentId = queue[queueIndex];
    const linkedEdges = linkedEdgesByNode.get(currentId) || [];
    linkedEdges.forEach((edge) => {
      const nextId = backwards ? edge.source : edge.target;
      const nextNode = nodeById.get(nextId);
      if (!nextNode) return;
      edgeIds.add(edge.id);
      nodeIds.add(nextId);
      if (visited.has(nextId)) return;
      visited.add(nextId);
      if (!backwards && GENERATION_NODE_KINDS.has(nodeKind(nextNode))) return;
      queue.push(nextId);
    });
  }

  return { edgeIds, nodeIds };
}

