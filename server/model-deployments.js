const DAY_MS = 24 * 60 * 60 * 1_000;

const SUCCESS_STATUSES = new Set(["succeeded", "success", "completed", "done"]);
const FAILURE_STATUSES = new Set(["failed", "failure", "error", "rejected", "timeout"]);
const ACTIVE_STATUSES = new Set(["queued", "submitting", "processing", "running", "pending"]);
const IGNORED_STATUSES = new Set(["skipped", "terminated", "cancelled", "canceled"]);

const PROVIDER_ALIASES = new Map([
  ["azure", "image2"],
  ["azure openai", "image2"],
  ["image 2", "image2"],
  ["gpt image 2", "image2"],
  ["volcengine seedance", "volcengine"],
  ["volcengine / seedance", "volcengine"],
  ["seedance", "volcengine"],
  ["doubao", "volcengine"],
  ["valeur", "vapeur"],
  ["gemini", "vapeur"],
  ["gpt", "vapeur"],
  ["minimaxi", "minimax"],
]);

const MODEL_ALIASES = new Map([
  ["doubao-seedance-2-0-fast", "doubao-seedance-2-0-fast-260128"],
]);

const roundRate = (value) => Math.round(value * 1_000) / 10;

function milliseconds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function timestamp(value) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function iso(value) {
  const result = timestamp(value);
  return result === null ? null : new Date(result).toISOString();
}

function safeNow(value) {
  return timestamp(value) ?? Date.now();
}

function safeWindowDays(value) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? Math.min(365, result) : 30;
}

function percent(numerator, denominator) {
  return denominator ? roundRate(numerator / denominator) : null;
}

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]);
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function canonicalModel(value) {
  const model = String(value || "").trim();
  return MODEL_ALIASES.get(model) || model;
}

function normalizedProvider(value) {
  const source = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return PROVIDER_ALIASES.get(source) || source.replace(/\s+/g, "");
}

function inferProvider(model, explicitProvider = "") {
  const explicit = normalizedProvider(explicitProvider);
  if (explicit) return explicit;
  const id = canonicalModel(model).toLowerCase();
  if (id.startsWith("kling-")) return "kling";
  if (id.startsWith("doubao-") || id.includes("seedance")) return "volcengine";
  if (id === "gpt-image-2") return "image2";
  if (id.startsWith("vapeur-")) return "vapeur";
  if (id.startsWith("deepseek-")) return "deepseek";
  if (id.startsWith("speech-") || id.startsWith("minimax-")) return "minimax";
  if (id.startsWith("local-")) return "local";
  return "unknown";
}

function inferKind(record = {}, model = "") {
  const explicit = String(record.kind || record.modelType || record.type || "").toLowerCase();
  if (["image", "video", "text", "analysis", "audio"].includes(explicit))
    return explicit;
  if (explicit === "media-analysis") return "analysis";
  if (explicit === "audio-generation" || explicit === "tts") return "audio";
  const taskType = String(record.taskType || record.outputType || "").toLowerCase();
  if (taskType.includes("image")) return "image";
  if (taskType.includes("video") || taskType.includes("motion")) return "video";
  if (taskType.includes("audio") || taskType.includes("voice") || taskType.includes("tts"))
    return "audio";
  const id = canonicalModel(model).toLowerCase();
  if (id.includes("image")) return "image";
  if (id.includes("kling") || id.includes("seedance")) return "video";
  if (id.includes("gemini") || id.endsWith("-precise")) return "analysis";
  if (id.startsWith("speech-") || id.startsWith("minimax-")) return "audio";
  return "text";
}

function toRecords(value, collectionKeys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of collectionKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return Object.entries(value).map(([id, record]) =>
    record && typeof record === "object" ? { id, ...record } : { id, value: record },
  );
}

function statusClass(value) {
  const status = String(value || "").trim().toLowerCase();
  if (SUCCESS_STATUSES.has(status)) return "success";
  if (FAILURE_STATUSES.has(status)) return "failure";
  if (ACTIVE_STATUSES.has(status)) return "active";
  if (IGNORED_STATUSES.has(status)) return "ignored";
  return "unknown";
}

