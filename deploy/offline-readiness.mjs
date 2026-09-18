import process from "node:process";
import {
  assertLoopbackBaseUrl,
  assertSafeGetPath,
  buildBurstPlan,
  offlineReadinessConfig,
  summarizeHttpSamples,
} from "../server/offline-readiness.js";

const rawBaseUrl =
  process.env.OFFLINE_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://127.0.0.1:8791";

let baseUrl;
let config;
try {
  baseUrl = assertLoopbackBaseUrl(rawBaseUrl);
  config = offlineReadinessConfig(process.env);
} catch (error) {
  console.error(`FAIL  [配置] ${error.message}`);
  process.exit(2);
}

const results = [];
const burstSamples = [];
const boundedBootstrapPath =
  "/api/bootstrap?taskLimit=40&runLimit=30&view=summary";
const credentials = {
  admin: String(
    process.env.OFFLINE_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "",
  ).trim(),
  user: String(process.env.OFFLINE_USER_TOKEN || "").trim(),
  mcp: String(
    process.env.OFFLINE_MCP_TOKEN || process.env.MCP_TOKEN || "",
  ).trim(),
};

const addResult = (status, scope, name, detail) =>
  results.push({ status, scope, name, detail });
const pass = (scope, name, detail) => addResult("PASS", scope, name, detail);
const fail = (scope, name, detail) => addResult("FAIL", scope, name, detail);
const skip = (scope, name, detail) => addResult("SKIP", scope, name, detail);

async function fetchResponse(pathname, {
  method = "GET",
  token = "",
  body,
  headers = {},
} = {}) {
  const upperMethod = String(method).toUpperCase();
  if (upperMethod === "GET") {
    pathname = assertSafeGetPath(pathname);
  } else {
    const allowedControlPost =
      upperMethod === "POST" && pathname === "/api/dev/admin-console-session";
    const allowedMcpPost =
      upperMethod === "POST" &&
      pathname === "/mcp" &&
      ["initialize", "tools/list"].includes(String(body?.method || ""));
    if (!allowedControlPost && !allowedMcpPost)
      throw new Error(`离线检查拒绝调用 ${upperMethod} ${pathname}`);
  }

  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: upperMethod,
    redirect: "manual",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return {
    status: response.status,
    payload,
    latencyMs: Math.round((performance.now() - startedAt) * 10) / 10,
    allow: response.headers.get("allow") || "",
  };
}

async function check(scope, name, pathname, {
  expected = [200],
  validate,
  ...options
} = {}) {
  try {
    const response = await fetchResponse(pathname, options);
    const ok = expected.includes(response.status) &&
      (!validate || validate(response));
    const detail = `${options.method || "GET"} ${pathname} -> ${response.status} (${response.latencyMs}ms)`;
    (ok ? pass : fail)(scope, name, detail);
    return { ...response, ok };
  } catch (error) {
    fail(
      scope,
      name,
      `${options.method || "GET"} ${pathname} -> ${error.name || "Error"}: ${error.message}`,
    );
    return null;
  }
}

console.log("Commerce Canvas 本地上线储备检查");
console.log(`目标：${baseUrl}`);
console.log(
  `并发：${config.concurrency} 路/轮 × ${config.rounds} 轮；超时 ${config.timeoutMs}ms`,
);
console.log("约束：仅本机、业务只读、无生成/分析/TTS/克隆/上传/任务创建/部署\n");

await check("核心", "后端健康", "/api/health", {
  validate: ({ payload }) => payload?.ok === true,
});
await check("核心", "发布信息", "/release.json", {
  validate: ({ payload }) => Boolean(payload?.version && payload?.build),
});
await check("核心", "模型目录登录边界", "/api/models", {
  expected: [401],
});
await check("核心", "管理员配置状态", "/api/admin/status", {
  validate: ({ payload }) => typeof payload?.configured === "boolean",
});

if (!credentials.admin) {
  const localSession = await check(
    "管理员",
    "本地无状态管理员会话",
    "/api/dev/admin-console-session",
    {
      method: "POST",
      body: {},
      validate: ({ payload }) => Boolean(payload?.token),
    },
  );
  if (localSession?.ok)
    credentials.admin = String(localSession.payload.token || "");
}

if (credentials.admin) {
  await check("管理员", "管理员身份", "/api/admin/me", {
    token: credentials.admin,
    validate: ({ payload }) => Boolean(payload?.username && payload?.role),
  });
  await check(
    "管理员",
    "模型部署与 API 指标",
    "/api/admin/model-deployments?windowDays=7&page=1&pageSize=100",
    {
      token: credentials.admin,
      validate: ({ payload }) =>
        Array.isArray(payload?.data) &&
        typeof payload?.summary?.total === "number" &&
        typeof payload?.apiMetrics?.summary?.requestCount === "number" &&
        typeof payload?.pagination?.totalItems === "number",
    },
  );
} else {
  fail(
    "管理员",
    "管理员只读链路",
    "无法取得本地无状态管理员会话；生产模式请显式提供 OFFLINE_ADMIN_TOKEN 或 ADMIN_TOKEN",
  );
}

