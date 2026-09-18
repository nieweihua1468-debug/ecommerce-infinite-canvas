import { isDeepSeekConfigured } from "./deepseek.js";
import { getImage2Status, isImage2Configured } from "./image2.js";
import {
  createKlingToken,
  isConfigured as isKlingConfigured,
} from "./kling.js";
import { MODEL_DEPLOYMENTS } from "./model-catalog.js";
import {
  checkVolcengineConnection,
  getVolcengineStatus,
} from "./volcengine.js";
import { getVapeurStatus, isVapeurConfigured } from "./vapeur.js";

const DEFAULT_KLING_BASE_URL = "https://api-beijing.klingai.com";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
const MINIMAX_VIDEO_BASE_URL = "https://api.minimaxi.com";
const LIST_MODEL_PROVIDERS = new Set(["image2", "vapeur", "deepseek"]);
const SENSITIVE_ENV_NAME =
  /(api[_-]?key|secret|token|password|authorization|credential|access[_-]?key)/i;

const value = (name) => String(process.env[name] || "").trim();

function timestamp(now) {
  const candidate = typeof now === "function" ? now() : new Date();
  const parsed = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function trimBaseUrl(input, fallback) {
  return String(input || fallback || "").trim().replace(/\/$/, "");
}

function redactedEnvironmentValues() {
  return Object.entries(process.env)
    .filter(([name, secret]) => SENSITIVE_ENV_NAME.test(name) && String(secret || "").length >= 6)
    .map(([, secret]) => String(secret));
}

/**
 * Converts a provider error into short administrator-facing text without
 * exposing a URL, credential, authorization header, JWT, or raw payload.
 */
export function sanitizeProviderError(input, fallback = "供应商只读探针失败") {
  let message = String(input || "").trim();
  if (!message) return fallback;

  for (const secret of redactedEnvironmentValues()) {
    message = message.split(secret).join("[REDACTED]");
  }

  message = message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[ENDPOINT]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(api[ _-]?key|secret|token|password|authorization|credential|access[ _-]?key)\b\s*[:=]\s*["']?[^\s,;"']+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b(?:sk|ak|pk)-[A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .replace(
      /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[REDACTED]",
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return message.slice(0, 240) || fallback;
}

function safeErrorCode(input, fallback = "UPSTREAM_ERROR") {
  const raw = String(input || "").trim();
  if (!raw) return fallback;
  if (
    /https?:\/\//i.test(raw) ||
    /\b(?:sk|ak|pk)-[A-Za-z0-9_-]{8,}\b/i.test(raw) ||
    raw.length > 80
  )
    return fallback;
  const normalized = raw.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 80);
  return normalized || fallback;
}

function responseError(response, payload) {
  const code =
    payload?.error?.code ||
    payload?.error?.type ||
    payload?.base_resp?.status_code ||
    payload?.code ||
    `HTTP_${response.status}`;
  const message =
    payload?.error?.message ||
    payload?.base_resp?.status_msg ||
    payload?.message ||
    payload?.msg ||
    `供应商只读探针失败（HTTP ${response.status}）`;
  return {
    lastErrorCode: safeErrorCode(code, `HTTP_${response.status}`),
    lastErrorMessage: sanitizeProviderError(message),
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function listedModels(payload) {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : null;
  if (!source) return null;
  return source
    .map((entry) => String(entry?.id || entry?.model || entry?.name || "").trim())
    .filter(Boolean);
}

function providerFailureFromError(error) {
  const timeout = ["AbortError", "TimeoutError"].includes(String(error?.name || ""));
  return {
    lastErrorCode: timeout
      ? "PROBE_TIMEOUT"
      : safeErrorCode(error?.code || error?.name, "NETWORK_ERROR"),
    lastErrorMessage: sanitizeProviderError(
      timeout ? "供应商只读探针超时" : error?.message,
      timeout ? "供应商只读探针超时" : "供应商网络连接失败",
    ),
  };
}

function timeoutSignal(timeoutMs) {
  const parsed = Number(timeoutMs);
  const milliseconds = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 10_000;
  return AbortSignal.timeout(milliseconds);
}

async function httpProbe({
  provider,
  configured,
  url,
  method = "GET",
  headers,
  body,
  fetchImpl,
  timeoutMs,
  checkedAt,
  validate = (payload, response) => response.ok,
}) {
  if (!configured) {
    return {
      provider,
      configured: false,
      authenticated: false,
      ready: false,
      modelVisibility: "none",
      models: null,
      checkedAt,
      latencyMs: null,
      lastErrorCode: "NOT_CONFIGURED",
      lastErrorMessage: "供应商未配置",
    };
  }

  const startedAt = performance.now();
  try {
    const requestHeaders = typeof headers === "function" ? headers() : headers;
    const response = await fetchImpl(url, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: timeoutSignal(timeoutMs),
    });
    const payload = await safeJson(response);
    const authenticated = ![401, 403].includes(Number(response.status));
    const valid = response.ok && Boolean(validate(payload, response));
    const models = valid ? listedModels(payload) : null;
    const error = valid ? {} : responseError(response, payload);
    return {
      provider,
      configured: true,
      authenticated,
      ready: valid,
      modelVisibility: models ? "list" : "unknown",
      models,
      checkedAt,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      lastErrorCode: error.lastErrorCode || null,
      lastErrorMessage: error.lastErrorMessage || null,
    };
  } catch (error) {
    return {
      provider,
      configured: true,
      authenticated: false,
      ready: false,
      modelVisibility: "unknown",
      models: null,
      checkedAt,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...providerFailureFromError(error),
    };
  }
}

function targetModel(model) {
  if (model.id === "gpt-image-2") return value("IMAGE2_MODEL") || "gpt-image-2";
  if (model.id === "vapeur-gpt-image-2")
    return value("VAPEUR_IMAGE_MODEL") || "gpt-image-2";
  if (model.id === "vapeur-gpt-5.5")
    return value("VAPEUR_TEXT_MODEL") || "gpt-5.5";
  if (model.id === "vapeur-gemini-3.5-flash")
    return value("VAPEUR_GEMINI_FAST_MODEL") || "gemini-3.5-flash";
  if (model.id === "vapeur-gemini-3.1-pro")
    return value("VAPEUR_GEMINI_PRO_MODEL") || "gemini-3.1-pro-preview";
  if (model.id === "deepseek-v4-pro")
    return value("DEEPSEEK_MODEL") || "deepseek-v4-pro";
  return model.upstreamModelId;
}

export function readinessStatus({
  configured,
  authenticated,
  modelAvailable,
  ready,
}) {
  if (
    !configured ||
    authenticated === false ||
    modelAvailable === false ||
    ready === false
  )
    return "UNAVAILABLE";
  if (authenticated === true && modelAvailable == null) return "DEGRADED";
  if (authenticated === true && modelAvailable === true && ready === true)
    return "HEALTHY";
  return "UNAVAILABLE";
}

/** Expands one provider-level probe into one sanitized deployment record. */
export function buildReadinessRecord(model, probe) {
  const configured =
    !model?.permanentlyDisabled &&
    model?.provider !== "unconfigured" &&
    probe?.configured === true;
  const authenticated = configured && probe?.authenticated === true;
  let modelAvailable = null;

  if (!configured) modelAvailable = false;
  else if (
    LIST_MODEL_PROVIDERS.has(model.provider) &&
    probe?.modelVisibility === "list" &&
    Array.isArray(probe.models)
  ) {
    modelAvailable = probe.models.includes(targetModel(model));
  }

  const ready = Boolean(
    configured && probe?.ready === true && modelAvailable !== false,
  );
  const status = readinessStatus({
    configured,
    authenticated,
    modelAvailable,
    ready,
  });
  const missingModel = configured && probe?.ready === true && modelAvailable === false;
  const disabled = Boolean(model?.permanentlyDisabled || model?.provider === "unconfigured");

  return {
    modelId: String(model?.id || ""),
    provider: String(model?.provider || "unknown"),
    configured,
    authenticated,
    modelAvailable,
    ready,
    status,
    checkedAt: probe?.checkedAt || null,
    latencyMs: Number.isFinite(probe?.latencyMs) ? Number(probe.latencyMs) : null,
    lastErrorCode: missingModel
      ? "MODEL_NOT_AVAILABLE"
      : disabled
        ? "MODEL_DISABLED"
        : probe?.lastErrorCode
          ? safeErrorCode(probe.lastErrorCode)
          : null,
    lastErrorMessage: missingModel
      ? "部署模型未出现在供应商模型列表中"
      : disabled
        ? "模型已停用"
        : probe?.lastErrorMessage
          ? sanitizeProviderError(probe.lastErrorMessage)
          : null,
  };
}

async function volcengineProbe(checkedAt) {
  const startedAt = performance.now();
  try {
    await checkVolcengineConnection();
    const state = getVolcengineStatus();
    const configured = state?.configured === true;
    const ready = configured && state?.ready === true;
    return {
      provider: "volcengine",
      configured,
      authenticated: ready,
      ready,
      modelVisibility: "unknown",
      models: null,
      checkedAt,
      latencyMs: configured
        ? Math.max(0, Math.round(performance.now() - startedAt))
        : null,
      lastErrorCode: ready
        ? null
        : safeErrorCode(state?.status, configured ? "VOLCENGINE_REJECTED" : "NOT_CONFIGURED"),
      lastErrorMessage: ready
        ? null
        : sanitizeProviderError(
            state?.error,
            configured ? "Seedance 凭证不可用" : "供应商未配置",
          ),
    };
  } catch (error) {
    return {
      provider: "volcengine",
      configured: true,
      authenticated: false,
      ready: false,
      modelVisibility: "unknown",
      models: null,
      checkedAt,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...providerFailureFromError(error),
    };
  }
}

/**
 * Runs authentication/model-list checks only. It never submits a generation,
 * analysis, clone, upload, or task request.
 */
export async function runProviderReadinessChecks({
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new TypeError("fetchImpl 必须是函数");

  const checkedAt = timestamp(now);
  const image2 = getImage2Status();
  const vapeur = getVapeurStatus();
  const miniMaxKey = value("MINIMAX_API_KEY") || value("MINIMIX_API_KEY");
  const klingConfigured = isKlingConfigured();

  const providerEntries = await Promise.all([
    httpProbe({
      provider: "kling",
      configured: klingConfigured,
      url: `${trimBaseUrl(value("KLING_BASE_URL"), DEFAULT_KLING_BASE_URL)}/v1/general/presets-voices?pageNum=1&pageSize=1`,
      headers: klingConfigured
        ? () => ({ Authorization: `Bearer ${createKlingToken()}` })
        : undefined,
      fetchImpl,
      timeoutMs,
      checkedAt,
      validate: (payload) => !payload?.code || String(payload.code) === "0",
    }),
    httpProbe({
      provider: "image2",
      configured: isImage2Configured(),
      url: `${trimBaseUrl(image2.baseUrl)}/models`,
      headers:
        String(process.env.IMAGE2_AUTH_TYPE || "").toLowerCase() === "azure" ||
        /\.services\.ai\.azure\.com|\.openai\.azure\.com/i.test(image2.baseUrl)
          ? { "api-key": value("IMAGE2_API_KEY") }
          : { Authorization: `Bearer ${value("IMAGE2_API_KEY")}` },
      fetchImpl,
      timeoutMs,
      checkedAt,
    }),
    httpProbe({
      provider: "vapeur",
      configured: isVapeurConfigured(),
      url: `${trimBaseUrl(vapeur.baseUrl)}/models`,
      headers: { Authorization: `Bearer ${value("VAPEUR_API_KEY")}` },
      fetchImpl,
      timeoutMs,
      checkedAt,
    }),
    httpProbe({
      provider: "deepseek",
      configured: isDeepSeekConfigured(),
      url: `${trimBaseUrl(value("DEEPSEEK_BASE_URL"), DEFAULT_DEEPSEEK_BASE_URL)}/models`,
      headers: { Authorization: `Bearer ${value("DEEPSEEK_API_KEY")}` },
      fetchImpl,
      timeoutMs,
      checkedAt,
    }),
    httpProbe({
      provider: "minimax",
      configured: Boolean(miniMaxKey),
      url: `${MINIMAX_BASE_URL}/get_voice`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${miniMaxKey}`,
        "Content-Type": "application/json",
      },
      body: { voice_type: "all" },
      fetchImpl,
      timeoutMs,
      checkedAt,
      validate: (payload, response) =>
        response.ok && Number(payload?.base_resp?.status_code || 0) === 0,
    }),
    httpProbe({
      provider: "minimax-video",
      configured: Boolean(miniMaxKey),
      url: `${trimBaseUrl(value("MINIMAX_VIDEO_BASE_URL"), MINIMAX_VIDEO_BASE_URL)}/v2/query/video_generation?page_num=1&page_size=1&filter.model=MiniMax-H3&filter.task_type=generation`,
      headers: { Authorization: `Bearer ${miniMaxKey}` },
      fetchImpl,
      timeoutMs,
      checkedAt,
      validate: (payload, response) =>
        response.ok && Array.isArray(payload?.items),
    }),
    volcengineProbe(checkedAt),
  ]);

  const probes = new Map(providerEntries.map((probe) => [probe.provider, probe]));
  const unavailableProbe = {
    configured: false,
    authenticated: false,
    ready: false,
    modelVisibility: "none",
    models: null,
    checkedAt,
    latencyMs: null,
    lastErrorCode: "NOT_CONFIGURED",
    lastErrorMessage: "供应商未配置",
  };

  return MODEL_DEPLOYMENTS.map((model) =>
    buildReadinessRecord(
      model,
      probes.get(model.id === "minimax-h3" ? "minimax-video" : model.provider) ||
        unavailableProbe,
    ),
  );
}

