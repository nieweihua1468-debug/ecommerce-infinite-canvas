const SEEDANCE_MODELS = new Set([
  "doubao-seedance-2-0-fast",
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-0-fast-260128",
]);
const isSeedanceModel = (model) => SEEDANCE_MODELS.has(String(model || ""));

export function mergeTrustedPersonGroupIds(
  runtimeAssetGroupIds = {},
  legacyTrustedPersonGroupIds = {},
) {
  return {
    ...(legacyTrustedPersonGroupIds || {}),
    ...(runtimeAssetGroupIds || {}),
  };
}

export function resolveWorkflowAssetUri({
  runtimeUri = "",
  nodeUri = "",
  provider = "kling",
  klingElementId = "",
} = {}) {
  return String(
    runtimeUri ||
      nodeUri ||
      (String(provider || "kling") === "kling" ? klingElementId : "") ||
      "",
  ).trim();
}

export function hasDirectSeedanceFaceConnection(nodes, edges) {
  const nodeById = new Map((nodes || []).map((node) => [node.id, node]));
  return (edges || []).some(
    (edge) =>
      ["face-input", "person-video-input"].includes(
        nodeById.get(edge.source)?.data?.kind,
      ) &&
      nodeById.get(edge.target)?.data?.kind === "video" &&
      isSeedanceModel(nodeById.get(edge.target)?.data?.model),
  );
}

export function uniqueTrustedAssetUris(values, isSeedance = false) {
  const seen = new Set();
  return (values || [])
    .filter(
      (value) =>
        value?.type === "asset" &&
        value.uri &&
        !seen.has(String(value.uri)) &&
        seen.add(String(value.uri)),
    )
    .map((value, index) => ({
      label: isSeedance ? "reference_image" : `element_${index + 1}`,
      uri: value.uri,
    }));
}

export function injectTrustedPersonAssetNodes(
  nodes,
  edges,
  trustedPersonGroupIds = {},
) {
  const nodeById = new Map((nodes || []).map((node) => [node.id, node]));
  const nextNodes = [...(nodes || [])];
  const directEdges = new Map();
  const nextEdges = (edges || []).filter((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const direct =
      ["face-input", "person-video-input"].includes(source?.data?.kind) &&
      target?.data?.kind === "video" &&
      isSeedanceModel(target.data.model);
    if (direct) directEdges.set(`${edge.source}:${edge.target}`, edge);
    return !direct;
  });
  const runtimeAssetGroupIds = {};

  const reachableFrom = (sourceId, graphEdges = edges || []) => {
    const visited = new Set([sourceId]);
    const queue = [sourceId];
    while (queue.length) {
      const current = queue.shift();
      for (const edge of graphEdges) {
        if (edge.source !== current || visited.has(edge.target)) continue;
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
    return visited;
  };
  const usedSlots = new Map();
  for (const edge of nextEdges) {
    const match = /^trusted_person_asset_(\d+)$/.exec(
      String(edge.targetHandle || ""),
    );
    if (!match) continue;
    usedSlots.set(
      edge.target,
      new Set([...(usedSlots.get(edge.target) || []), Number(match[1])]),
    );
  }
  const nextSlot = (targetId, preferredHandle = "") => {
    const used = usedSlots.get(targetId) || new Set();
    const preferred = Number(
      /^trusted_person_asset_(\d+)$/.exec(String(preferredHandle))?.[1] || 0,
    );
    let index = preferred && !used.has(preferred) ? preferred : 1;
    while (used.has(index)) index += 1;
    used.add(index);
    usedSlots.set(targetId, used);
    return `trusted_person_asset_${index}`;
  };
  const trustedSources = nextNodes.filter((node) =>
    ["face-input", "person-video-input"].includes(node.data?.kind),
  );
  const seedanceTargets = nextNodes.filter(
    (node) => node.data?.kind === "video" && isSeedanceModel(node.data.model),
  );

  for (const source of trustedSources) {
    const originalReachable = reachableFrom(source.id);
    for (const target of seedanceTargets) {
      if (!originalReachable.has(target.id)) continue;
      const directEdge = directEdges.get(`${source.id}:${target.id}`);
      const currentReachable = reachableFrom(source.id, nextEdges);
      const hasTrustedRoute = nextEdges.some(
        (edge) =>
          edge.target === target.id &&
          nodeById.get(edge.source)?.data?.kind === "asset" &&
          currentReachable.has(edge.source),
      );
      if (hasTrustedRoute) continue;

      const groupId = String(trustedPersonGroupIds?.[source.id] || "").trim();
      const assetNodeId = `runtime-trusted-person-${source.id}-${target.id}`;
      if (!nodeById.has(assetNodeId)) {
        const assetNode = {
          id: assetNodeId,
          type: "studio",
          position: { x: 0, y: 0 },
          data: {
            kind: "asset",
            provider: "volcengine",
            title: `${source.data.title || "真人素材"} · 自动认证资产`,
            subtitle: "后台自动建组 · 等待 Active",
            assetMethod:
              source.data.kind === "person-video-input"
                ? "person-video"
                : "face-image",
            groupId,
            status: "ready",
            inputs:
              source.data.kind === "person-video-input"
                ? [{ id: "video", label: "同一真人视频", type: "VIDEO" }]
                : [{ id: "image", label: "真人图片", type: "IMAGE" }],
            outputs: [
              { id: "asset_uri", label: "已认证真人资产", type: "ASSET_URI" },
            ],
          },
        };
        nextNodes.push(assetNode);
        nodeById.set(assetNodeId, assetNode);
      }
      if (groupId) runtimeAssetGroupIds[assetNodeId] = groupId;
      nextEdges.push(
        {
          ...(directEdge || {}),
          id: `${directEdge?.id || assetNodeId}-trusted-source`,
          source: source.id,
          sourceHandle:
            source.data.kind === "person-video-input" ? "person_video" : "face",
          target: assetNodeId,
          targetHandle:
            source.data.kind === "person-video-input" ? "video" : "image",
        },
        {
          ...(directEdge || {}),
          id: `${directEdge?.id || assetNodeId}-trusted-asset`,
          source: assetNodeId,
          sourceHandle: "asset_uri",
          target: target.id,
          targetHandle: nextSlot(target.id, directEdge?.targetHandle),
        },
      );
    }
  }
  return { nodes: nextNodes, edges: nextEdges, runtimeAssetGroupIds };
}

export function includeRequiredTrustedPersonAssets(
  nodes,
  edges,
  selectedNodeIds,
) {
  const expanded = new Set(selectedNodeIds || []);
  const nodeById = new Map((nodes || []).map((node) => [node.id, node]));
  for (const edge of edges || []) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source?.data?.kind !== "asset" || source.data.provider !== "volcengine")
      continue;
    if (target?.data?.kind !== "video" || !isSeedanceModel(target.data.model))
      continue;
    if (expanded.has(target.id)) expanded.add(source.id);
  }
  return expanded;
}

