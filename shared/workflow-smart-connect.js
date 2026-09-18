const ANY_PORT_TYPE = "ANY";

function portMatchScore(sourcePort, targetPort) {
  if (!sourcePort || !targetPort) return Number.POSITIVE_INFINITY;
  if (
    targetPort.id === "generation_input" &&
    ["ANY", "IMAGE", "VIDEO"].includes(sourcePort.type)
  )
    return 0;
  if (
    sourcePort.type === targetPort.type &&
    sourcePort.type !== ANY_PORT_TYPE
  )
    return 1;
  if (targetPort.id === "generation_input") return 2;
  if (targetPort.type === ANY_PORT_TYPE && sourcePort.type !== ANY_PORT_TYPE)
    return 3;
  if (sourcePort.type === ANY_PORT_TYPE && targetPort.type !== ANY_PORT_TYPE)
    return 4;
  if (
    sourcePort.type === ANY_PORT_TYPE ||
    targetPort.type === ANY_PORT_TYPE
  )
    return 5;
  return 100;
}

function rankedPortPairs(sourcePorts, targetPorts) {
  return sourcePorts
    .flatMap((sourcePort, sourceIndex) =>
      targetPorts.map((targetPort, targetIndex) => ({
        sourcePort,
        targetPort,
        sourceIndex,
        targetIndex,
        score: portMatchScore(sourcePort, targetPort),
      })),
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.sourceIndex - right.sourceIndex ||
        left.targetIndex - right.targetIndex,
    );
}

/**
 * Returns candidate connections in semantic priority order when a connection
 * is dropped on a node card instead of a precise handle. The caller remains
 * responsible for applying workflow-specific validation (limits, cycles, and
 * provider capabilities) and should use the first valid candidate.
 */
export function smartConnectionCandidates(fromNode, fromHandle, dropNode) {
  if (
    !fromNode?.id ||
    !dropNode?.id ||
    fromNode.id === dropNode.id ||
    !fromHandle?.id ||
    !["source", "target"].includes(fromHandle.type)
  )
    return [];

  if (fromHandle.type === "source") {
    const sourcePort = (fromNode.data?.outputs || []).find(
      (port) => port.id === fromHandle.id,
    );
    if (!sourcePort) return [];
    return rankedPortPairs([sourcePort], dropNode.data?.inputs || []).map(
      ({ sourcePort: source, targetPort: target }) => ({
        source: fromNode.id,
        sourceHandle: source.id,
        target: dropNode.id,
        targetHandle: target.id,
      }),
    );
  }

  const targetPort = (fromNode.data?.inputs || []).find(
    (port) => port.id === fromHandle.id,
  );
  if (!targetPort) return [];
  return rankedPortPairs(dropNode.data?.outputs || [], [targetPort]).map(
    ({ sourcePort: source, targetPort: target }) => ({
      source: dropNode.id,
      sourceHandle: source.id,
      target: fromNode.id,
      targetHandle: target.id,
    }),
  );
}

