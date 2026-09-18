const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function nodeBox(node = {}) {
  const position = node.positionAbsolute || node.position || {};
  const width = finite(node.measured?.width ?? node.width, 220);
  const height = finite(node.measured?.height ?? node.height, 64);
  const left = finite(position.x);
  const top = finite(position.y);
  return {
    id: node.id,
    left,
    right: left + width,
    centerX: left + width / 2,
    top,
    bottom: top + height,
    centerY: top + height / 2,
  };
}

const closestAlignment = (dragAnchors, targetAnchors, threshold) => {
  let closest = null;
  for (const dragAnchor of dragAnchors) {
    for (const targetAnchor of targetAnchors) {
      const distance = Math.abs(dragAnchor.value - targetAnchor.value);
      if (distance > threshold || (closest && distance >= closest.distance))
        continue;
      closest = { dragAnchor, targetAnchor, distance };
    }
  }
  return closest;
};

export function alignmentGuidesForNode(
  draggedNode,
  nodes = [],
  { threshold = 6 } = {},
) {
  if (!draggedNode?.id) return { vertical: null, horizontal: null };
  const dragged = nodeBox(draggedNode);
  let vertical = null;
  let horizontal = null;

  for (const candidateNode of nodes) {
    if (!candidateNode?.id || candidateNode.id === dragged.id) continue;
    const candidate = nodeBox(candidateNode);
    const verticalMatch = closestAlignment(
      [
        { name: "left", value: dragged.left },
        { name: "center", value: dragged.centerX },
        { name: "right", value: dragged.right },
      ],
      [
        { name: "left", value: candidate.left },
        { name: "center", value: candidate.centerX },
        { name: "right", value: candidate.right },
      ],
      threshold,
    );
    if (verticalMatch && (!vertical || verticalMatch.distance < vertical.distance)) {
      vertical = {
        x: verticalMatch.targetAnchor.value,
        from: Math.min(dragged.top, candidate.top),
        to: Math.max(dragged.bottom, candidate.bottom),
        distance: verticalMatch.distance,
        targetId: candidate.id,
      };
    }

    const horizontalMatch = closestAlignment(
      [
        { name: "top", value: dragged.top },
        { name: "center", value: dragged.centerY },
        { name: "bottom", value: dragged.bottom },
      ],
      [
        { name: "top", value: candidate.top },
        { name: "center", value: candidate.centerY },
        { name: "bottom", value: candidate.bottom },
      ],
      threshold,
    );
    if (
      horizontalMatch &&
      (!horizontal || horizontalMatch.distance < horizontal.distance)
    ) {
      horizontal = {
        y: horizontalMatch.targetAnchor.value,
        from: Math.min(dragged.left, candidate.left),
        to: Math.max(dragged.right, candidate.right),
        distance: horizontalMatch.distance,
        targetId: candidate.id,
      };
    }
  }

  return { vertical, horizontal };
}

