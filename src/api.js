const USER_TOKEN_KEY = "commerce-canvas_user_token";
const IMAGE_GENERATION_MODEL_IDS = new Set([
  "gpt-image-2",
  "vapeur-gpt-image-2",
]);
let lastExpiredUserToken = "";

function dispatchBrowserEvent(name, detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function")
    return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function expireUserSession(userToken, payload) {
  if (!userToken) return;
  localStorage.removeItem(USER_TOKEN_KEY);
  if (lastExpiredUserToken === userToken) return;
  lastExpiredUserToken = userToken;
  dispatchBrowserEvent("commerce-canvas:session-expired", {
    code: payload?.code || "SESSION_EXPIRED",
    message: payload?.message || "登录状态已失效，请重新登录",
  });
}

function responseError(payload, status, fallback) {
  const error = new Error(payload?.message || fallback || `请求失败（${status}）`);
  error.status = status;
  error.field = payload?.field || null;
  error.code = payload?.code || null;
  error.failure = payload?.failure || null;
  error.details = payload?.details || null;
  error.payload = payload;
  return error;
}

function recentRecordsPath(path, params = {}, defaultLimit) {
  const query = new URLSearchParams();
  const ids = Array.isArray(params.ids) ? params.ids : [];
  if (!params.all) {
    const limit = params.limit ?? defaultLimit;
    if (Number(limit) > 0) query.set("limit", String(limit));
    if (!ids.length) query.set("view", "summary");
  }
  if (ids.length) query.set("ids", ids.filter(Boolean).join(","));
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function configuredImageGenerationModels(models = [], health = {}) {
  const configured = new Map(
    (Array.isArray(models) ? models : [])
      .filter(
        (model) =>
          model?.kind === "image" &&
          model.configured === true &&
          IMAGE_GENERATION_MODEL_IDS.has(model.id),
      )
      .map((model) => [model.id, model]),
  );
  if (health?.image2Configured && !configured.has("gpt-image-2"))
    configured.set("gpt-image-2", {
      id: "gpt-image-2",
      name: "GPT Image 2 · Azure",
      kind: "image",
      configured: true,
    });
  if (
    health?.vapeurImageConfigured &&
    !configured.has("vapeur-gpt-image-2")
  )
    configured.set("vapeur-gpt-image-2", {
      id: "vapeur-gpt-image-2",
      name: "GPT Image 2 · Vapeur",
      kind: "image",
      configured: true,
    });
  return [...configured.values()];
}

export function selectImageGenerationModel(models, health, preferred = "") {
  const configured = configuredImageGenerationModels(models, health);
  return configured.find((model) => model.id === preferred) || configured[0] || null;
}

export function mediaAnalysisTaskMatches(task, expected = {}) {
  if (!task?.id) return false;
  if (expected.taskId && task.id !== expected.taskId) return false;
  if (
    task.inputFingerprint &&
    expected.inputFingerprint &&
    task.inputFingerprint !== expected.inputFingerprint
  )
    return false;
  if (
    !task.inputFingerprint &&
    !expected.inputFingerprint &&
    task.idempotencyKey &&
    expected.idempotencyKey &&
    task.idempotencyKey !== expected.idempotencyKey
  )
    return false;
  const comparableKeys = ["fileName", "model", "targetType", "frameLimit"];
  return comparableKeys.every(
    (key) =>
      expected[key] == null ||
      task[key] == null ||
      String(task[key]) === String(expected[key]),
  );
}

async function request(path, options = {}) {
  const userToken = localStorage.getItem(USER_TOKEN_KEY);
  const headers = {
    ...(options.body != null ? { "Content-Type": "application/json" } : {}),
    ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    ...options.headers,
  };
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers,
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) {
    if (response.status === 401) expireUserSession(userToken, payload);
    throw responseError(payload, response.status);
  }
  return payload;
}

async function workflowAssetFile(asset) {
  const userToken = localStorage.getItem(USER_TOKEN_KEY);
  const response = await fetch(asset.url, {
    cache: "force-cache",
    headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
  });
  if (!response.ok) {
    if (response.status === 401) expireUserSession(userToken, {});
    throw responseError(
      {},
      response.status,
      response.status === 404
        ? `项目素材「${asset.name || "未命名"}」不存在或已清理`
        : `项目素材恢复失败（${response.status}）`,
    );
  }
  const blob = await response.blob();
  return new File([blob], asset.name || "项目素材", {
    type: asset.mimeType || blob.type || "application/octet-stream",
    lastModified: Date.now(),
  });
}

async function uploadWorkflowAssetFile(file, type) {
  const userToken = localStorage.getItem(USER_TOKEN_KEY);
  const response = await fetch("/api/workflow-assets/raw", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Commerce-Canvas-Asset-Type": type,
      "X-Commerce-Canvas-Asset-Name": encodeURIComponent(file.name || "项目素材"),
      "X-Commerce-Canvas-Asset-Mime": encodeURIComponent(
        file.type || "application/octet-stream",
      ),
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) expireUserSession(userToken, payload);
    throw responseError(payload, response.status, `素材上传失败（${response.status}）`);
  }
  return payload;
}