function recordTime(record, classification) {
  if (classification === "active")
    return timestamp(record.startedAt) ?? timestamp(record.createdAt) ?? timestamp(record.updatedAt);
  return timestamp(record.completedAt) ?? timestamp(record.updatedAt) ?? timestamp(record.createdAt);
}

function successfulDuration(record) {
  const fromTiming = milliseconds(record.timing?.generationMs);
  if (fromTiming !== null) return Math.round(fromTiming);
  const direct = milliseconds(record.durationMs ?? record.elapsedMs ?? record.latencyMs);
  if (direct !== null) return Math.round(direct);
  const startedAt = timestamp(record.startedAt) ?? timestamp(record.createdAt);
  const completedAt = timestamp(record.completedAt) ?? timestamp(record.updatedAt);
  if (startedAt === null || completedAt === null) return null;
  return Math.max(0, completedAt - startedAt);
}

function safeText(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  let result = String(value).trim();
  if (!result) return null;
  result = result
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|api[_-]?key|secret|signature|access[_-]?key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|secret|access[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
  return result.slice(0, maxLength);
}

function failureDetails(record) {
  const failure = record?.failure && typeof record.failure === "object" ? record.failure : {};
  return {
    code: safeText(failure.code ?? record?.errorCode ?? record?.code, 120),
    message: safeText(failure.message ?? record?.errorMessage ?? record?.error),
  };
}

function attemptFrom(record, source, parent = {}) {
  const model = canonicalModel(
    record?.modelName || record?.model || record?.result?.model || parent.modelName || parent.model,
  );
  if (!model || model === "local-prompt") return null;
  const classification = statusClass(record?.status);
  if (classification === "ignored" || classification === "unknown") return null;
  const eventAt = recordTime(record, classification);
  return {
    id: String(record?.id || ""),
    source,
    model,
    provider: inferProvider(model, record?.provider || parent.provider),
    kind: inferKind(record, model),
    classification,
    eventAt,
    durationMs: classification === "success" ? successfulDuration(record) : null,
    failure: classification === "failure" ? failureDetails(record) : null,
  };
}

function collectAttempts({ tasks, runs, analysisTasks }) {
  const attempts = [];
  const seen = new Set();
  const add = (attempt, identity) => {
    if (!attempt || (identity && seen.has(identity))) return;
    if (identity) seen.add(identity);
    attempts.push(attempt);
  };

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const identity = task?.id ? `task:${task.id}` : null;
    add(attemptFrom(task, "task"), identity);
  }

  for (const run of Array.isArray(runs) ? runs : []) {
    const steps = Array.isArray(run?.steps) ? run.steps : [];
    if (!steps.length && (run?.model || run?.modelName))
      add(attemptFrom(run, "workflow", run), run?.id ? `workflow:${run.id}` : null);
    steps.forEach((step, index) => {
      // Video workflow steps are orchestration records. Their actual provider call
      // is persisted in tasks and would otherwise be counted twice.
      if (inferKind(step, step?.model || step?.modelName) === "video") return;
      const identity = run?.id
        ? `workflow-step:${run.id}:${step?.nodeId || step?.id || index}`
        : step?.id
          ? `workflow-step:${step.id}`
          : null;
      add(attemptFrom(step, "workflow-step", run), identity);
    });
  }

  for (const task of Array.isArray(analysisTasks) ? analysisTasks : []) {
    const identity = task?.id ? `analysis:${task.id}` : null;
    add(attemptFrom({ ...task, kind: "analysis" }, "media-analysis"), identity);
  }
  return attempts;
}

function providerModels(readiness) {
  return [
    ...(Array.isArray(readiness?.availableModels) ? readiness.availableModels : []),
    ...(Array.isArray(readiness?.models) ? readiness.models : []),
  ].map((item) => canonicalModel(item?.id || item?.model || item));
}

function readinessModel(readiness) {
  return canonicalModel(
    readiness?.modelId || readiness?.modelName || readiness?.model || readiness?.targetModel,
  );
}

