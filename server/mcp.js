import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const SERVER_INFO = Object.freeze({
  name: "commerce-canvas",
  title: "Commerce Canvas 创作 MCP",
  version: "1.0.0",
});

export const MCP_PROTOCOL_VERSIONS = Object.freeze([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
]);

const DEFAULT_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0];
const TOKEN_COLLECTION = "mcp_tokens";
const AUDIT_COLLECTION = "mcp_audit_logs";
const MAX_ACTIVE_TOKENS = 8;
const MAX_AUDIT_ENTRIES = 5_000;
const TOOL_RATE_LIMIT = 120;
const rateWindows = new Map();

const text = (value, limit = 200) =>
  String(value ?? "").trim().slice(0, limit);

const hashToken = (token) =>
  createHash("sha256").update(String(token || "")).digest("hex");

const safeHashEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const effectiveOwnerId = (item) => String(item?.ownerId || "");
const ownedBy = (item, userId) =>
  effectiveOwnerId(item) === String(userId || "");
const isPlatformAdmin = (user) => user?.accountType === "admin";
const isActiveToken = (record, now = Date.now()) =>
  !record.revokedAt && new Date(record.expiresAt).getTime() > now;

const publicTokenRecord = ({ tokenHash: _tokenHash, ...record }) => ({
  ...record,
  isActive: isActiveToken(record),
});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  accountType: isPlatformAdmin(user) ? "admin" : "creator",
  plan: user.plan || "免费版",
  pointsBalance: Number(user.pointsBalance || 0),
  teamId: String(user.teamId || ""),
  teamRole: String(user.teamRole || ""),
  company: String(user.company || ""),
  jobTitle: String(user.jobTitle || ""),
});

const publicTask = ({
  upstreamPayload: _upstreamPayload,
  recoveryInput: _recoveryInput,
  recoveryAssets: _recoveryAssets,
  ...task
}) => task;

const projectSummary = (project) => ({
  id: project.id,
  name: project.name,
  description: project.description || "",
  category: project.category || "自定义",
  enabled: project.enabled !== false,
  visibility: project.visibility || "private",
  runMode: project.runMode || "backend",
  revision: Math.max(1, Number(project.revision) || 1),
  nodeCount: Array.isArray(project.nodes) ? project.nodes.length : 0,
  edgeCount: Array.isArray(project.edges) ? project.edges.length : 0,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

const assetSummary = (asset) => ({
  id: asset.id,
  name: asset.name,
  kind: asset.kind,
  imageCount: Array.isArray(asset.images)
    ? asset.images.length
    : Number(asset.imageCount || 0),
  sourceTaskId: String(asset.sourceTaskId || ""),
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
});

const jsonContent = (value) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(value, null, 2),
    },
  ],
  structuredContent: value,
});

const toolErrorContent = (error) => ({
  content: [
    {
      type: "text",
      text: error?.message || "MCP 工具执行失败",
    },
  ],
  isError: true,
});

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message, data) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: {
    code,
    message,
    ...(data === undefined ? {} : { data }),
  },
});

const assertRecord = (value, message = "参数必须是对象") => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Object.assign(new Error(message), { status: 400, code: "INVALID_PARAMS" });
  return value;
};

const normalizeGraph = (nodesInput, edgesInput) => {
  const nodes = Array.isArray(nodesInput) ? nodesInput : [];
  const edges = Array.isArray(edgesInput) ? edgesInput : [];
  if (nodes.length > 200)
    throw Object.assign(new Error("单个项目最多支持 200 个节点"), {
      status: 400,
      code: "GRAPH_TOO_LARGE",
    });
  if (edges.length > 400)
    throw Object.assign(new Error("单个项目最多支持 400 条连线"), {
      status: 400,
      code: "GRAPH_TOO_LARGE",
    });
  const encoded = JSON.stringify({ nodes, edges });
  if (Buffer.byteLength(encoded) > 2 * 1024 * 1024)
    throw Object.assign(new Error("项目节点数据不能超过 2MB"), {
      status: 413,
      code: "GRAPH_TOO_LARGE",
    });
  const ids = new Set();
  for (const node of nodes) {
    assertRecord(node, "每个节点必须是对象");
    const id = text(node.id, 120);
    if (!id || ids.has(id))
      throw Object.assign(new Error("节点 ID 不能为空且不能重复"), {
        status: 400,
        code: "INVALID_GRAPH",
      });
    ids.add(id);
  }
  for (const edge of edges) {
    assertRecord(edge, "每条连线必须是对象");
    if (!ids.has(String(edge.source || "")) || !ids.has(String(edge.target || "")))
      throw Object.assign(new Error("连线必须指向项目内已有节点"), {
        status: 400,
        code: "INVALID_GRAPH",
      });
  }
  return { nodes, edges };
};

