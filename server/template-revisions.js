const VOLATILE_NODE_DATA_KEYS = new Set([
  "runtimeFileCount",
  "runtimePreviews",
  "runtimeText",
  "runtimeRunStatus",
  "runtimeRunId",
  "subtitle",
  "status",
]);

const FIELD_LABELS = {
  title: "节点名称",
  kind: "节点类型",
  model: "模型",
  prompt: "提示词",
  systemPrompt: "系统提示词",
  aspectRatio: "画幅",
  ratioMode: "画幅模式",
  resolution: "清晰度",
  duration: "时长",
  mode: "生成模式",
  multiShot: "多镜头",
  shotType: "分镜方式",
  sound: "声音",
  generateAudio: "声音生成",
  audioMode: "声音模式",
  inputs: "输入端口",
  outputs: "输出端口",
  selectedAssetIds: "数字资产",
  trustedPersonAssetIds: "真人资产",
  remakeEditable: "复刻权限",
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function comparableNode(node) {
  const data = Object.fromEntries(
    Object.entries(node?.data || {}).filter(
      ([key]) => !VOLATILE_NODE_DATA_KEYS.has(key) && !key.startsWith("runtime"),
    ),
  );
  return {
    type: String(node?.type || "studio"),
    data: stableValue(data),
  };
}

function nodeName(node) {
  return String(
    node?.data?.title || node?.data?.label || node?.data?.kind || "未命名节点",
  ).slice(0, 80);
}

function changedNodeFields(previousNode, nextNode) {
  const previous = comparableNode(previousNode);
  const next = comparableNode(nextNode);
  const fields = [];
  if (previous.type !== next.type) fields.push("节点类型");
  const keys = new Set([
    ...Object.keys(previous.data || {}),
    ...Object.keys(next.data || {}),
  ]);
  for (const key of keys) {
    if (
      JSON.stringify(previous.data?.[key]) !== JSON.stringify(next.data?.[key])
    )
      fields.push(FIELD_LABELS[key] || key);
  }
  return [...new Set(fields)].slice(0, 12);
}

function comparableEdge(edge) {
  return [
    edge?.source || "",
    edge?.sourceHandle || "",
    edge?.target || "",
    edge?.targetHandle || "",
  ].join("::");
}

function changeSummary(changeType, name, fields = []) {
  if (changeType === "added") return `新增节点「${name}」`;
  if (changeType === "removed") return `删除节点「${name}」`;
  if (changeType === "connection") return `调整「${name}」的连接`;
  return fields.length
    ? `修改「${name}」：${fields.join("、")}`
    : `修改节点「${name}」`;
}

export function templateRevision(template) {
  const revision = Number.parseInt(template?.revision, 10);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

export function diffTemplateNodes(previousTemplate, nextTemplate) {
  const previousNodes = Array.isArray(previousTemplate?.nodes)
    ? previousTemplate.nodes
    : [];
  const nextNodes = Array.isArray(nextTemplate?.nodes) ? nextTemplate.nodes : [];
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  const nextById = new Map(nextNodes.map((node) => [node.id, node]));
  const changes = [];

  for (const node of previousNodes) {
    if (nextById.has(node.id)) continue;
    const name = nodeName(node);
    changes.push({
      nodeId: String(node.id || ""),
      nodeName: name,
      changeType: "removed",
      fields: [],
      summary: changeSummary("removed", name),
    });
  }

  for (const node of nextNodes) {
    const previous = previousById.get(node.id);
    const name = nodeName(node);
    if (!previous) {
      changes.push({
        nodeId: String(node.id || ""),
        nodeName: name,
        changeType: "added",
        fields: [],
        summary: changeSummary("added", name),
      });
      continue;
    }
    const fields = changedNodeFields(previous, node);
    if (!fields.length) continue;
    changes.push({
      nodeId: String(node.id || ""),
      nodeName: name,
      changeType: "modified",
      fields,
      summary: changeSummary("modified", name, fields),
    });
  }

  const previousEdges = new Set(
    (previousTemplate?.edges || []).map(comparableEdge),
  );
  const nextEdges = new Set((nextTemplate?.edges || []).map(comparableEdge));
  const connectionNodeIds = new Set();
  for (const edge of previousTemplate?.edges || []) {
    if (nextEdges.has(comparableEdge(edge))) continue;
    connectionNodeIds.add(edge.source);
    connectionNodeIds.add(edge.target);
  }
  for (const edge of nextTemplate?.edges || []) {
    if (previousEdges.has(comparableEdge(edge))) continue;
    connectionNodeIds.add(edge.source);
    connectionNodeIds.add(edge.target);
  }
  for (const id of connectionNodeIds) {
    if (!id) continue;
    const node = nextById.get(id) || previousById.get(id);
    if (!node) continue;
    const name = nodeName(node);
    const existing = changes.find((change) => change.nodeId === id);
    if (existing) {
      if (!["added", "removed"].includes(existing.changeType)) {
        existing.fields = [...new Set([...(existing.fields || []), "节点连接"])]
          .slice(0, 12);
        existing.summary = changeSummary(
          existing.changeType,
          existing.nodeName,
          existing.fields,
        );
      }
      continue;
    }
    changes.push({
      nodeId: String(id),
      nodeName: name,
      changeType: "connection",
      fields: ["节点连接"],
      summary: changeSummary("connection", name),
    });
  }

  return changes;
}

export function createTemplateRevisionEntry(
  previousTemplate,
  nextTemplate,
  { revision, updatedAt, updatedBy } = {},
) {
  const changes = diffTemplateNodes(previousTemplate, nextTemplate);
  return {
    revision: Number(revision) || templateRevision(previousTemplate) + 1,
    updatedAt: updatedAt || new Date().toISOString(),
    updatedBy: String(updatedBy || ""),
    changes,
  };
}

export function aggregateTemplateChanges(history, afterRevision = 0) {
  const entries = (Array.isArray(history) ? history : [])
    .filter((entry) => Number(entry?.revision) > Number(afterRevision || 0))
    .sort((left, right) => Number(left.revision) - Number(right.revision));
  const byNode = new Map();
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const key = String(change?.nodeId || `${change?.changeType}:${change?.nodeName}`);
      const current = byNode.get(key);
      byNode.set(key, {
        ...change,
        revision: Number(entry.revision),
        updatedAt: entry.updatedAt,
        fields: [...new Set([...(current?.fields || []), ...(change?.fields || [])])],
      });
    }
  }
  return [...byNode.values()];
}