function matchReadiness(readinessRecords, model, provider) {
  const exact = readinessRecords
    .filter((record) => readinessModel(record) === model)
    .sort((left, right) => (timestamp(right.checkedAt) || 0) - (timestamp(left.checkedAt) || 0))[0];
  if (exact) return { record: exact, exact: true };
  const providerMatch = readinessRecords
    .filter((record) =>
      inferProvider("", record.provider || record.providerName || record.name) === provider,
    )
    .sort((left, right) => (timestamp(right.checkedAt) || 0) - (timestamp(left.checkedAt) || 0))[0];
  return { record: providerMatch || null, exact: false };
}

function issue(code, severity, message) {
  return { code, severity, message };
}

function deploymentFor({ catalog, readinessMatch, metrics, lastFailure }) {
  const readiness = readinessMatch.record;
  const configured =
    typeof catalog.configured === "boolean"
      ? catalog.configured
      : typeof readiness?.configured === "boolean"
        ? readiness.configured
        : metrics.successCount > 0;
  const enabled = catalog.enabled !== false;
  const authenticated =
    typeof readiness?.authenticated === "boolean"
      ? readiness.authenticated
      : readiness?.ready === true
        ? true
        : metrics.successCount > 0
          ? true
          : null;
  const listedModels = providerModels(readiness);
  const explicitModelAvailable = readinessMatch.exact
    ? readiness?.modelAvailable
    : listedModels.length
      ? listedModels.includes(catalog.id)
      : null;
  const modelAvailable =
    typeof catalog.modelAvailable === "boolean"
      ? catalog.modelAvailable
      : typeof explicitModelAvailable === "boolean"
        ? explicitModelAvailable
        : metrics.successCount > 0
          ? true
          : null;
  const readinessError = {
    code: safeText(
      readiness?.lastErrorCode || readiness?.errorCode || readiness?.failure?.code,
      120,
    ),
    message: safeText(
      readiness?.lastErrorMessage || readiness?.errorMessage || readiness?.failure?.message,
    ),
  };
  const latestError = readinessError.code || readinessError.message ? readinessError : lastFailure;
  const issues = [];

  if (!enabled) issues.push(issue("DISABLED", "error", "模型已在部署目录中停用"));
  if (!configured) issues.push(issue("NOT_CONFIGURED", "error", "模型尚未完成服务端配置"));
  if (authenticated === false)
    issues.push(issue("AUTHENTICATION_FAILED", "error", "供应商凭证认证失败"));
  if (modelAvailable === false)
    issues.push(issue("MODEL_UNAVAILABLE", "error", "当前凭证无法使用该模型"));
  if (configured && authenticated === null)
    issues.push(issue("AUTHENTICATION_UNVERIFIED", "warning", "尚无认证探测或成功调用样本"));
  if (configured && authenticated !== false && modelAvailable === null)
    issues.push(issue("MODEL_AVAILABILITY_UNVERIFIED", "warning", "供应商连通不代表该模型已有调用权限"));
  if (!readiness)
    issues.push(issue("NO_READINESS_CHECK", "warning", "尚无该供应商的连通性检查记录"));
  if (metrics.failureCount > 0)
    issues.push(
      issue(
        "RECENT_FAILURES",
        metrics.failureRate >= 50 ? "error" : "warning",
        `窗口内失败 ${metrics.failureCount} 次，失败率 ${metrics.failureRate}%`,
      ),
    );
  if (catalog.cataloged === false)
    issues.push(issue("NOT_IN_DEPLOYMENT_CATALOG", "warning", "历史任务使用了部署目录之外的模型"));

  let status = "UNKNOWN";
  if (!enabled || !configured || authenticated === false || modelAvailable === false)
    status = "UNAVAILABLE";
  else if (
    authenticated === true &&
    modelAvailable === true &&
    metrics.failureCount === 0
  )
    status = "HEALTHY";
  else if (
    authenticated === true ||
    modelAvailable === true ||
    metrics.successCount > 0 ||
    metrics.failureCount > 0
  )
    status = "DEGRADED";

  return {
    configured: Boolean(configured),
    enabled,
    authenticated,
    modelAvailable,
    status,
    checkedAt: iso(readiness?.checkedAt),
    latencyMs: milliseconds(readiness?.latencyMs),
    lastErrorCode: latestError?.code || null,
    lastErrorMessage: latestError?.message || null,
    issues,
  };
}

