function nodeHeight(node) {
  const previewHeight = node?.data?.runtimePreviews?.length
    ? node.data.aspectRatio === '16:9' ? 260 : node.data.aspectRatio === '1:1' ? 340 : 500
    : 0;
  return Math.max(Number(node?.measured?.height || node?.height) || 150, previewHeight);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.POSITIVE_INFINITY;
}

export function mindMapLayout(nodes = [], edges = [], options = {}) {
  if (!nodes.length) return new Map();
  const horizontalGap = Number(options.horizontalGap) || 390;
  const verticalGap = Number(options.verticalGap) || 58;
  const originX = Number(options.originX) || 70;
  const originY = Number(options.originY) || 70;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const originalOrder = new Map([...nodes].sort((left, right) => (left.position?.y || 0) - (right.position?.y || 0) || (left.position?.x || 0) - (right.position?.x || 0)).map((node, index) => [node.id, index]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target) || edge.source === edge.target) continue;
    if (outgoing.get(edge.source).some((item) => item.target === edge.target && item.targetHandle === edge.targetHandle)) continue;
    outgoing.get(edge.source).push(edge);
    incoming.get(edge.target).push(edge);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).sort((left, right) => originalOrder.get(left.id) - originalOrder.get(right.id)).map((node) => node.id);
  const levels = new Map(queue.map((id) => [id, 0]));
  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    const sourceLevel = levels.get(source) || 0;
    for (const edge of outgoing.get(source)) {
      levels.set(edge.target, Math.max(levels.get(edge.target) || 0, sourceLevel + 1));
      indegree.set(edge.target, indegree.get(edge.target) - 1);
      if (indegree.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  nodes.forEach((node) => { if (!levels.has(node.id)) levels.set(node.id, 0); });
  const layers = [];
  nodes.forEach((node) => {
    const level = levels.get(node.id);
    if (!layers[level]) layers[level] = [];
    layers[level].push(node.id);
  });
  layers.forEach((layer) => layer?.sort((left, right) => originalOrder.get(left) - originalOrder.get(right)));

  const reorder = (layerIndex, neighborIndex, edgeMap, edgeKey) => {
    const layer = layers[layerIndex] || [];
    const neighborPositions = new Map((layers[neighborIndex] || []).map((id, index) => [id, index]));
    layer.sort((left, right) => {
      const leftCenter = average((edgeMap.get(left) || []).map((edge) => neighborPositions.get(edge[edgeKey])).filter(Number.isFinite));
      const rightCenter = average((edgeMap.get(right) || []).map((edge) => neighborPositions.get(edge[edgeKey])).filter(Number.isFinite));
      if (Number.isFinite(leftCenter) && Number.isFinite(rightCenter) && leftCenter !== rightCenter) return leftCenter - rightCenter;
      if (Number.isFinite(leftCenter) !== Number.isFinite(rightCenter)) return Number.isFinite(leftCenter) ? -1 : 1;
      return originalOrder.get(left) - originalOrder.get(right);
    });
  };
  for (let pass = 0; pass < 8; pass += 1) {
    for (let level = 1; level < layers.length; level += 1) reorder(level, level - 1, incoming, 'source');
    for (let level = layers.length - 2; level >= 0; level -= 1) reorder(level, level + 1, outgoing, 'target');
  }

  const layerHeights = layers.map((layer) => (layer || []).reduce((sum, id, index) => sum + nodeHeight(byId.get(id)) + (index ? verticalGap : 0), 0));
  const canvasHeight = Math.max(...layerHeights, 0);
  const positions = new Map();
  layers.forEach((layer, level) => {
    let y = originY + (canvasHeight - layerHeights[level]) / 2;
    (layer || []).forEach((id) => {
      positions.set(id, { x: originX + level * horizontalGap, y: Math.round(y) });
      y += nodeHeight(byId.get(id)) + verticalGap;
    });
  });
  return positions;
}