const paginate = (items, args = {}) => {
  const pageSize = Math.max(1, Math.min(50, Number(args.pageSize) || 20));
  const cursor = Math.max(0, Number.parseInt(String(args.cursor || "0"), 10) || 0);
  const data = items.slice(cursor, cursor + pageSize);
  const nextOffset = cursor + data.length;
  return {
    data,
    pagination: {
      pageSize,
      totalItems: items.length,
      nextCursor: nextOffset < items.length ? String(nextOffset) : null,
    },
  };
};

const commonPaginationProperties = {
  cursor: {
    type: "string",
    description: "上一页返回的 nextCursor；首次请求留空",
  },
  pageSize: {
    type: "integer",
    minimum: 1,
    maximum: 50,
    default: 20,
  },
};

const USER_TOOLS = Object.freeze([
  {
    name: "studio_get_account_context",
    title: "读取当前创作账号",
    description: "读取当前 MCP 令牌所属的Commerce Canvas账号、套餐、积分和本人内容数量。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "studio_list_projects",
    title: "列出我的画布项目",
    description: "只列出当前账号本人创建的项目，不返回其他用户或公共模板。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 80, description: "按名称或描述搜索" },
        ...commonPaginationProperties,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "studio_get_project",
    title: "读取我的画布项目",
    description: "读取当前账号本人的单个画布项目，包括节点和连线。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", minLength: 1, maxLength: 120 } },
      required: ["projectId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "studio_create_project",
    title: "创建私人画布项目",
    description: "为当前账号创建私人项目。项目不会自动公开或提交生成。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 600 },
        category: { type: "string", maxLength: 30 },
        nodes: { type: "array", maxItems: 200, items: { type: "object" } },
        edges: { type: "array", maxItems: 400, items: { type: "object" } },
      },
      required: ["name", "nodes", "edges"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "studio_update_project",
    title: "修改我的画布项目",
    description: "修改当前账号本人的画布名称、说明、分类或节点连线；不会改变所有者或公开范围。",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1, maxLength: 120 },
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 600 },
        category: { type: "string", maxLength: 30 },
        nodes: { type: "array", maxItems: 200, items: { type: "object" } },
        edges: { type: "array", maxItems: 400, items: { type: "object" } },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "studio_list_assets",
    title: "列出我的数字资产",
    description: "列出当前账号本人的人物、服装、数字人和模板原创资产元数据。",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["person", "face", "clothing", "avatar", "template_original"] },
        ...commonPaginationProperties,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "studio_list_tasks",
    title: "列出我的生成任务",
    description: "列出当前账号本人的图片或视频生成任务及状态。",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["submitting", "queued", "processing", "succeeded", "failed"] },
        ...commonPaginationProperties,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "studio_list_workflow_runs",
    title: "列出我的画布运行",
    description: "列出当前账号本人的项目运行记录和步骤状态。",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["queued", "processing", "succeeded", "failed", "terminated"] },
        ...commonPaginationProperties,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "studio_submit_video_task",
    title: "提交视频生成任务",
    description: "使用当前账号积分提交真实视频生成任务。调用前必须获得用户确认并传 confirmBilling=true。",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 8000 },
        modelName: {
          type: "string",
          enum: ["kling-v3", "kling-v3-omni", "doubao-seedance-2-0-fast-260128"],
          default: "kling-v3",
        },
        aspectRatio: { type: "string", enum: ["9:16", "16:9", "1:1"], default: "9:16" },
        duration: { type: "integer", minimum: 3, maximum: 15, default: 5 },
        mode: { type: "string", enum: ["std", "pro"], default: "pro" },
        digitalAssetIds: { type: "array", maxItems: 3, items: { type: "string" } },
        confirmBilling: { type: "boolean", const: true, description: "必须明确为 true 才会提交并消耗积分" },
      },
      required: ["prompt", "confirmBilling"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
]);