function metricsFor(attempts) {
  const successes = attempts.filter((attempt) => attempt.classification === "success");
  const failures = attempts.filter((attempt) => attempt.classification === "failure");
  const active = attempts.filter((attempt) => attempt.classification === "active");
  const finalized = successes.length + failures.length;
  const durations = successes
    .map((attempt) => attempt.durationMs)
    .filter((duration) => duration !== null);
  const latest = (items) => {
    const value = Math.max(...items.map((item) => item.eventAt || -Infinity));
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  };
  return {
    requestCount: finalized + active.length,
    successCount: successes.length,
    failureCount: failures.length,
    activeCount: active.length,
    successRate: percent(successes.length, finalized),
    failureRate: percent(failures.length, finalized),
    avgDurationMs: average(durations),
    p95DurationMs: percentile95(durations),
    lastRequestAt: latest(attempts),
    lastSuccessAt: latest(successes),
    lastFailureAt: latest(failures),
  };
}

function latestFailure(attempts) {
  const failure = attempts
    .filter((attempt) => attempt.classification === "failure")
    .sort((left, right) => (right.eventAt || 0) - (left.eventAt || 0))[0];
  return failure?.failure || { code: null, message: null };
}

function modelCatalog(modelsCatalog) {
  return toRecords(modelsCatalog, ["data", "models", "items"]).map((entry) => {
    const id = canonicalModel(entry.id || entry.modelId || entry.modelName || entry.model);
    return {
      id,
      name: String(entry.name || entry.label || id),
      provider: inferProvider(id, entry.provider || entry.providerName),
      kind: inferKind(entry, id),
      configured: entry.configured,
      enabled: entry.enabled,
      modelAvailable: entry.modelAvailable,
      cataloged: true,
    };
  }).filter((entry) => entry.id && entry.id !== "local-prompt");
}

export function buildModelDeployments({
  tasks = [],
  runs = [],
  analysisTasks = [],
  readinessRecords = [],
  now = Date.now(),
  windowDays = 30,
  modelsCatalog = [],
} = {}) {
  const nowMs = safeNow(now);
  const days = safeWindowDays(windowDays);
  const fromMs = nowMs - days * DAY_MS;
  const attempts = collectAttempts({ tasks, runs, analysisTasks }).filter(
    (attempt) => attempt.eventAt !== null && attempt.eventAt >= fromMs && attempt.eventAt <= nowMs,
  );
  const catalog = modelCatalog(modelsCatalog);
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  for (const attempt of attempts) {
    if (catalogById.has(attempt.model)) continue;
    catalogById.set(attempt.model, {
      id: attempt.model,
      name: attempt.model,
      provider: attempt.provider,
      kind: attempt.kind,
      configured: undefined,
      enabled: true,
      modelAvailable: undefined,
      cataloged: false,
    });
  }
  const readiness = toRecords(readinessRecords, ["data", "providers", "records", "items"]);
  const data = [...catalogById.values()].map((entry) => {
    const modelAttempts = attempts.filter((attempt) => attempt.model === entry.id);
    const metrics = metricsFor(modelAttempts);
    const readinessMatch = matchReadiness(readiness, entry.id, entry.provider);
    const deployment = deploymentFor({
      catalog: entry,
      readinessMatch,
      metrics,
      lastFailure: latestFailure(modelAttempts),
    });
    return {
      id: entry.id,
      name: entry.name,
      provider: entry.provider,
      kind: entry.kind,
      deployment: {
        configured: deployment.configured,
        enabled: deployment.enabled,
        authenticated: deployment.authenticated,
        modelAvailable: deployment.modelAvailable,
        status: deployment.status,
        checkedAt: deployment.checkedAt,
        latencyMs: deployment.latencyMs,
        lastErrorCode: deployment.lastErrorCode,
        lastErrorMessage: deployment.lastErrorMessage,
      },
      metrics,
      issues: deployment.issues,
    };
  }).sort((left, right) => {
    const statusOrder = { HEALTHY: 0, DEGRADED: 1, UNKNOWN: 2, UNAVAILABLE: 3 };
    return (
      statusOrder[left.deployment.status] - statusOrder[right.deployment.status] ||
      right.metrics.requestCount - left.metrics.requestCount ||
      left.provider.localeCompare(right.provider) ||
      left.name.localeCompare(right.name)
    );
  });
  const aggregate = metricsFor(attempts);
  const counts = { HEALTHY: 0, DEGRADED: 0, UNAVAILABLE: 0, UNKNOWN: 0 };
  for (const item of data) counts[item.deployment.status] += 1;
  return {
    checkedAt: new Date(nowMs).toISOString(),
    window: {
      days,
      from: new Date(fromMs).toISOString(),
      to: new Date(nowMs).toISOString(),
      basis: "completedAt for final records; startedAt/createdAt for active records",
    },
    summary: {
      total: data.length,
      healthy: counts.HEALTHY,
      degraded: counts.DEGRADED,
      unavailable: counts.UNAVAILABLE,
      unknown: counts.UNKNOWN,
      abnormal: counts.DEGRADED + counts.UNAVAILABLE + counts.UNKNOWN,
      ...aggregate,
      coverage: "persisted tasks, workflow steps and standalone media-analysis tasks",
    },
    data,
  };
}

