const EXECUTION_KINDS = new Set([
  "text",
  "media-analysis",
  "image",
  "video",
  "audio-generation",
]);

const PROMPT_KINDS = new Set([
  "text",
  "media-analysis",
  "image",
  "video",
  "audio-generation",
]);

export function classifyWorkflowAgentInstruction(value = "") {
  const instruction = String(value).trim();
  if (/批量|批处理|多条|多款|每个素材|每张/.test(instruction)) return "batch";
  if (/检查|体检|诊断|问题|建议/.test(instruction)) return "audit";
  if (/优化|润色|改写|增强|完善/.test(instruction)) return "optimize";
  if (/同步|引用|绑定|关联/.test(instruction)) return "sync";
  if (/@/.test(instruction)) return "sync";
  return "director";
}

export function improveWorkflowAgentPrompt({
  prompt = "",
  instruction = "",
  kind = "video",
  aspectRatio = "9:16",
  duration = 15,
  materialTokens = [],
} = {}) {
  const original = String(prompt || "")
    .replace(/\n*【智能体优化】[\s\S]*$/u, "")
    .trim();
  const request = String(instruction || "").trim();
  const tokens = Array.from(
    new Set([
      ...materialTokens,
      ...(original.match(/@素材\d+/gu) || []),
    ]),
  );
  const tokenPrefix = tokens.filter((token) => !original.includes(token)).join(" ");
  const base = [tokenPrefix, original || request || "生成高完成度商业内容"]
    .filter(Boolean)
    .join("\n");
  const rules =
    kind === "video"
      ? `保持主体、商品和服装细节一致；按时间顺序写清动作、景别、运镜、转场、光线与声音。输出 ${aspectRatio}，总时长 ${Number(duration) || 15} 秒，开头 3 秒给出明确视觉重点，结尾保留稳定成片画面。`
      : kind === "image"
        ? `保持主体、商品、服装版型与文字细节一致；明确构图、景别、光线、材质和背景层次。输出画幅 ${aspectRatio}，避免肢体、文字和 Logo 变形。`
        : kind === "media-analysis"
          ? "按时间线识别主体、商品、动作、镜头、光线、节奏与声音，区分可复用结构和不可复用的品牌、人物、价格及版权元素。"
          : kind === "audio-generation"
            ? "优化为自然口语，保留原始事实与卖点，控制停顿和重音，不添加未经提供的价格、功效或承诺。"
            : "保留原始意图和素材引用，整理为下游节点可直接执行的结构化提示词，不虚构未提供的信息。";
  return `${base}\n【智能体优化】${rules}`.trim();
}

export function auditWorkflowCanvas(nodes = [], edges = []) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  const connectedIds = new Set(
    edgeList.flatMap((edge) => [edge.source, edge.target]).filter(Boolean),
  );
  const promptNodes = nodeList.filter((node) =>
    PROMPT_KINDS.has(node?.data?.kind),
  );
  const missingPrompt = promptNodes.filter(
    (node) => !String(node?.data?.prompt || "").trim(),
  );
  const isolated = nodeList.filter(
    (node) =>
      nodeList.length > 1 &&
      !node?.data?.runtimeResultNode &&
      !connectedIds.has(node.id),
  );
  const emptyBatch = nodeList.filter(
    (node) =>
      node?.data?.kind === "batch-input" &&
      Number(node?.data?.runtimeFileCount || 0) < 1,
  );
  const executionNodes = nodeList.filter((node) =>
    EXECUTION_KINDS.has(node?.data?.kind),
  );
  const terminalExecution = executionNodes.filter(
    (node) => !edgeList.some((edge) => edge.source === node.id),
  );
  const issues = [];
  if (missingPrompt.length)
    issues.push({
      level: "warning",
      label: `${missingPrompt.length} 个生成节点缺少提示词`,
      nodeIds: missingPrompt.map((node) => node.id),
    });
  if (isolated.length)
    issues.push({
      level: "warning",
      label: `${isolated.length} 个节点尚未接入工作流`,
      nodeIds: isolated.map((node) => node.id),
    });
  if (emptyBatch.length)
    issues.push({
      level: "info",
      label: `${emptyBatch.length} 个批量节点等待选择素材文件夹`,
      nodeIds: emptyBatch.map((node) => node.id),
    });
  if (!executionNodes.length)
    issues.push({
      level: "warning",
      label: "画布还没有可执行的生成节点",
      nodeIds: [],
    });
  if (executionNodes.length && !terminalExecution.length)
    issues.push({
      level: "warning",
      label: "没有可作为最终结果的生成节点",
      nodeIds: executionNodes.map((node) => node.id),
    });
  const score = Math.max(
    0,
    100 - missingPrompt.length * 12 - isolated.length * 8 - emptyBatch.length * 5,
  );
  return {
    score,
    issues,
    stats: {
      nodes: nodeList.length,
      edges: edgeList.length,
      materials: nodeList.filter((node) =>
        ["input", "batch-input", "face-input", "person-video-input", "asset"].includes(
          node?.data?.kind,
        ),
      ).length,
      generators: executionNodes.length,
      batches: nodeList.filter((node) => node?.data?.kind === "batch-input").length,
    },
  };
}

