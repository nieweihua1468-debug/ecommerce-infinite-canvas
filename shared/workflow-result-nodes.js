const GENERATED_NODE_KINDS = new Set(["image", "video", "audio-generation"]);
const ACTIVE_STATUSES = new Set(["queued", "pending", "processing", "running"]);

const compactId = (value) =>
  String(value || "runtime")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "runtime";

const uniqueUrls = (values) =>
  [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];

export function generatedResultMedia(result = {}) {
  const imageUrls = uniqueUrls([
    ...(Array.isArray(result.imageUrls) ? result.imageUrls : []),
    result.imageUrl,
  ]);
  if (imageUrls.length)
    return imageUrls.map((url, index) => ({
      kind: "image",
      url,
      name: result.fileName || `生成图片 ${index + 1}`,
    }));
  const videoUrls = uniqueUrls([
    ...(Array.isArray(result.videoUrls) ? result.videoUrls : []),
    result.videoUrl,
  ]);
  if (videoUrls.length)
    return videoUrls.map((url, index) => ({
        kind: "video",
        url,
        poster: result.coverUrl,
        name: result.fileName || `生成视频 ${index + 1}`,
      }));
  const audioUrls = uniqueUrls([
    ...(Array.isArray(result.audioUrls) ? result.audioUrls : []),
    result.audioUrl,
  ]);
  if (audioUrls.length)
    return audioUrls.map((url, index) => ({
        kind: "audio",
        url,
        name: result.fileName || `生成音频 ${index + 1}`,
      }));
  return [];
}

export function stripWorkflowResultNodes(nodes = [], edges = []) {
  const resultIds = new Set(
    nodes
      .filter((node) => node.data?.runtimeResultNode)
      .map((node) => node.id),
  );
  return {
    nodes: nodes.filter((node) => !resultIds.has(node.id)),
    edges: edges.filter(
      (edge) => !resultIds.has(edge.source) && !resultIds.has(edge.target),
    ),
  };
}

function resultNodePosition(sourceNode, index, total) {
  const sourceWidth =
    Number(sourceNode.measured?.width || sourceNode.width) ||
    (["image", "video"].includes(sourceNode.data?.kind) ? 250 : 220);
  const verticalStep = 390;
  return {
    x: Number(sourceNode.position?.x || 0) + sourceWidth + 150,
    y:
      Number(sourceNode.position?.y || 0) -
      ((Math.max(1, total) - 1) * verticalStep) / 2 +
      index * verticalStep,
  };
}

function sourceOutputHandle(sourceNode, mediaKind) {
  const mediaType = mediaKind.toUpperCase();
  return (
    (sourceNode.data?.outputs || []).find(
      (port) => port.type === mediaType || port.type === "ANY",
    )?.id || sourceNode.data?.outputs?.[0]?.id || "output"
  );
}