if (credentials.user) {
  await check("普通用户", "模型目录", "/api/models", {
    token: credentials.user,
    validate: ({ payload }) =>
      Array.isArray(payload) &&
      payload.length > 0 &&
      payload.every((model) => Boolean(model?.id && model?.name)),
  });
  await check("普通用户", "当前账号", "/api/auth/me", {
    token: credentials.user,
    validate: ({ payload }) => Boolean(payload?.id),
  });
  await check("普通用户", "启动数据与模版权限", boundedBootstrapPath, {
    token: credentials.user,
    validate: ({ payload }) =>
      Boolean(payload?.user) &&
      typeof payload.user.templateAccess === "boolean" &&
      Array.isArray(payload?.templates),
  });
  await check("普通用户", "可见模版集合", "/api/templates", {
    token: credentials.user,
    validate: ({ payload }) => Array.isArray(payload),
  });
} else {
  await check("普通用户", "bootstrap 登录边界", "/api/bootstrap", {
    expected: [401],
  });
  await check("普通用户", "模版登录边界", "/api/templates", {
    expected: [401],
  });
  skip(
    "普通用户",
    "登录态模版权限",
    "未提供 OFFLINE_USER_TOKEN；为避免 /api/dev/admin-session 初始化或更新用户/团队数据，本次不创建测试用户",
  );
}

await check("MCP", "HTTP 方法边界", "/mcp", {
  expected: [405],
  validate: ({ allow }) => allow === "POST",
});

if (credentials.mcp) {
  const mcpHeaders = {
    "MCP-Protocol-Version": "2025-03-26",
    ...(process.env.OFFLINE_MCP_ORIGIN
      ? { Origin: String(process.env.OFFLINE_MCP_ORIGIN) }
      : {}),
  };
  await check("MCP", "initialize", "/mcp", {
    method: "POST",
    token: credentials.mcp,
    headers: mcpHeaders,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "commerce-canvas-offline-readiness", version: "1.0.0" },
      },
    },
    validate: ({ payload }) => Boolean(payload?.result?.serverInfo),
  });
  await check("MCP", "tools/list", "/mcp", {
    method: "POST",
    token: credentials.mcp,
    headers: mcpHeaders,
    body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    validate: ({ payload }) => Array.isArray(payload?.result?.tools),
  });
} else {
  skip(
    "MCP",
    "认证握手与工具清单",
    "未提供 OFFLINE_MCP_TOKEN 或 MCP_TOKEN；不创建、不撤销 MCP 令牌",
  );
}

const burstRoutes = [
  { path: "/api/health", token: "" },
  { path: "/release.json", token: "" },
  { path: "/api/admin/status", token: "" },
  ...(credentials.admin
    ? [
        {
          path: "/api/admin/model-deployments?windowDays=7&page=1&pageSize=100",
          token: credentials.admin,
        },
      ]
    : []),
  ...(credentials.user
    ? [
        { path: "/api/models", token: credentials.user },
        { path: boundedBootstrapPath, token: credentials.user },
        { path: "/api/templates", token: credentials.user },
      ]
    : []),
];
const tokenForPath = new Map(
  burstRoutes.map(({ path, token }) => [assertSafeGetPath(path), token]),
);
const burstPlan = buildBurstPlan(
  burstRoutes.map(({ path }) => path),
  config,
);

for (let round = 0; round < burstPlan.length; round += 1) {
  const samples = await Promise.all(
    burstPlan[round].map(async (pathname) => {
      try {
        const response = await fetchResponse(pathname, {
          token: tokenForPath.get(pathname) || "",
        });
        return {
          path: new URL(pathname, "http://offline.local").pathname,
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          latencyMs: response.latencyMs,
        };
      } catch (error) {
        return {
          path: new URL(pathname, "http://offline.local").pathname,
          ok: false,
          status: 0,
          latencyMs: config.timeoutMs,
          error: error.name || "Error",
        };
      }
    }),
  );
  burstSamples.push(...samples);
  const roundSummary = summarizeHttpSamples(samples);
  const detail = `${roundSummary.requestCount} 请求，失败率 ${roundSummary.failureRate}%，avg ${roundSummary.avgLatencyMs}ms，P95 ${roundSummary.p95LatencyMs}ms，max ${roundSummary.maxLatencyMs}ms`;
  (roundSummary.failureCount === 0 ? pass : fail)(
    "并发",
    `第 ${round + 1} 轮`,
    detail,
  );
}

const overallBurst = summarizeHttpSamples(burstSamples);
console.log("\n并发 GET 指标：");
console.log(
  `总计 ${overallBurst.requestCount} 请求｜失败 ${overallBurst.failureCount}｜失败率 ${overallBurst.failureRate}%｜avg ${overallBurst.avgLatencyMs}ms｜P95 ${overallBurst.p95LatencyMs}ms｜max ${overallBurst.maxLatencyMs}ms`,
);
const groupedSamples = new Map();
for (const sample of burstSamples) {
  const pathname = sample.path;
  const group = groupedSamples.get(pathname) || [];
  group.push(sample);
  groupedSamples.set(pathname, group);
}
for (const [pathname, samples] of [...groupedSamples.entries()].sort()) {
  const summary = summarizeHttpSamples(samples);
  console.log(
    `${pathname}｜${summary.requestCount} 请求｜失败率 ${summary.failureRate}%｜avg ${summary.avgLatencyMs}ms｜P95 ${summary.p95LatencyMs}ms｜max ${summary.maxLatencyMs}ms`,
  );
}

console.log("\n检查明细：");
for (const result of results)
  console.log(`${result.status.padEnd(4)}  [${result.scope}] ${result.name}: ${result.detail}`);

const passed = results.filter((result) => result.status === "PASS").length;
const failed = results.filter((result) => result.status === "FAIL").length;
const skipped = results.filter((result) => result.status === "SKIP").length;
console.log(
  `\n结果：${passed} PASS / ${failed} FAIL / ${skipped} SKIP；并发请求 ${overallBurst.requestCount}`,
);
console.log("业务写入接口调用：0；付费/生成/分析/TTS/克隆/上传/任务调用：0；部署动作：0");
if (failed) process.exitCode = 1;

