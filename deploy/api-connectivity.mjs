const apiBase = String(process.env.API_BASE_URL || "http://127.0.0.1:8791").replace(/\/$/, "");
const webBase = String(process.env.WEB_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const allowedOrigin = String(
  process.env.MCP_TEST_ORIGIN || "http://127.0.0.1:8791",
).replace(/\/$/, "");
const results = [];

const record = (scope, name, ok, detail) =>
  results.push({ scope, name, ok: Boolean(ok), detail });

async function request(base, pathname, {
  method = "GET",
  token = "",
  headers = {},
  body,
  timeoutMs = 20_000,
} = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return {
    status: response.status,
    payload,
    latencyMs: Math.round(performance.now() - startedAt),
    allow: response.headers.get("allow") || "",
  };
}

async function check(scope, name, pathname, {
  base = apiBase,
  expected = [200],
  validate,
  ...options
} = {}) {
  try {
    const result = await request(base, pathname, options);
    const statusOk = expected.includes(result.status);
    const valid = statusOk && (!validate || validate(result));
    record(
      scope,
      name,
      valid,
      `${options.method || "GET"} ${pathname} -> ${result.status} (${result.latencyMs}ms)`,
    );
    return result;
  } catch (error) {
    record(scope, name, false, `${options.method || "GET"} ${pathname} -> ${error.name || "Error"}`);
    return null;
  }
}

for (const [name, pathname, validate] of [
  ["health", "/api/health", ({ payload }) => payload?.ok === true],
  ["models", "/api/models", ({ payload }) => Array.isArray(payload) && payload.length > 0],
  ["admin status", "/api/admin/status", ({ payload }) => typeof payload?.configured === "boolean"],
  ["teams", "/api/teams/joinable", ({ payload }) => Array.isArray(payload)],
  ["create config", "/api/create-generation-config", ({ payload }) => Boolean(payload?.generateButtonLabel)],
  ["release", "/release.json", ({ payload }) => Boolean(payload?.version && payload?.build)],
])
  await check("public", name, pathname, { validate });

for (const [name, pathname] of [
  ["proxy health", "/api/health"],
  ["proxy models", "/api/models"],
  ["proxy release", "/release.json"],
])
  await check("proxy", name, pathname, { base: webBase });

const userSession = await request(apiBase, "/api/dev/admin-session", {
  method: "POST",
  body: {},
});
const adminSession = await request(apiBase, "/api/dev/admin-console-session", {
  method: "POST",
  body: {},
});
const userToken = userSession.status === 200 ? String(userSession.payload?.token || "") : "";
const adminToken = adminSession.status === 200 ? String(adminSession.payload?.token || "") : "";
record("session", "local user session", Boolean(userToken), `POST /api/dev/admin-session -> ${userSession.status}`);
record("session", "local admin session", Boolean(adminToken), `POST /api/dev/admin-console-session -> ${adminSession.status}`);

if (userToken) {
  for (const [name, pathname, expected = [200]] of [
    ["current user", "/api/auth/me"],
    ["bootstrap", "/api/bootstrap"],
    ["points usage", "/api/account/points-usage"],
    ["points history", "/api/account/points-history"],
    ["prompt framework", "/api/account/prompt-framework"],
    ["analysis profiles", "/api/account/video-analysis-profiles"],
    ["audio status", "/api/audio/status"],
    ["audio voices", "/api/audio/voices"],
    ["digital assets", "/api/digital-assets"],
    ["inspirations", "/api/inspirations?kind=outfit&page=1&pageSize=1", [200, 403]],
    ["analysis tasks", "/api/media/analysis-tasks?limit=1"],
    ["tasks", "/api/tasks"],
    ["generation summary", "/api/generation-time-summary"],
    ["workflow runs", "/api/workflow-runs"],
    ["templates", "/api/templates"],
    ["hidden templates", "/api/templates-hidden-builtins"],
    ["template notices", "/api/template-update-notices"],
    ["hot rank", "/api/hot-rank"],
    ["hot rank config", "/api/hot-rank-remake-config"],
    ["MCP access", "/api/mcp/access"],
    ["MCP audit", "/api/mcp/audit?limit=1"],
  ])
    await check("user", name, pathname, { token: userToken, expected });

  await check("provider", "Kling voices", "/api/kling/voices", {
    token: userToken,
    timeoutMs: 30_000,
  });
  await check("provider", "Kling elements", "/api/kling/elements", {
    token: userToken,
    timeoutMs: 30_000,
  });
  await check("provider", "Volcengine credential", "/api/providers/volcengine/check", {
    token: userToken,
    method: "POST",
    body: {},
    timeoutMs: 30_000,
    validate: ({ payload }) => payload?.ready === true,
  });
}

if (adminToken) {
  for (const [name, pathname] of [
    ["current admin", "/api/admin/me"],
    ["dashboard", "/api/admin/dashboard"],
    ["users", "/api/admin/users"],
    ["points", "/api/admin/points"],
    ["templates", "/api/admin/templates"],
    ["inspiration config", "/api/admin/inspiration-generation-config"],
    ["hot rank config", "/api/admin/hot-rank-remake-config"],
    ["detail templates", "/api/admin/detail-page-templates"],
    ["MCP access", "/api/admin/mcp/access"],
    ["MCP audit", "/api/admin/mcp/audit?limit=1"],
  ])
    await check("admin", name, pathname, { token: adminToken });
}

for (const [name, pathname] of [
  ["image generation", "/api/tasks/image"],
  ["video generation", "/api/tasks/video"],
  ["workflow creation", "/api/workflow-runs"],
  ["media analysis", "/api/media/analyze"],
  ["text generation", "/api/text/generate"],
  ["TTS", "/api/audio/tts"],
  ["voice clone", "/api/audio/voice-clone"],
  ["trusted person upload", "/api/providers/volcengine/trusted-person-assets"],
])
  await check("no-cost-boundary", name, pathname, {
    method: "POST",
    body: {},
    expected: [401],
  });

await check("MCP", "GET method", "/mcp", {
  expected: [405],
  validate: ({ allow }) => allow === "POST",
});
await check("MCP", "anonymous initialize", "/mcp", {
  method: "POST",
  body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  expected: [401],
  headers: { Origin: allowedOrigin },
});

if (userToken) {
  let issued;
  try {
    issued = await request(apiBase, "/api/mcp/tokens", {
      method: "POST",
      token: userToken,
      body: { name: "API 连通性临时测试", expiresInDays: 1 },
    });
    const mcpToken = issued.status === 201 ? String(issued.payload?.token || "") : "";
    const tokenId = String(issued.payload?.record?.id || "");
    record("MCP", "issue temporary token", Boolean(mcpToken && tokenId), `POST /api/mcp/tokens -> ${issued.status}`);
    if (mcpToken && tokenId) {
      await check("MCP", "authenticated initialize", "/mcp", {
        method: "POST",
        token: mcpToken,
        headers: {
          Origin: allowedOrigin,
          "MCP-Protocol-Version": "2025-03-26",
        },
        body: {
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "commerce-canvas-api-connectivity", version: "1.0.0" },
          },
        },
        validate: ({ payload }) => Boolean(payload?.result?.serverInfo),
      });
      await check("MCP", "tools list", "/mcp", {
        method: "POST",
        token: mcpToken,
        headers: {
          Origin: allowedOrigin,
          "MCP-Protocol-Version": "2025-03-26",
        },
        body: { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
        validate: ({ payload }) => Array.isArray(payload?.result?.tools),
      });
      const revoked = await request(apiBase, `/api/mcp/tokens/${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
        token: userToken,
      });
      record("MCP", "revoke temporary token", revoked.status === 200, `DELETE /api/mcp/tokens/:id -> ${revoked.status}`);
      await check("MCP", "revoked token rejected", "/mcp", {
        method: "POST",
        token: mcpToken,
        headers: { Origin: allowedOrigin },
        body: { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
        expected: [401],
      });
    }
  } catch (error) {
    record("MCP", "temporary token lifecycle", false, error?.name || "Error");
  }
}

for (const result of results)
  console.log(`${result.ok ? "PASS" : "FAIL"}  [${result.scope}] ${result.name}: ${result.detail}`);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} API connectivity checks passed; ${failed} failed`);
console.log("Generation/analysis/TTS/voice-clone/task calls: 0");
console.log("Provider calls: read-only authentication/list probes only");
if (failed) process.exitCode = 1;

