import process from "node:process";

const expectProduction = process.argv.includes("--expect-production");
const port = Number(process.env.PORT || 8791);
const baseUrl = String(
  process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}`,
).replace(/\/$/, "");
const results = [];

try {
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
} catch {
  console.error("SMOKE_BASE_URL 必须是 HTTP(S) 地址");
  process.exit(2);
}

const record = (name, ok, detail) => results.push({ name, ok, detail });

const request = async (method, pathname, body) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    redirect: "manual",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  const contentType = response.headers.get("content-type") || "";
  const parsedBody = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { response, body: parsedBody };
};

const check = async ({ name, method = "GET", path, status, validate, body }) => {
  try {
    const result = await request(method, path, body);
    const statusOk = Array.isArray(status)
      ? status.includes(result.response.status)
      : result.response.status === status;
    const bodyOk = statusOk && (!validate || validate(result));
    record(
      name,
      bodyOk,
      bodyOk
        ? `${method} ${path} -> ${result.response.status}`
        : `${method} ${path} 期望 ${Array.isArray(status) ? status.join("/") : status}，实际 ${result.response.status}`,
    );
    return result;
  } catch (error) {
    record(name, false, `${method} ${path} 请求失败：${error.name || "Error"}`);
    return null;
  }
};

await check({
  name: "health",
  path: "/api/health",
  status: 200,
  validate: ({ body }) => body?.ok === true && Boolean(body?.release?.build),
});
await check({
  name: "models catalog auth boundary",
  path: "/api/models",
  status: 401,
});
await check({
  name: "admin status",
  path: "/api/admin/status",
  status: 200,
  validate: ({ body }) => typeof body?.configured === "boolean",
});
await check({
  name: "release metadata",
  path: "/release.json",
  status: 200,
  validate: ({ body }) => Boolean(body?.version && body?.build),
});
await check({ name: "user auth boundary", path: "/api/bootstrap", status: 401 });
await check({ name: "admin auth boundary", path: "/api/admin/me", status: 401 });
await check({
  name: "unknown API",
  path: "/api/__launch_smoke_not_found__",
  status: 404,
});
await check({
  name: "API method boundary",
  method: "POST",
  path: "/api/health",
  // The public health route is GET-only. Depending on middleware ordering,
  // an unsupported API method is either rejected by auth or falls through.
  status: [401, 404],
  body: {},
});
await check({
  name: "MCP GET method boundary",
  path: "/mcp",
  status: 405,
  validate: ({ response }) => response.headers.get("allow") === "POST",
});
await check({
  name: "MCP DELETE method boundary",
  method: "DELETE",
  path: "/mcp",
  status: 405,
  validate: ({ response }) => response.headers.get("allow") === "POST",
});
await check({
  name: "MCP auth boundary",
  method: "POST",
  path: "/mcp",
  status: 401,
  body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
});

if (expectProduction) {
  await check({
    name: "studio document",
    path: "/",
    status: 200,
    validate: ({ response, body }) =>
      (response.headers.get("content-type") || "").includes("text/html") &&
      typeof body === "string" &&
      body.includes("<html"),
  });
  await check({
    name: "admin document",
    path: "/admin",
    status: 200,
    validate: ({ response, body }) =>
      (response.headers.get("content-type") || "").includes("text/html") &&
      typeof body === "string" &&
      body.includes("<html"),
  });
  await check({
    name: "missing hashed asset boundary",
    path: "/assets/__launch_smoke_not_found__.js",
    status: 404,
    validate: ({ response }) =>
      !(response.headers.get("content-type") || "").includes("text/html"),
  });
  await check({
    name: "missing template thumbnail boundary",
    path: "/template-thumbnails/__launch_smoke_not_found__.jpg",
    status: 404,
    validate: ({ response }) =>
      !(response.headers.get("content-type") || "").includes("text/html"),
  });
  await check({
    name: "missing file-like path boundary",
    path: "/__launch_smoke_not_found__.jpg",
    status: 404,
    validate: ({ response }) =>
      !(response.headers.get("content-type") || "").includes("text/html"),
  });
  await check({
    name: "missing hot-rank media boundary",
    path: "/qianchuan-hot-rank/__launch_smoke_not_found__.mp4",
    status: 404,
    validate: ({ response }) =>
      !(response.headers.get("content-type") || "").includes("text/html"),
  });

  // Probe the non-mutating console endpoint first. If it is open, stop before
  // touching the studio dev-session endpoint, which can initialise local data.
  const consoleProbe = await check({
    name: "production admin dev backdoor",
    method: "POST",
    path: "/api/dev/admin-console-session",
    status: 404,
    body: {},
  });
  if (consoleProbe?.response.status === 404) {
    await check({
      name: "production studio dev backdoor",
      method: "POST",
      path: "/api/dev/admin-session",
      status: 404,
      body: {},
    });
  } else {
    record(
      "production studio dev backdoor",
      false,
      "未继续探测，避免在非生产服务初始化本地账号元数据",
    );
  }
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}: ${result.detail}`);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
console.log("Paid/generation/provider calls: 0");
if (failed.length) process.exitCode = 1;

