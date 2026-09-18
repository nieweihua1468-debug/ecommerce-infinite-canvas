const ACTIVE_STATUSES = new Set(["submitting", "queued", "processing"]);
const FINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "terminated",
  "skipped",
]);

function timestamp(value) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function iso(value) {
  const result = timestamp(value);
  return result === null ? null : new Date(result).toISOString();
}

function elapsed(start, end) {
  if (start === null || end === null) return null;
  return Math.max(0, end - start);
}

export function generationTiming(record = {}, nowValue = Date.now()) {
  const now = timestamp(nowValue) ?? Date.now();
  const createdAt = timestamp(record.createdAt);
  const startedAt = timestamp(record.startedAt) ?? createdAt;
  const isFinal = FINAL_STATUSES.has(String(record.status || ""));
  const isActive = ACTIVE_STATUSES.has(String(record.status || ""));
  const completedAt = isFinal
    ? timestamp(record.completedAt) ?? timestamp(record.updatedAt) ?? startedAt
    : null;
  const endAt = completedAt ?? (isActive ? now : timestamp(record.updatedAt));
  const queueMs = elapsed(createdAt, startedAt);
  const generationMs = elapsed(startedAt, endAt);
  const totalMs = elapsed(createdAt ?? startedAt, endAt);

  return {
    createdAt: iso(record.createdAt),
    startedAt: iso(record.startedAt || record.createdAt),
    completedAt: isFinal
      ? iso(record.completedAt || record.updatedAt || record.startedAt || record.createdAt)
      : null,
    queueMs: queueMs ?? 0,
    generationMs: generationMs ?? 0,
    totalMs: totalMs ?? 0,
    isActive,
    isFinal,
  };
}

export function withGenerationTiming(record = {}, nowValue = Date.now()) {
  return {
    ...record,
    timing: generationTiming(record, nowValue),
  };
}

export function withWorkflowGenerationTiming(run = {}, nowValue = Date.now()) {
  return {
    ...run,
    steps: (Array.isArray(run.steps) ? run.steps : []).map((step) =>
      withGenerationTiming(step, nowValue),
    ),
    timing: generationTiming(run, nowValue),
  };
}

function taskCategory(task = {}) {
  return task.outputType === "image" ||
    task.taskType === "image-generation" ||
    Boolean(task.imageUrl)
    ? "image"
    : "video";
}

function stepCategory(step = {}) {
  if (["image", "video", "text", "media-analysis", "audio-generation"].includes(step.kind))
    return step.kind;
  if (step.kind === "text-preview") return "text";
  return "other";
}

function emptyBucket() {
  return {
    count: 0,
    totalMs: 0,
    averageMs: 0,
    minMs: 0,
    maxMs: 0,
  };
}

function summarize(records, categoryFor, nowValue) {
  const successful = (Array.isArray(records) ? records : [])
    .filter((record) => record?.status === "succeeded")
    .map((record) => ({
      category: categoryFor(record),
      duration: generationTiming(record, nowValue).generationMs,
    }));
  const result = emptyBucket();
  const byType = {};
  for (const item of successful) {
    const bucket = byType[item.category] || emptyBucket();
    bucket.count += 1;
    bucket.totalMs += item.duration;
    bucket.minMs = bucket.count === 1 ? item.duration : Math.min(bucket.minMs, item.duration);
    bucket.maxMs = Math.max(bucket.maxMs, item.duration);
    byType[item.category] = bucket;

    result.count += 1;
    result.totalMs += item.duration;
    result.minMs = result.count === 1 ? item.duration : Math.min(result.minMs, item.duration);
    result.maxMs = Math.max(result.maxMs, item.duration);
  }
  result.averageMs = result.count ? Math.round(result.totalMs / result.count) : 0;
  for (const bucket of Object.values(byType))
    bucket.averageMs = bucket.count
      ? Math.round(bucket.totalMs / bucket.count)
      : 0;
  return { ...result, byType };
}

export function summarizeGenerationTimes(
  tasks = [],
  workflowRuns = [],
  nowValue = Date.now(),
) {
  const steps = (Array.isArray(workflowRuns) ? workflowRuns : []).flatMap(
    (run) => (Array.isArray(run.steps) ? run.steps : []),
  );
  return {
    generatedAt: new Date(timestamp(nowValue) ?? Date.now()).toISOString(),
    tasks: summarize(tasks, taskCategory, nowValue),
    workflows: summarize(workflowRuns, () => "workflow", nowValue),
    steps: summarize(steps, stepCategory, nowValue),
  };
}

export function timingPatch(record = {}, patch = {}, nowValue = new Date()) {
  const now = iso(nowValue) || new Date().toISOString();
  const next = { ...patch };
  const status = String(next.status || record.status || "");
  if (status === "processing" && !record.startedAt && !next.startedAt)
    next.startedAt = now;
  if (FINAL_STATUSES.has(status) && !record.completedAt && !next.completedAt)
    next.completedAt = now;
  return next;
}

