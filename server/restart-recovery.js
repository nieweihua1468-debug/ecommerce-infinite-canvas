const RESUMABLE_TASK_STATUSES = new Set([
  "submitting",
  "queued",
  "processing",
  "succeeded",
  "failed",
]);

export function buildWorkflowRecoveryInput(input = {}, overrides = {}) {
  return {
    name: String(overrides.name ?? input.name ?? "未命名工作流"),
    templateId: String(overrides.templateId ?? input.templateId ?? ""),
    sourceRunId: String(overrides.sourceRunId ?? input.sourceRunId ?? ""),
    startNodeId: String(overrides.startNodeId ?? input.startNodeId ?? ""),
    singleNodeId: String(overrides.singleNodeId ?? input.singleNodeId ?? ""),
    batchGroupId: String(overrides.batchGroupId ?? input.batchGroupId ?? ""),
    fallbackPrompt: String(input.fallbackPrompt || ""),
    nodes: Array.isArray(overrides.nodes ?? input.nodes)
      ? (overrides.nodes ?? input.nodes)
      : [],
    edges: Array.isArray(overrides.edges ?? input.edges)
      ? (overrides.edges ?? input.edges)
      : [],
    runtimeAssetGroupIds: {
      ...(input.runtimeAssetGroupIds || {}),
      ...(overrides.runtimeAssetGroupIds || {}),
    },
    runtimeDigitalAssetIds: { ...(input.runtimeDigitalAssetIds || {}) },
    assetUris: { ...(input.assetUris || {}) },
    directDigitalAssetIds: Array.isArray(input.directDigitalAssetIds)
      ? input.directDigitalAssetIds
      : [],
  };
}

export function findWorkflowVideoTask(tasks = [], run = {}, step = {}) {
  const taskId = String(step?.taskId || step?.result?.taskId || "");
  const byId = taskId
    ? tasks.find((task) => String(task?.id || "") === taskId)
    : null;
  if (byId && RESUMABLE_TASK_STATUSES.has(byId.status)) return byId;
  return (
    tasks.find(
      (task) =>
        String(task?.workflowRunId || "") === String(run?.id || "") &&
        String(task?.workflowNodeId || "") === String(step?.nodeId || "") &&
        RESUMABLE_TASK_STATUSES.has(task?.status),
    ) || null
  );
}

export function shouldReuseWorkflowStep(step) {
  return ["succeeded", "skipped"].includes(String(step?.status || ""));
}

export function oldestWorkflowRunsFirst(runs = []) {
  return [...runs].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || left?.updatedAt || 0) || 0;
    const rightTime =
      Date.parse(right?.createdAt || right?.updatedAt || 0) || 0;
    return leftTime - rightTime;
  });
}