export function reconcileWorkflowResultNodes(
  nodes = [],
  edges = [],
  descriptors = [],
  edgeStyle,
) {
  const sourceDescriptors = (Array.isArray(descriptors) ? descriptors : [])
    .map((descriptor) => ({
      ...descriptor,
      sourceNodeId: String(
        descriptor.sourceNodeId || descriptor.nodeId || "",
      ),
    }))
    .filter((descriptor) => descriptor.sourceNodeId);
  if (!sourceDescriptors.length) return { nodes, edges };

  const sourceIds = new Set(sourceDescriptors.map((item) => item.sourceNodeId));
  const previousResultNodes = nodes.filter(
    (node) =>
      node.data?.runtimeResultNode &&
      sourceIds.has(String(node.data.runtimeSourceNodeId || "")),
  );
  const previousBySlot = new Map(
    previousResultNodes.map((node) => [
      `${node.data.runtimeSourceNodeId}:${node.data.runtimeResultIndex || 1}`,
      node,
    ]),
  );
  const removedResultIds = new Set(previousResultNodes.map((node) => node.id));
  const retainedNodes = nodes.filter((node) => !removedResultIds.has(node.id));
  const retainedEdges = edges.filter(
    (edge) =>
      !removedResultIds.has(edge.source) && !removedResultIds.has(edge.target),
  );
  const sourceById = new Map(retainedNodes.map((node) => [node.id, node]));
  const resultNodes = [];
  const resultEdges = [];

  sourceDescriptors.forEach((descriptor) => {
    const sourceNode = sourceById.get(descriptor.sourceNodeId);
    if (!sourceNode || !GENERATED_NODE_KINDS.has(sourceNode.data?.kind)) return;
    const media = generatedResultMedia(descriptor.result);
    const status = String(descriptor.status || "queued").toLowerCase();
    const expectedCount = Math.max(
      1,
      Math.min(16, Number(descriptor.expectedCount || sourceNode.data?.count || 1)),
    );
    const total = media.length || expectedCount;
    const previewKind =
      descriptor.previewKind ||
      (sourceNode.data?.kind === "video"
        ? "video"
        : sourceNode.data?.kind === "audio-generation"
          ? "audio"
          : "image");
    const displayStatus =
      ["succeeded", "completed"].includes(status) && !media.length
        ? "failed"
        : status;
    Array.from({ length: total }).forEach((_, index) => {
      const preview = media[index] || null;
      const resultNodeId = `result-${compactId(sourceNode.id)}-${index + 1}`;
      const previous = previousBySlot.get(`${sourceNode.id}:${index + 1}`);
      const mediaLabel =
        previewKind === "image"
          ? "图片结果"
          : previewKind === "video"
            ? "视频结果"
            : "音频结果";
      const active = ACTIVE_STATUSES.has(displayStatus);
      resultNodes.push({
        ...(previous || {}),
        id: resultNodeId,
        type: "studio",
        position:
          previous?.position || resultNodePosition(sourceNode, index, total),
        selected: previous?.selected || false,
        data: {
          kind: "preview",
          title: active
            ? `${mediaLabel}生成中${total > 1 ? ` ${index + 1}` : ""}`
            : total > 1
              ? `${mediaLabel} ${index + 1}`
              : mediaLabel,
          subtitle:
            displayStatus === "failed"
              ? descriptor.error || "生成失败"
              : active
                ? descriptor.progressLabel || "正在生成"
                : total > 1
                  ? `本次生成 ${index + 1} / ${total} · 点击全屏预览`
                  : "本次生成结果 · 点击全屏预览",
          previewType: preview?.kind || previewKind,
          aspectRatio: sourceNode.data?.aspectRatio || "9:16",
          inputs: [{ id: "media", label: "生成结果", type: "ANY" }],
          outputs: [{ id: "media", label: "继续传递", type: "ANY" }],
          runtimeFileCount: preview ? 1 : 0,
          runtimePreviews: preview ? [preview] : [],
          runtimeResultNode: true,
          runtimeSourceNodeId: sourceNode.id,
          runtimeRunId: descriptor.runId || descriptor.result?.taskId || "",
          runtimeResultIndex: index + 1,
          runtimeResultCount: total,
          runtimeRunStatus: displayStatus,
          runtimeProgress: Number.isFinite(Number(descriptor.progress))
            ? Math.max(0, Math.min(100, Number(descriptor.progress)))
            : null,
          runtimeProgressLabel: descriptor.progressLabel || "",
          runtimeError:
            displayStatus === "failed"
              ? descriptor.error || "生成未返回可用结果"
              : "",
        },
      });
      resultEdges.push({
        id: `edge-${resultNodeId}`,
        source: sourceNode.id,
        target: resultNodeId,
        sourceHandle: sourceOutputHandle(sourceNode, preview?.kind || previewKind),
        targetHandle: "media",
        type: "removable",
        animated: false,
        ...(edgeStyle ? { style: { ...edgeStyle } } : {}),
        data: { runtimeResultEdge: true },
      });
    });
  });

  return {
    nodes: [...retainedNodes, ...resultNodes],
    edges: [...retainedEdges, ...resultEdges],
  };
}