const ADMIN_TOOLS = Object.freeze([
  {
    name: "admin_list_templates",
    title: "后台列出全部模板",
    description: "管理员查看后台全部系统和自定义模板的状态、范围与节点数量。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 80 },
        ...commonPaginationProperties,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "admin_get_template",
    title: "后台读取模板",
    description: "管理员读取单个后台模板及完整节点、连线和发布信息。",
    inputSchema: {
      type: "object",
      properties: { templateId: { type: "string", minLength: 1, maxLength: 120 } },
      required: ["templateId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "admin_create_template",
    title: "后台创建模板",
    description: "管理员创建后台画布模板，可保存为私有或直接发布为全局模板。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 600 },
        category: { type: "string", maxLength: 30 },
        visibility: { type: "string", enum: ["private", "global"], default: "private" },
        enabled: { type: "boolean", default: true },
        nodes: { type: "array", maxItems: 200, items: { type: "object" } },
        edges: { type: "array", maxItems: 400, items: { type: "object" } },
      },
      required: ["name", "nodes", "edges"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "admin_update_template",
    title: "后台修改模板",
    description: "管理员修改自定义模板的名称、说明、分类、节点、连线、启用状态或发布范围。系统内置模板只读。",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string", minLength: 1, maxLength: 120 },
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 600 },
        category: { type: "string", maxLength: 30 },
        visibility: { type: "string", enum: ["private", "team", "global"] },
        enabled: { type: "boolean" },
        nodes: { type: "array", maxItems: 200, items: { type: "object" } },
        edges: { type: "array", maxItems: 400, items: { type: "object" } },
      },
      required: ["templateId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "admin_archive_template",
    title: "后台归档模板",
    description: "管理员停用自定义模板但保留数据和历史；系统内置模板不能归档。",
    inputSchema: {
      type: "object",
      properties: { templateId: { type: "string", minLength: 1, maxLength: 120 } },
      required: ["templateId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "admin_list_mcp_audit",
    title: "查看 MCP 审计日志",
    description: "管理员查看最近的 MCP 工具调用结果；日志不保存提示词和素材正文。",
    inputSchema: {
      type: "object",
      properties: { ...commonPaginationProperties },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
]);

export const toolsForRole = (role) =>
  role === "admin" ? [...USER_TOOLS, ...ADMIN_TOOLS] : [...USER_TOOLS];

const promptDefinitions = (role) => [
  {
    name: "commerce-canvas_video_creator",
    title: "Commerce Canvas视频创作助手",
    description: "让 Codex 先理解本人项目和资产，再协助创建或优化视频画布。",
    arguments: [],
  },
  ...(role === "admin"
    ? [
        {
          name: "commerce-canvas_template_operator",
          title: "Commerce Canvas模板运营助手",
          description: "让 Codex 审查后台模板并安全更新、发布或归档模板。",
          arguments: [],
        },
      ]
    : []),
];

const resourcesForRole = (role) => [
  {
    uri: "commerce-canvas://account/context",
    name: "当前Commerce Canvas账号上下文",
    description: "当前 MCP 令牌所属账号和本人内容统计",
    mimeType: "application/json",
  },
  {
    uri: "commerce-canvas://account/projects",
    name: "我的Commerce Canvas画布项目",
    description: "当前账号本人创建的画布项目摘要",
    mimeType: "application/json",
  },
  ...(role === "admin"
    ? [
        {
          uri: "commerce-canvas://admin/templates",
          name: "后台模板目录",
          description: "管理员可见的全部后台模板摘要",
          mimeType: "application/json",
        },
      ]
    : []),
];

const roleForUser = (user) => (isPlatformAdmin(user) ? "admin" : "user");

export function createMcpService({
  readCollection,
  mutateCollection,
  systemTemplates = [],
  submitVideo,
  now = () => new Date(),
}) {
  if (typeof readCollection !== "function" || typeof mutateCollection !== "function")
    throw new Error("MCP 服务需要持久化数据读写能力");

  const currentDate = () => new Date(now());
  const findUser = async (userId) => {
    const users = await readCollection("users", []);
    return users.find((item) => String(item.id) === String(userId || ""));
  };

  const accessInfo = (principal, endpoint, tokens = []) => ({
    endpoint,
    transport: "streamable-http",
    protocolVersions: MCP_PROTOCOL_VERSIONS,
    role: principal.role,
    account: {
      id: principal.user.id,
      name: principal.user.name,
      plan: principal.user.plan || "免费版",
    },
    scope: {
      kind: "account",
      label:
        principal.role === "admin"
          ? "当前主账号创作数据 + 后台模板管理"
          : "仅当前账号本人数据",
      canManageBackendTemplates: principal.role === "admin",
    },
    tools: toolsForRole(principal.role).map(({ name, title, description }) => ({
      name,
      title,
      description,
    })),
    tokens: tokens.map(publicTokenRecord),
  });

  const issueToken = async ({
    userId,
    name,
    expiresInDays = 90,
    source = "studio_account",
    issuedBy = "",
    forceAdmin = false,
  }) => {
    const user = await findUser(userId);
    if (!user || user.status !== "active")
      throw Object.assign(new Error("账号不存在或已停用"), { status: 401 });
    const role = forceAdmin ? "admin" : roleForUser(user);
    if (role === "admin" && !isPlatformAdmin(user))
      throw Object.assign(new Error("只有平台管理员账号可以创建管理员 MCP"), {
        status: 403,
      });
    const tokenName = text(name, 60);
    if (tokenName.length < 2)
      throw Object.assign(new Error("MCP 令牌名称至少需要 2 个字符"), {
        status: 400,
      });
    const days = Math.max(1, Math.min(365, Number(expiresInDays) || 90));
    const records = await readCollection(TOKEN_COLLECTION, []);
    const activeCount = records.filter(
      (item) => item.userId === user.id && isActiveToken(item, currentDate().getTime()),
    ).length;
    if (activeCount >= MAX_ACTIVE_TOKENS)
      throw Object.assign(
        new Error(`每个账号最多保留 ${MAX_ACTIVE_TOKENS} 个有效 MCP 令牌`),
        { status: 409 },
      );
    const secret = `lfmcp_${randomBytes(32).toString("base64url")}`;
    const createdAt = currentDate();
    const record = {
      id: randomUUID(),
      userId: user.id,
      name: tokenName,
      tokenHash: hashToken(secret),
      tokenPrefix: `${secret.slice(0, 13)}…`,
      role,
      source,
      issuedBy: text(issuedBy, 80),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + days * 86_400_000).toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    await mutateCollection(TOKEN_COLLECTION, (items) => [record, ...items].slice(0, 1000));
    return { token: secret, record: publicTokenRecord(record), role, user: publicUser(user) };
  };

  const listTokens = async ({ userId, role } = {}) => {
    const records = await readCollection(TOKEN_COLLECTION, []);
    return records
      .filter(
        (item) =>
          (!userId || item.userId === userId) && (!role || item.role === role),
      )
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map(publicTokenRecord);
  };

  const revokeToken = async ({ tokenId, userId, role }) => {
    let revoked = null;
    const revokedAt = currentDate().toISOString();
    await mutateCollection(TOKEN_COLLECTION, (records) =>
      records.map((record) => {
        if (
          record.id !== tokenId ||
          (userId && record.userId !== userId) ||
          (role && record.role !== role)
        )
          return record;
        revoked = { ...record, revokedAt };
        return revoked;
      }),
    );
    if (!revoked)
      throw Object.assign(new Error("MCP 令牌不存在或无权操作"), { status: 404 });
    return publicTokenRecord(revoked);
  };

  const authenticate = async (secret) => {
    const candidateHash = hashToken(secret);
    const records = await readCollection(TOKEN_COLLECTION, []);
    const record = records.find(
      (item) => isActiveToken(item, currentDate().getTime()) && safeHashEqual(item.tokenHash, candidateHash),
    );
    if (!record)
      throw Object.assign(new Error("MCP 令牌无效、已过期或已撤销"), { status: 401 });
    const user = await findUser(record.userId);
    if (!user || user.status !== "active")
      throw Object.assign(new Error("MCP 令牌所属账号不存在或已停用"), { status: 401 });
    const currentRole = roleForUser(user);
    if (record.role === "admin" && currentRole !== "admin")
      throw Object.assign(new Error("该账号已不再具备管理员 MCP 权限"), { status: 403 });
    return {
      tokenId: record.id,
      userId: user.id,
      role: record.role === "admin" ? "admin" : "user",
      user,
      tokenName: record.name,
    };
  };

  const checkRateLimit = (principal) => {
    const timestamp = currentDate().getTime();
    const existing = rateWindows.get(principal.tokenId);
    const window = !existing || timestamp - existing.startedAt >= 60_000
      ? { startedAt: timestamp, count: 0 }
      : existing;
    window.count += 1;
    rateWindows.set(principal.tokenId, window);
    if (window.count > TOOL_RATE_LIMIT)
      throw Object.assign(new Error("MCP 调用过于频繁，请稍后再试"), {
        status: 429,
        code: "RATE_LIMITED",
      });
  };

  const recordAudit = async ({ principal, method, toolName = "", ok, durationMs, errorCode = "" }) => {
    if (!principal) return;
    const entry = {
      id: randomUUID(),
      tokenId: principal.tokenId,
      tokenName: principal.tokenName,
      userId: principal.userId,
      role: principal.role,
      method: text(method, 80),
      toolName: text(toolName, 120),
      ok: Boolean(ok),
      durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
      errorCode: text(errorCode, 80),
      createdAt: currentDate().toISOString(),
    };
    await Promise.all([
      mutateCollection(AUDIT_COLLECTION, (items) => [entry, ...items].slice(0, MAX_AUDIT_ENTRIES)),
      mutateCollection(TOKEN_COLLECTION, (items) =>
        items.map((item) =>
          item.id === principal.tokenId
            ? { ...item, lastUsedAt: entry.createdAt }
            : item,
        ),
      ),
    ]);
  };

  const listAudit = async ({ userId, role, limit = 100 } = {}) => {
    const items = await readCollection(AUDIT_COLLECTION, []);
    return items
      .filter((item) => (!userId || item.userId === userId) && (!role || item.role === role))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  };

  const accountContext = async (principal) => {
    const [templates, assets, tasks, runs] = await Promise.all([
      readCollection("templates", []),
      readCollection("digital_assets", []),
      readCollection("tasks", []),
      readCollection("workflow_runs", []),
    ]);
    return {
      user: publicUser(principal.user),
      access: {
        role: principal.role,
        canManageBackendTemplates: principal.role === "admin",
      },
      counts: {
        projects: templates.filter((item) => ownedBy(item, principal.userId)).length,
        assets: assets.filter((item) => ownedBy(item, principal.userId) && !item.deletedAt).length,
        tasks: tasks.filter((item) => ownedBy(item, principal.userId)).length,
        workflowRuns: runs.filter((item) => ownedBy(item, principal.userId)).length,
      },
    };
  };

  const allAdminTemplates = async () => {
    const custom = await readCollection("templates", []);
    return [
      ...systemTemplates.map((item) => ({ ...item, system: true })),
      ...custom.map((item) => ({ ...item, system: false })),
    ];
  };

  const callTool = async (principal, name, rawArgs = {}) => {
    const args = assertRecord(rawArgs || {});
    if (!toolsForRole(principal.role).some((tool) => tool.name === name))
      throw Object.assign(new Error("工具不存在或当前 MCP 令牌无权调用"), {
        status: 403,
        code: "TOOL_NOT_ALLOWED",
      });

    if (name === "studio_get_account_context")
      return accountContext(principal);

    if (name === "studio_list_projects") {
      const query = text(args.query, 80).toLowerCase();
      const templates = await readCollection("templates", []);
      const projects = templates
        .filter((item) => ownedBy(item, principal.userId))
        .filter((item) => !query || `${item.name || ""} ${item.description || ""}`.toLowerCase().includes(query))
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
        .map(projectSummary);
      return paginate(projects, args);
    }

    if (name === "studio_get_project") {
      const templates = await readCollection("templates", []);
      const project = templates.find(
        (item) => item.id === text(args.projectId, 120) && ownedBy(item, principal.userId),
      );
      if (!project)
        throw Object.assign(new Error("项目不存在或不属于当前账号"), { status: 404 });
      return project;
    }

    if (name === "studio_create_project") {
      const projectName = text(args.name, 80);
      if (!projectName)
        throw Object.assign(new Error("项目名称不能为空"), { status: 400 });
      const graph = normalizeGraph(args.nodes, args.edges);
      const timestamp = currentDate().toISOString();
      const project = {
        id: randomUUID(),
        ownerId: principal.userId,
        name: projectName,
        description: text(args.description, 600),
        category: text(args.category || "MCP 创作", 30),
        accent: "#daff51",
        visibility: "private",
        public: false,
        approvalStatus: "private",
        enabled: true,
        runMode: "backend",
        ...graph,
        revision: 1,
        revisionHistory: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await mutateCollection("templates", (items) => [project, ...items]);
      return project;
    }

    if (name === "studio_update_project") {
      const projectId = text(args.projectId, 120);
      let updated = null;
      await mutateCollection("templates", (items) =>
        items.map((item) => {
          if (item.id !== projectId || !ownedBy(item, principal.userId)) return item;
          const graph =
            args.nodes !== undefined || args.edges !== undefined
              ? normalizeGraph(args.nodes ?? item.nodes, args.edges ?? item.edges)
              : { nodes: item.nodes || [], edges: item.edges || [] };
          updated = {
            ...item,
            ...(args.name !== undefined ? { name: text(args.name, 80) } : {}),
            ...(args.description !== undefined ? { description: text(args.description, 600) } : {}),
            ...(args.category !== undefined ? { category: text(args.category, 30) } : {}),
            ...graph,
            ownerId: principal.userId,
            visibility: item.visibility || "private",
            updatedAt: currentDate().toISOString(),
          };
          if (!updated.name)
            throw Object.assign(new Error("项目名称不能为空"), { status: 400 });
          return updated;
        }),
      );
      if (!updated)
        throw Object.assign(new Error("项目不存在或不属于当前账号"), { status: 404 });
      return updated;
    }

    if (name === "studio_list_assets") {
      const assets = await readCollection("digital_assets", []);
      const visible = assets
        .filter((item) => ownedBy(item, principal.userId) && !item.deletedAt)
        .filter((item) => !args.kind || item.kind === args.kind)
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
        .map(assetSummary);
      return paginate(visible, args);
    }

    if (name === "studio_list_tasks") {
      const tasks = await readCollection("tasks", []);
      const visible = tasks
        .filter((item) => ownedBy(item, principal.userId))
        .filter((item) => !args.status || item.status === args.status)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .map(publicTask);
      return paginate(visible, args);
    }

    if (name === "studio_list_workflow_runs") {
      const runs = await readCollection("workflow_runs", []);
      const visible = runs
        .filter((item) => ownedBy(item, principal.userId))
        .filter((item) => !args.status || item.status === args.status)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .map(publicTask);
      return paginate(visible, args);
    }

    if (name === "studio_submit_video_task") {
      if (args.confirmBilling !== true)
        throw Object.assign(new Error("提交真实生成任务前必须确认积分消耗"), {
          status: 400,
          code: "BILLING_CONFIRMATION_REQUIRED",
        });
      if (typeof submitVideo !== "function")
        throw Object.assign(new Error("视频生成服务暂不可用"), { status: 503 });
      return submitVideo(
        {
          prompt: text(args.prompt, 8000),
          modelName: text(args.modelName || "kling-v3", 80),
          aspectRatio: text(args.aspectRatio || "9:16", 12),
          duration: Math.max(3, Math.min(15, Number(args.duration) || 5)),
          mode: ["std", "pro"].includes(args.mode) ? args.mode : "pro",
          digitalAssetIds: Array.isArray(args.digitalAssetIds)
            ? args.digitalAssetIds.map((id) => text(id, 120)).filter(Boolean).slice(0, 3)
            : [],
          source: "mcp",
          fileName: "MCP 视频创作",
        },
        principal.userId,
      );
    }

    if (principal.role !== "admin")
      throw Object.assign(new Error("只有管理员 MCP 可以调用后台工具"), { status: 403 });

    if (name === "admin_list_templates") {
      const query = text(args.query, 80).toLowerCase();
      const templates = (await allAdminTemplates())
        .filter((item) => !query || `${item.name || ""} ${item.description || ""}`.toLowerCase().includes(query))
        .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
        .map((item) => ({ ...projectSummary(item), system: Boolean(item.system), ownerId: effectiveOwnerId(item) }));
      return paginate(templates, args);
    }

    if (name === "admin_get_template") {
      const template = (await allAdminTemplates()).find(
        (item) => item.id === text(args.templateId, 120),
      );
      if (!template) throw Object.assign(new Error("模板不存在"), { status: 404 });
      return template;
    }

    if (name === "admin_create_template") {
      const templateName = text(args.name, 80);
      if (!templateName) throw Object.assign(new Error("模板名称不能为空"), { status: 400 });
      const graph = normalizeGraph(args.nodes, args.edges);
      const visibility = args.visibility === "global" ? "global" : "private";
      const timestamp = currentDate().toISOString();
      const template = {
        id: randomUUID(),
        ownerId: principal.userId,
        name: templateName,
        description: text(args.description, 600),
        category: text(args.category || "MCP 后台", 30),
        accent: "#daff51",
        visibility,
        public: visibility === "global",
        approvalStatus: visibility === "global" ? "approved" : "private",
        reviewedAt: timestamp,
        reviewedBy: principal.user.name || "MCP 管理员",
        enabled: args.enabled !== false,
        runMode: "backend",
        ...graph,
        revision: 1,
        revisionHistory: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await mutateCollection("templates", (items) => [template, ...items]);
      return template;
    }

    if (name === "admin_update_template") {
      const templateId = text(args.templateId, 120);
      if (systemTemplates.some((item) => item.id === templateId))
        throw Object.assign(new Error("系统模板只读，请复制为自定义模板后编辑"), { status: 400 });
      let updated = null;
      await mutateCollection("templates", (items) =>
        items.map((item) => {
          if (item.id !== templateId) return item;
          const graph =
            args.nodes !== undefined || args.edges !== undefined
              ? normalizeGraph(args.nodes ?? item.nodes, args.edges ?? item.edges)
              : { nodes: item.nodes || [], edges: item.edges || [] };
          const visibility = args.visibility === undefined
            ? item.visibility || "private"
            : ["private", "team", "global"].includes(args.visibility)
              ? args.visibility
              : item.visibility || "private";
          updated = {
            ...item,
            ...(args.name !== undefined ? { name: text(args.name, 80) } : {}),
            ...(args.description !== undefined ? { description: text(args.description, 600) } : {}),
            ...(args.category !== undefined ? { category: text(args.category, 30) } : {}),
            ...(args.enabled !== undefined ? { enabled: Boolean(args.enabled) } : {}),
            ...graph,
            visibility,
            public: visibility === "global",
            approvalStatus: visibility === "global" ? "approved" : visibility === "private" ? "private" : item.approvalStatus || "approved",
            runMode: "backend",
            revision: Math.max(1, Number(item.revision) || 1) + 1,
            reviewedAt: currentDate().toISOString(),
            reviewedBy: principal.user.name || "MCP 管理员",
            updatedAt: currentDate().toISOString(),
          };
          if (!updated.name)
            throw Object.assign(new Error("模板名称不能为空"), { status: 400 });
          return updated;
        }),
      );
      if (!updated) throw Object.assign(new Error("模板不存在"), { status: 404 });
      return updated;
    }

    if (name === "admin_archive_template") {
      const templateId = text(args.templateId, 120);
      if (systemTemplates.some((item) => item.id === templateId))
        throw Object.assign(new Error("系统模板不能归档"), { status: 400 });
      let updated = null;
      await mutateCollection("templates", (items) =>
        items.map((item) => {
          if (item.id !== templateId) return item;
          updated = { ...item, enabled: false, archivedAt: currentDate().toISOString(), updatedAt: currentDate().toISOString() };
          return updated;
        }),
      );
      if (!updated) throw Object.assign(new Error("模板不存在"), { status: 404 });
      return updated;
    }

    if (name === "admin_list_mcp_audit") {
      const entries = await readCollection(AUDIT_COLLECTION, []);
      return paginate(entries, args);
    }

    throw Object.assign(new Error("工具尚未实现"), { status: 501 });
  };

  const readResource = async (principal, uri) => {
    if (uri === "commerce-canvas://account/context") return accountContext(principal);
    if (uri === "commerce-canvas://account/projects") {
      const templates = await readCollection("templates", []);
      return templates
        .filter((item) => ownedBy(item, principal.userId))
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
        .map(projectSummary);
    }
    if (uri === "commerce-canvas://admin/templates" && principal.role === "admin")
      return (await allAdminTemplates()).map((item) => ({
        ...projectSummary(item),
        system: Boolean(item.system),
      }));
    throw Object.assign(new Error("资源不存在或无权访问"), { status: 404 });
  };

  const getPrompt = (principal, name) => {
    if (name === "commerce-canvas_video_creator")
      return {
        description: "基于本人Commerce Canvas数据进行视频创作",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "请先读取我的Commerce Canvas账号上下文、画布项目和数字资产，再根据现有素材提出视频创作方案。需要改动画布时先说明计划，再调用创建或修改工具；需要提交真实生成任务时必须先征得我确认。",
            },
          },
        ],
      };
    if (name === "commerce-canvas_template_operator" && principal.role === "admin")
      return {
        description: "安全运营Commerce Canvas后台模板",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "请先读取后台模板目录并检查目标模板的节点、连线、发布范围和启用状态。修改前说明影响；优先归档而不是删除；完成后通过审计日志确认调用结果。",
            },
          },
        ],
      };
    throw Object.assign(new Error("提示不存在或无权访问"), { status: 404 });
  };

  const handleMessage = async (principal, message) => {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string")
      return rpcError(message?.id, -32600, "Invalid Request");
    const id = message.id;
    const method = message.method;
    if (id === undefined) return null;
    if (method === "initialize") {
      const requested = String(message.params?.protocolVersion || "");
      const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions:
          principal.role === "admin"
            ? "你正在使用管理员 MCP。普通创作工具仅访问当前账号数据；admin_ 前缀工具可管理后台模板，所有写操作均记录审计。"
            : "你正在使用用户 MCP。所有项目、资产和任务工具只访问当前令牌所属账号；提交生成任务前必须获得用户确认。",
      });
    }
    if (method === "ping") return rpcResult(id, {});
    if (method === "tools/list")
      return rpcResult(id, { tools: toolsForRole(principal.role) });
    if (method === "resources/list")
      return rpcResult(id, { resources: resourcesForRole(principal.role) });
    if (method === "prompts/list")
      return rpcResult(id, { prompts: promptDefinitions(principal.role) });
    if (method === "resources/read") {
      const uri = String(message.params?.uri || "");
      const value = await readResource(principal, uri);
      return rpcResult(id, {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }],
      });
    }
    if (method === "prompts/get")
      return rpcResult(id, getPrompt(principal, String(message.params?.name || "")));
    if (method === "tools/call") {
      const toolName = String(message.params?.name || "");
      const startedAt = Date.now();
      try {
        checkRateLimit(principal);
        const value = await callTool(principal, toolName, message.params?.arguments || {});
        await recordAudit({
          principal,
          method,
          toolName,
          ok: true,
          durationMs: Date.now() - startedAt,
        });
        return rpcResult(id, jsonContent(value));
      } catch (error) {
        await recordAudit({
          principal,
          method,
          toolName,
          ok: false,
          durationMs: Date.now() - startedAt,
          errorCode: error.code || error.status || "TOOL_ERROR",
        });
        return rpcResult(id, toolErrorContent(error));
      }
    }
    return rpcError(id, -32601, "Method not found");
  };

  const handleRpc = async (principal, payload) => {
    if (Array.isArray(payload)) {
      if (!payload.length) return rpcError(null, -32600, "Invalid Request");
      const responses = (await Promise.all(payload.map((message) => handleMessage(principal, message)))).filter(Boolean);
      return responses.length ? responses : null;
    }
    return handleMessage(principal, payload);
  };

  return {
    accessInfo,
    authenticate,
    handleRpc,
    issueToken,
    listAudit,
    listTokens,
    revokeToken,
    toolsForRole,
  };
}

export function bearerTokenFromRequest(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function isAllowedMcpOrigin(req, allowedOrigins = []) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  const sameOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin === sameOrigin || allowedOrigins.includes(origin)) return true;
  try {
    const originUrl = new URL(origin);
    const requestHost = String(req.get("host") || "").replace(/^\[/, "").split("]")[0].split(":")[0];
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
    return loopbackHosts.has(originUrl.hostname) && loopbackHosts.has(requestHost);
  } catch {
    return false;
  }
}

export function mcpEndpointForRequest(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  return `${configured || `${req.protocol}://${req.get("host")}`}/mcp`;
}

export const __test = {
  hashToken,
  publicTokenRecord,
  normalizeGraph,
  projectSummary,
};

