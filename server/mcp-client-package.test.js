import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexSetup,
  buildSiteHandoff,
  mcpClientIdentity,
} from "../shared/mcp-client-package.js";

test("Codex MCP 安装命令通过环境变量传递令牌", () => {
  const command = buildCodexSetup({
    endpoint: "http://127.0.0.1:5173/mcp",
    token: "lfmcp_secret",
    role: "user",
  });
  assert.match(command, /export LINGFLOW_MCP_TOKEN='lfmcp_secret'/);
  assert.match(command, /codex mcp add commerce-canvas --url 'http:\/\/127\.0\.0\.1:5173\/mcp'/);
  assert.match(command, /--bearer-token-env-var LINGFLOW_MCP_TOKEN/);
  assert.deepEqual(mcpClientIdentity("admin"), {
    serverName: "commerce-canvas-admin",
    envName: "LINGFLOW_ADMIN_MCP_TOKEN",
  });
});
test("复制给 Codex 的站点资料不包含 MCP 密钥", () => {
  const handoff = buildSiteHandoff({
    endpoint: "http://127.0.0.1:5173/mcp",
    siteUrl: "http://127.0.0.1:5173/#/create",
    role: "user",
    accountName: "创作者一号",
    scopeLabel: "仅当前账号本人数据",
    intent: "优化我的千川口播项目",
    tools: [{ name: "studio_list_projects", title: "列出我的画布项目" }],
  });
  assert.match(handoff, /优化我的千川口播项目/);
  assert.match(handoff, /studio_list_projects/);
  assert.match(handoff, /不允许/);
  assert.doesNotMatch(handoff, /lfmcp_/);
  assert.doesNotMatch(handoff, /LINGFLOW_MCP_TOKEN/);
});