function apiRoute(event) {
  let value = String(event?.route || event?.path || event?.pathname || event?.url || "").trim();
  try {
    if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
  } catch {
    return null;
  }
  value = value.split(/[?#]/, 1)[0];
  return value === "/api" || value.startsWith("/api/") ? value : null;
}

function apiEventTime(event) {
  return timestamp(event?.timestamp || event?.createdAt || event?.occurredAt);
}

function apiLatency(event) {
  return milliseconds(event?.durationMs ?? event?.latencyMs ?? event?.responseTimeMs) ?? 0;
}

function apiFailure(event) {
  const status = Number(event?.status ?? event?.statusCode);
  return !Number.isFinite(status) || status < 200 || status >= 400;
}

export function buildApiMetrics(events = [], { now = Date.now(), windowDays = 30 } = {}) {
  const nowMs = safeNow(now);
  const days = safeWindowDays(windowDays);
  const fromMs = nowMs - days * DAY_MS;
  const filtered = (Array.isArray(events) ? events : [])
    .map((event) => ({
      method: String(event?.method || "GET").toUpperCase(),
      route: apiRoute(event),
      timestamp: apiEventTime(event),
      latencyMs: apiLatency(event),
      failed: apiFailure(event),
    }))
    .filter(
      (event) =>
        event.route &&
        event.timestamp !== null &&
        event.timestamp >= fromMs &&
        event.timestamp <= nowMs,
    );
  const routeMap = new Map();
  for (const event of filtered) {
    const key = `${event.method} ${event.route}`;
    const route = routeMap.get(key) || {
      method: event.method,
      route: event.route,
      requestCount: 0,
      failureCount: 0,
      latencies: [],
      lastRequestAt: null,
    };
    route.requestCount += 1;
    route.failureCount += event.failed ? 1 : 0;
    route.latencies.push(event.latencyMs);
    route.lastRequestAt = Math.max(route.lastRequestAt || 0, event.timestamp);
    routeMap.set(key, route);
  }
  const failures = filtered.filter((event) => event.failed).length;
  const latencies = filtered.map((event) => event.latencyMs);
  const routes = [...routeMap.values()]
    .map((route) => ({
      method: route.method,
      route: route.route,
      requestCount: route.requestCount,
      failureCount: route.failureCount,
      failureRate: percent(route.failureCount, route.requestCount),
      avgLatencyMs: average(route.latencies),
      p95LatencyMs: percentile95(route.latencies),
      lastRequestAt: new Date(route.lastRequestAt).toISOString(),
    }))
    .sort(
      (left, right) =>
        right.requestCount - left.requestCount ||
        right.failureRate - left.failureRate ||
        `${left.method} ${left.route}`.localeCompare(`${right.method} ${right.route}`),
    );
  return {
    checkedAt: new Date(nowMs).toISOString(),
    window: {
      days,
      from: new Date(fromMs).toISOString(),
      to: new Date(nowMs).toISOString(),
      scope: "internal /api HTTP traffic",
    },
    summary: {
      requestCount: filtered.length,
      successRate: percent(filtered.length - failures, filtered.length),
      failureRate: percent(failures, filtered.length),
      avgLatencyMs: average(latencies),
      p95LatencyMs: percentile95(latencies),
    },
    routes,
  };
}

