export const WORKFLOW_STEP_KINDS = new Set(['text', 'media-analysis', 'text-preview', 'image', 'audio-generation', 'asset', 'video']);

export function normalizeVideoAspectRatio(value = '16:9') {
  const ratio = String(value || '16:9');
  if (['9:16', '1:2', '2:3', '3:4', '4:5'].includes(ratio)) return '9:16';
  if (['16:9', '2:1', '3:2', '4:3', '5:4'].includes(ratio)) return '16:9';
  return ratio;
}

export function workflowMentionIndex(edge) {
  const value = edge?.data?.mentionIndex;
  if (value === undefined || value === null || value === '') return null;
  const index = Number(value);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

export function workflowEdgeMaterialMetadata(edge) {
  const mentionIndex = workflowMentionIndex(edge);
  const materialId = String(edge?.data?.materialId || '').trim();
  const materialLabel = String(edge?.data?.materialLabel || '').trim();
  return {
    ...(materialId ? { materialId } : {}),
    ...(materialLabel ? { materialLabel } : {}),
    ...(mentionIndex !== null ? { mentionIndex } : {}),
  };
}

export function orderedIncomingEdges(nodes = [], edges = [], nodeId) {
  const node = nodes.find((item) => item.id === nodeId);
  const inputs = node?.data?.inputs || [];
  const portOrder = new Map(inputs.map((port, index) => [port.id, index]));
  const portType = new Map(
    inputs.map((port) => [port.id, String(port.type || '').toUpperCase()]),
  );
  const ordered = edges.filter((edge) => edge.target === nodeId).sort((left, right) => {
    const leftOrder = portOrder.has(left.targetHandle) ? portOrder.get(left.targetHandle) : Number.MAX_SAFE_INTEGER;
    const rightOrder = portOrder.has(right.targetHandle) ? portOrder.get(right.targetHandle) : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
  const isMediaEdge = (edge) =>
    workflowMentionIndex(edge) !== null ||
    ['IMAGE', 'VIDEO', 'AUDIO', 'MEDIA'].includes(portType.get(edge.targetHandle));
  const mediaPositions = ordered
    .map((edge, index) => (isMediaEdge(edge) ? index : -1))
    .filter((index) => index >= 0);
  if (mediaPositions.length < 2) return ordered;
  const legacyOrder = new Map(ordered.map((edge, index) => [edge, index]));
  const mediaEdges = mediaPositions
    .map((index) => ordered[index])
    .sort((left, right) => {
      const leftMention = workflowMentionIndex(left);
      const rightMention = workflowMentionIndex(right);
      if (leftMention !== null && rightMention !== null)
        return leftMention - rightMention || legacyOrder.get(left) - legacyOrder.get(right);
      if (leftMention !== null) return -1;
      if (rightMention !== null) return 1;
      return legacyOrder.get(left) - legacyOrder.get(right);
    });
  mediaPositions.forEach((position, index) => {
    ordered[position] = mediaEdges[index];
  });
  return ordered;
}

export function orderedWorkflowNodes(nodes = [], edges = []) {
  const comparePosition = (left, right) =>
    Number(left?.position?.x || 0) - Number(right?.position?.x || 0) ||
    Number(left?.position?.y || 0) - Number(right?.position?.y || 0) ||
    String(left?.id || "").localeCompare(String(right?.id || ""));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    if (incoming.has(edge.target)) incoming.set(edge.target, incoming.get(edge.target) + 1);
    if (outgoing.has(edge.source)) outgoing.get(edge.source).push(edge.target);
  });
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).sort(comparePosition);
  const ordered = [];
  while (queue.length) {
    const node = queue.shift();
    if (!node || ordered.some((item) => item.id === node.id)) continue;
    ordered.push(node);
    for (const target of outgoing.get(node.id) || []) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) queue.push(nodes.find((item) => item.id === target));
    }
    queue.sort(comparePosition);
  }
  return [...ordered, ...nodes.filter((node) => !ordered.some((item) => item.id === node.id))];
}

export function reachableWorkflowNodes(nodes, edges, targetId) {
  const reachable = new Set(targetId ? [targetId] : nodes.map((node) => node.id));
  const stack = targetId ? [targetId] : [];
  while (stack.length) {
    const current = stack.pop();
    edges.filter((edge) => edge.target === current).forEach((edge) => {
      if (!reachable.has(edge.source)) { reachable.add(edge.source); stack.push(edge.source); }
    });
  }
  return reachable;
}

export function downstreamWorkflowNodeIds(nodes = [], edges = [], startId = "") {
  if (!startId || !nodes.some((node) => node.id === startId)) return new Set();
  const downstream = new Set([startId]);
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop();
    edges
      .filter((edge) => edge.source === current)
      .forEach((edge) => {
        if (downstream.has(edge.target)) return;
        downstream.add(edge.target);
        stack.push(edge.target);
      });
  }
  return downstream;
}

export function terminalWorkflowExecutionNodeIds(nodes = [], edges = []) {
  const executable = nodes.filter((node) =>
    WORKFLOW_STEP_KINDS.has(node.data?.kind),
  );
  const executableIds = new Set(executable.map((node) => node.id));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => outgoing.get(edge.source)?.push(edge.target));
  const reachesOtherExecutionNode = (startId) => {
    const seen = new Set([startId]);
    const stack = [...(outgoing.get(startId) || [])];
    while (stack.length) {
      const current = stack.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      if (executableIds.has(current)) return true;
      stack.push(...(outgoing.get(current) || []));
    }
    return false;
  };
  const leaves = executable.filter(
    (node) => !reachesOtherExecutionNode(node.id),
  );
  const generatedLeaves = leaves.filter((node) =>
    ["image", "audio-generation", "video"].includes(node.data?.kind),
  );
  return (generatedLeaves.length ? generatedLeaves : leaves).map(
    (node) => node.id,
  );
}

export function reachableWorkflowExecutionNodes(nodes = [], edges = [], terminalId = "") {
  const terminalIds = [
    ...(Array.isArray(terminalId) ? terminalId : [terminalId]),
    ...nodes
      .filter((node) => node.data?.kind === "text-preview")
      .map((node) => node.id),
  ].filter(Boolean);
  const reachable = new Set();
  terminalIds.forEach((nodeId) =>
    reachableWorkflowNodes(nodes, edges, nodeId).forEach((id) =>
      reachable.add(id),
    ),
  );
  return reachable;
}

