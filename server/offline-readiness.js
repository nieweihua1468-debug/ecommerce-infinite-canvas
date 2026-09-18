const DEFAULT_CONCURRENCY = 12;
const DEFAULT_ROUNDS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

const SAFE_GET_PATHS = new Set([
  "/api/health",
  "/api/models",
  "/api/admin/status",
  "/api/admin/me",
  "/api/admin/model-deployments",
  "/api/auth/me",
  "/api/bootstrap",
  "/api/templates",
  "/release.json",
  "/mcp",
]);

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function rounded(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function boundedInteger(
  value,
  fallback,
  { min = 1, max = Number.MAX_SAFE_INTEGER } = {},
) {
  if (value === undefined || value === null || String(value).trim() === "")
    return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`必须是 ${min} 到 ${max} 之间的整数`);
  return number;
}

export function offlineReadinessConfig(env = process.env) {
  return {
    concurrency: boundedInteger(env.OFFLINE_CONCURRENCY, DEFAULT_CONCURRENCY, {
      min: 1,
      max: 100,
    }),
    rounds: boundedInteger(env.OFFLINE_ROUNDS, DEFAULT_ROUNDS, {
      min: 1,
      max: 20,
    }),
    timeoutMs: boundedInteger(env.OFFLINE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, {
      min: 500,
      max: 120_000,
    }),
  };
}

export function assertLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("本地检查地址必须是有效 HTTP(S) URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname) ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("本地检查只允许访问 localhost、127.0.0.1 或 ::1");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function assertSafeGetPath(value) {
  const source = String(value || "");
  let url;
  try {
    url = new URL(source, "http://offline.local");
  } catch {
    throw new Error("并发检查路径无效");
  }
  if (url.origin !== "http://offline.local" || !SAFE_GET_PATHS.has(url.pathname))
    throw new Error(`拒绝不在只读白名单内的路径：${source}`);
  return `${url.pathname}${url.search}`;
}

export function buildBurstPlan(paths, { concurrency, rounds }) {
  const safePaths = [...new Set(paths.map(assertSafeGetPath))];
  if (!safePaths.length) throw new Error("并发检查至少需要一个安全 GET 路径");
  const width = boundedInteger(concurrency, DEFAULT_CONCURRENCY, {
    min: 1,
    max: 100,
  });
  const count = boundedInteger(rounds, DEFAULT_ROUNDS, { min: 1, max: 20 });
  return Array.from({ length: count }, (_unused, round) =>
    Array.from(
      { length: width },
      (_empty, index) => safePaths[(round * width + index) % safePaths.length],
    ),
  );
}

export function summarizeHttpSamples(samples = []) {
  const normalized = samples.map((sample) => ({
    ok: sample?.ok === true,
    latencyMs: finiteNonNegative(sample?.latencyMs),
  }));
  const requestCount = normalized.length;
  const failureCount = normalized.filter((sample) => !sample.ok).length;
  const latencies = normalized
    .map((sample) => sample.latencyMs)
    .sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  return {
    requestCount,
    failureCount,
    failureRate: requestCount ? rounded((failureCount / requestCount) * 100) : 0,
    avgLatencyMs: requestCount
      ? rounded(
          latencies.reduce((sum, latency) => sum + latency, 0) / requestCount,
        )
      : 0,
    p95LatencyMs: requestCount ? rounded(latencies[p95Index]) : 0,
    maxLatencyMs: requestCount ? rounded(latencies.at(-1)) : 0,
  };
}

export const OFFLINE_READINESS_DEFAULTS = Object.freeze({
  concurrency: DEFAULT_CONCURRENCY,
  rounds: DEFAULT_ROUNDS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});

