const clean = (value) => String(value ?? "").trim();

export const shellQuote = (value) =>
  `'${String(value ?? "").replaceAll("'", "'\\''")}'`;

export function mcpClientIdentity(role = "user") {
  const adminMode = role === "admin";
  return {
    serverName: adminMode ? "commerce-canvas-admin" : "commerce-canvas",
    envName: adminMode ? "LINGFLOW_ADMIN_MCP_TOKEN" : "LINGFLOW_MCP_TOKEN",
  };
}
export function buildCodexSetup({ endpoint, token, role = "user" }) {
  const normalizedEndpoint = clean(endpoint);
  const normalizedToken = clean(token);
  if (!normalizedEndpoint || !normalizedToken) return "";
  const { serverName, envName } = mcpClientIdentity(role);
  return [
    `export ${envName}=${shellQuote(normalizedToken)}`,
    `codex mcp add ${serverName} --url ${shellQuote(normalizedEndpoint)} --bearer-token-env-var ${envName}`,
    `codex mcp get ${serverName}`,
  ].join("\n");
}

export function buildSiteHandoff({
  endpoint,
  siteUrl,
  role = "user",
  accountName = "当前账号",
  scopeLabel = "仅当前账号",
  tools = [],
  intent = "检查我的创作项目，并给出下一步可执行的优化建议",
}) {
  const { serverName } = mcpClientIdentity(role);
  const adminMode = role === "admin";
  const toolLines = (Array.isArray(tools) ? tools : [])
    .map((tool) => {
      const name = clean(tool?.name);
      const title = clean(tool?.title);
      return name ? `- ${title || name}（${name}）` : "";
    })
    .filter(Boolean)
    .join("\n");
  const normalizedIntent = clean(intent) || "检查我的创作项目，并给出下一步可执行的优化建议";

  return [
    "# Commerce Canvas MCP 站点资料",
    "",
    `请使用已经配置好的 Codex MCP 服务 \`${serverName}\` 操作我的Commerce Canvas。`,
    "不要向我索要登录密码或 MCP 令牌；接入密钥已通过 Codex 环境变量单独配置。",
    "",
    "## 接入范围",
    `- 站点地址：${clean(siteUrl) || "未提供"}`,
    `- MCP 地址：${clean(endpoint) || "未提供"}`,
    `- 传输协议：Streamable HTTP`,
    `- 当前身份：${adminMode ? "平台管理员" : "创作用户"}（${clean(accountName) || "当前账号"}）`,
    `- 数据范围：${clean(scopeLabel) || "仅当前账号"}`,
    `- 后台模板管理：${adminMode ? "允许使用 admin_ 前缀工具" : "不允许"}`,
    "",
    "## 这次要完成的事",
    normalizedIntent,
    "",
    "## 执行要求",
    "1. 先读取账号上下文，再列出与目标相关的项目、素材或任务。",
    "2. 只操作 MCP 返回的授权范围，不推测或访问其他账号数据。",
    "3. 修改画布或模板前先概述改动；提交真实视频任务前必须向我确认积分消耗。",
    "4. 完成后返回变更对象、任务编号、运行状态和仍需我补充的素材。",
    "",
    "## 可用工具",
    toolLines || "- 请通过 MCP tools/list 读取当前工具清单。",
  ].join("\n");
}

