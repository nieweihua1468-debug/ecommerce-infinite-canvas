import test from "node:test";
import assert from "node:assert/strict";
import {
  createMcpService,
  isAllowedMcpOrigin,
  MCP_PROTOCOL_VERSIONS,
  toolsForRole,
} from "./mcp.js";

function memoryStore(seed = {}) {
  const collections = new Map(
    Object.entries(seed).map(([name, value]) => [name, structuredClone(value)]),
  );
  return {
    collections,
    readCollection: async (name, fallback) =>
      collections.has(name) ? collections.get(name) : structuredClone(fallback),
    mutateCollection: async (name, mutate, fallback = []) => {
      const current = collections.has(name)
        ? collections.get(name)
        : structuredClone(fallback);
      const next = await mutate(current);
      collections.set(name, next);
      return next;
    },
  };
}

const creator = {
  id: "user-1",
  name: "创作者一号",
  accountType: "creator",
  status: "active",
  pointsBalance: 80,
};
const admin = {
  id: "admin-1",
  name: "平台管理员",
  accountType: "admin",
  status: "active",
  pointsBalance: 1000,
};

function createFixture() {
  const store = memoryStore({
    users: [creator, admin],
    templates: [
      {
        id: "own-project",
        ownerId: creator.id,
        name: "我的项目",
        visibility: "private",
        nodes: [],
        edges: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "other-project",
        ownerId: admin.id,
        name: "管理员项目",
        visibility: "global",
        nodes: [],
        edges: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    tasks: [],
    workflow_runs: [],
    digital_assets: [],
  });
  const service = createMcpService({
    readCollection: store.readCollection,
    mutateCollection: store.mutateCollection,
    now: () => new Date("2026-08-02T00:00:00.000Z"),
    submitVideo: async (input, ownerId) => ({
      id: "video-task",
      ownerId,
      prompt: input.prompt,
      status: "queued",
    }),
  });
  return { service, store };
}

test("MCP 令牌只保存哈希且普通账号不会获得管理员工具", async () => {
  const { service, store } = createFixture();
  const issued = await service.issueToken({
    userId: creator.id,
    name: "我的 Codex",
    expiresInDays: 90,
  });
  assert.match(issued.token, /^lfmcp_/);
  const stored = store.collections.get("mcp_tokens")[0];
  assert.equal(stored.token, undefined);
  assert.notEqual(stored.tokenHash, issued.token);
  const principal = await service.authenticate(issued.token);
  assert.equal(principal.role, "user");
  assert.equal(
    toolsForRole("user").some((tool) => tool.name.startsWith("admin_")),
    false,
  );
  const access = service.accessInfo(principal, "http://127.0.0.1:8791/mcp", []);
  assert.deepEqual(access.account, {
    id: creator.id,
    name: creator.name,
    plan: "免费版",
  });
  assert.equal(access.scope.label, "仅当前账号本人数据");
  assert.equal(access.scope.canManageBackendTemplates, false);
});

test("普通 MCP 只能读取和修改令牌所属账号自己的前端项目", async () => {
  const { service, store } = createFixture();
  const issued = await service.issueToken({ userId: creator.id, name: "创作 MCP" });
  const principal = await service.authenticate(issued.token);
  const listed = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "studio_list_projects", arguments: {} },
  });
  assert.equal(listed.result.structuredContent.data.length, 1);
  assert.equal(listed.result.structuredContent.data[0].id, "own-project");

  const forbidden = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "studio_update_project",
      arguments: { projectId: "other-project", name: "越权修改" },
    },
  });
  assert.equal(forbidden.result.isError, true);
  assert.match(forbidden.result.content[0].text, /不属于当前账号/);
  assert.equal(
    store.collections.get("templates").find((item) => item.id === "other-project").name,
    "管理员项目",
  );
});

test("管理员 MCP 提供后台模板管理并记录不含参数正文的审计日志", async () => {
  const { service, store } = createFixture();
  const issued = await service.issueToken({
    userId: admin.id,
    name: "后台 Codex",
    forceAdmin: true,
    source: "admin_console",
  });
  const principal = await service.authenticate(issued.token);
  const response = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "admin_update_template",
      arguments: {
        templateId: "own-project",
        description: "敏感提示词不应进入审计正文",
        visibility: "global",
      },
    },
  });
  assert.equal(response.result.isError, undefined);
  assert.equal(response.result.structuredContent.visibility, "global");
  assert.equal(response.result.structuredContent.public, true);
  const audit = store.collections.get("mcp_audit_logs")[0];
  assert.equal(audit.toolName, "admin_update_template");
  assert.equal(audit.ok, true);
  assert.doesNotMatch(JSON.stringify(audit), /敏感提示词/);
});

test("真实视频提交必须显式确认积分消耗", async () => {
  const { service } = createFixture();
  const issued = await service.issueToken({ userId: creator.id, name: "视频 MCP" });
  const principal = await service.authenticate(issued.token);
  const denied = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "studio_submit_video_task",
      arguments: { prompt: "商品走秀", confirmBilling: false },
    },
  });
  assert.equal(denied.result.isError, true);
  const accepted = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "studio_submit_video_task",
      arguments: { prompt: "商品走秀", confirmBilling: true },
    },
  });
  assert.equal(accepted.result.structuredContent.status, "queued");
  assert.equal(accepted.result.structuredContent.ownerId, creator.id);
});

test("MCP 初始化协商协议并按角色返回确定的工具列表", async () => {
  const { service } = createFixture();
  const issued = await service.issueToken({ userId: creator.id, name: "协议测试" });
  const principal = await service.authenticate(issued.token);
  const initialized = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 6,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {} },
  });
  assert.equal(initialized.result.protocolVersion, "2025-06-18");
  assert.ok(MCP_PROTOCOL_VERSIONS.includes(initialized.result.protocolVersion));
  const tools = await service.handleRpc(principal, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/list",
    params: {},
  });
  assert.deepEqual(
    tools.result.tools.map((tool) => tool.name),
    toolsForRole("user").map((tool) => tool.name),
  );
});

test("Streamable HTTP Origin 校验允许同源并拒绝未知站点", () => {
  const request = (origin) => ({
    protocol: "http",
    headers: { origin },
    get: (name) => (name === "host" ? "127.0.0.1:8791" : ""),
  });
  assert.equal(isAllowedMcpOrigin(request("http://127.0.0.1:8791")), true);
  assert.equal(isAllowedMcpOrigin(request("http://127.0.0.1:5173")), true);
  assert.equal(isAllowedMcpOrigin(request("https://evil.example")), false);
  assert.equal(
    isAllowedMcpOrigin(request("https://trusted.example"), ["https://trusted.example"]),
    true,
  );
});