async function uploadAudioCloneFile(file, purpose = "voice_clone") {
  const userToken = localStorage.getItem(USER_TOKEN_KEY);
  const response = await fetch("/api/audio/files", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Commerce-Canvas-Audio-Purpose": purpose,
      "X-Commerce-Canvas-Audio-Name": encodeURIComponent(file.name || "voice.mp3"),
      "X-Commerce-Canvas-Audio-Mime": encodeURIComponent(
        file.type || "application/octet-stream",
      ),
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) expireUserSession(userToken, payload);
    throw responseError(
      payload,
      response.status,
      `声音文件上传失败（${response.status}）`,
    );
  }
  return payload;
}

async function imageSourceForGridSplit(imageUrl, signal) {
  const source = String(imageUrl || "").trim();
  if (!source) throw new Error("没有可切分的图片");
  if (source.startsWith("data:")) return { imageData: source };
  if (!source.startsWith("blob:")) return { imageUrl: source };
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error("读取画布图片失败，请重新导入后再试");
  const blob = await response.blob();
  const imageData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取画布图片失败"));
    reader.readAsDataURL(blob);
  });
  return { imageData };
}

export const api = {
  localAdminSession: () =>
    request("/api/dev/admin-session", { method: "POST" }),
  register: (body) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  joinableTeams: () => request("/api/teams/joinable"),
  joinTeam: (teamId) =>
    request("/api/account/team", {
      method: "PUT",
      body: JSON.stringify({ teamId }),
    }),
  leaveTeam: () => request("/api/account/team", { method: "DELETE" }),
  updateProfile: (body) =>
    request("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  changePassword: (body) =>
    request("/api/account/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  pointHistory: () => request("/api/account/points-history"),
  mcpAccess: () => request("/api/mcp/access"),
  createMcpToken: (body) =>
    request("/api/mcp/tokens", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeMcpToken: (id) =>
    request(`/api/mcp/tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  mcpAudit: (limit = 60) => request(`/api/mcp/audit?limit=${limit}`),
  savePromptFramework: (framework) =>
    request("/api/account/prompt-framework", {
      method: "PUT",
      body: JSON.stringify({ framework }),
    }),
  pointUsage: (date) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    return request(`/api/account/points-usage${params.toString() ? `?${params}` : ""}`);
  },
  videoAnalysisProfiles: () => request("/api/account/video-analysis-profiles"),
  saveVideoAnalysisProfile: (targetModel, body) =>
    request(
      `/api/account/video-analysis-profiles/${encodeURIComponent(targetModel)}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  health: () => request("/api/health"),
  capabilities: () => request("/api/capabilities"),
  createGenerationConfig: () => request("/api/create-generation-config"),
  models: () => request("/api/models"),
  bootstrap: () =>
    request("/api/bootstrap?taskLimit=40&runLimit=30&view=summary"),
  hotRank: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "")
        query.set(key, String(value));
    });
    return request(`/api/hot-rank${query.toString() ? `?${query}` : ""}`);
  },
  hotRankSource: (id) =>
    request(`/api/hot-rank/${encodeURIComponent(id)}/source`),
  hotRankRemakeConfig: () => request("/api/hot-rank-remake-config"),
  hotRankRemakeTemplate: (id) =>
    request(`/api/hot-rank/${encodeURIComponent(id)}/remake-template`),
  hotRankWorkflowAsset: (id) =>
    request(`/api/hot-rank/${encodeURIComponent(id)}/workflow-asset`, {
      method: "POST",
    }),
  tasks: (params = {}) => request(recentRecordsPath("/api/tasks", params, 80)),
  task: (id) => request(`/api/tasks/${encodeURIComponent(id)}`),
  generationTimeSummary: () => request("/api/generation-time-summary"),
  workflowRuns: (params = {}) =>
    request(recentRecordsPath("/api/workflow-runs", params, 60)),
  workflowRun: (id) => request(`/api/workflow-runs/${id}`),
  workflowAssetFile,
  uploadWorkflowAssetFile,
  uploadAudioCloneFile,
  audioStatus: () => request("/api/audio/status"),
  audioVoices: () => request("/api/audio/voices"),
  createAudioSpeech: (body) =>
    request("/api/audio/tts", { method: "POST", body: JSON.stringify(body) }),
  cloneAudioVoice: (body) =>
    request("/api/audio/voice-clone", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteAudioVoice: (id) =>
    request(`/api/audio/voices/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createWorkflowRun: (body) =>
    request("/api/workflow-runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  uploadWorkflowAsset: (body) =>
    request("/api/workflow-assets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  terminateWorkflowRun: (id) =>
    request(`/api/workflow-runs/${id}/terminate`, { method: "POST" }),
  deleteWorkflowRun: (id) =>
    request(`/api/workflow-runs/${id}`, { method: "DELETE" }),
  digitalAssets: () => request("/api/digital-assets"),
  createDigitalAsset: (body) =>
    request("/api/digital-assets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createDigitalAssetFromTask: (body) =>
    request("/api/digital-assets/from-task", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createDigitalAssetElement: (id, body = {}) =>
    request(`/api/digital-assets/${id}/kling-element`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteDigitalAsset: (id) =>
    request(`/api/digital-assets/${id}`, { method: "DELETE" }),
  createVideo: (body) =>
    request("/api/tasks/video", { method: "POST", body: JSON.stringify(body) }),
  createVideoBatch: (items) =>
    request("/api/tasks/video/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  createImage: (body) =>
    request("/api/tasks/image", { method: "POST", body: JSON.stringify(body) }),
  gridSplitImage: async ({ imageUrl, rows, columns, name }, options = {}) =>
    request("/api/images/grid-split", {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        ...(await imageSourceForGridSplit(imageUrl, options.signal)),
        rows,
        columns,
        ...(name ? { name } : {}),
      }),
    }),
  refinePrompt: (body) =>
    request("/api/text/refine", { method: "POST", body: JSON.stringify(body) }),
  generateText: (body) =>
    request("/api/text/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  analyzeMedia: (body) =>
    request("/api/media/analyze", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createMediaAnalysisTask: (body) =>
    request("/api/media/analysis-tasks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mediaAnalysisTasks: (limit = 8) =>
    request(`/api/media/analysis-tasks?limit=${limit}`),
  mediaAnalysisTask: (id) => request(`/api/media/analysis-tasks/${id}`),
  checkVolcengine: () =>
    request("/api/providers/volcengine/check", { method: "POST" }),
  checkVolcengineAssetGroup: (groupId) =>
    request("/api/providers/volcengine/asset-groups/check", {
      method: "POST",
      body: JSON.stringify({ groupId }),
    }),
  createTrustedPersonAsset: (body) =>
    request("/api/providers/volcengine/trusted-person-assets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  klingVoices: () => request("/api/kling/voices"),
  createKlingVoice: (body) =>
    request("/api/kling/voices", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  klingElements: () => request("/api/kling/elements"),
  createKlingElement: (body) =>
    request("/api/kling/elements", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  refreshTask: (id) => request(`/api/tasks/${id}/refresh`, { method: "POST" }),
  templates: () => request("/api/templates"),
  hiddenBuiltinTemplates: () => request("/api/templates-hidden-builtins"),
  createTemplate: (body) =>
    request("/api/templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id, body) =>
    request(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  templateUpdateNotices: () => request("/api/template-update-notices"),
  markTemplateUsed: (id) =>
    request(`/api/templates/${id}/usage`, { method: "POST" }),
  acknowledgeTemplateUpdate: (id) =>
    request(`/api/templates/${id}/updates/acknowledge`, { method: "POST" }),
  reviewTemplate: (id, decision) =>
    request(`/api/templates/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  deleteTemplate: (id) => request(`/api/templates/${id}`, { method: "DELETE" }),
  inspirations: ({
    query = "",
    category = "all",
    primaryCategory = "all",
    secondaryCategory = "all",
    platform = "all",
    kind = "video",
    page = 1,
    pageSize = 24,
    signal,
  } = {}) => {
    const params = new URLSearchParams({
      query,
      category,
      primaryCategory,
      secondaryCategory,
      platform,
      kind,
      page: String(page),
      pageSize: String(pageSize),
    });
    return request(`/api/inspirations?${params}`, { signal });
  },
  inspiration: (id) => request(`/api/inspirations/${encodeURIComponent(id)}`),
  createInspiration: (body) =>
    request("/api/inspirations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

