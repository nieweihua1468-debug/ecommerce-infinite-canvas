export const ACTIVE_WORKFLOW_STATUSES = new Set(['queued', 'processing']);

export function isWorkflowRunActive(run) {
  return ACTIVE_WORKFLOW_STATUSES.has(run?.status);
}

export function terminateWorkflowRunRecord(run, now = new Date().toISOString()) {
  if (!run || !isWorkflowRunActive(run)) return run;
  return {
    ...run,
    status: 'terminated',
    error: null,
    terminationReason: '用户主动终止',
    terminatedAt: now,
    completedAt: now,
    updatedAt: now,
    currentNodeId: null,
    activeEdgeId: null,
    steps: (run.steps || []).map((step) => {
      if (step.status === 'processing') return { ...step, status: 'terminated', error: null, completedAt: now, updatedAt: now };
      if (step.status === 'queued') return { ...step, status: 'skipped', error: null, completedAt: now, updatedAt: now };
      return step;
    }),
  };
}

export function canDeleteWorkflowRun(run) {
  return Boolean(run) && !isWorkflowRunActive(run);
}

export function normalizeDirectDigitalAssetIds(
  inputIds,
  nodeIds,
  limit = 3,
) {
  return [
    ...(Array.isArray(inputIds) ? inputIds : []),
    ...(Array.isArray(nodeIds) ? nodeIds : []),
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, Math.max(0, Number(limit) || 0));
}

