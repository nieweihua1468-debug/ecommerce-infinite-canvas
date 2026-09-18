const positiveInteger = (value) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const workflowUserConcurrency = (totalConcurrency, configuredLimit) => {
  const total = Math.max(1, positiveInteger(totalConcurrency) || 1);
  const configured = positiveInteger(configuredLimit);
  return Math.min(total, configured || total);
};

export const workflowQueueOptions = ({
  runId,
  ownerId,
  priority = 0,
  totalConcurrency,
  configuredUserConcurrency,
}) => ({
  key: String(runId || ""),
  priority: Number(priority) || 0,
  groupKey: ownerId ? `workflow:user:${String(ownerId)}` : "",
  groupLimit: workflowUserConcurrency(
    totalConcurrency,
    configuredUserConcurrency,
  ),
});

