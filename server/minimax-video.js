import { generationErrorMessage } from "./generation-error-message.js";

const DEFAULT_BASE_URL = "https://api.minimaxi.com";
const DEFAULT_TIMEOUT_MS = 90_000;
const QUERY_TIMEOUT_MS = 20_000;
const MODEL_NAME = "MiniMax-H3";
const RESOLUTIONS = new Set(["768P", "2K"]);
const RATIOS = new Set([
  "adaptive",
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
]);
const FIXED_RATIOS = new Set([...RATIOS].filter((ratio) => ratio !== "adaptive"));
const ALLOWED_TYPES = new Set(["text", "image_url", "video_url", "audio_url"]);
const IMAGE_ROLES = new Set(["first_frame", "last_frame", "reference_image"]);
const VIDEO_ROLES = new Set(["reference_video"]);
const AUDIO_ROLES = new Set(["reference_audio"]);
const MEBIBYTE = 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 64 * MEBIBYTE;
const MIN_MEDIA_DIMENSION = 256;
const MAX_MEDIA_DIMENSION = 5760;
const MIN_MEDIA_ASPECT_RATIO = 0.4;
const MAX_MEDIA_ASPECT_RATIO = 2.5;
const MEDIA_FORMAT_ALIASES = new Map([
  ["jpg", "jpg"],
  ["jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/jpeg", "jpg"],
  ["png", "png"],
  ["image/png", "png"],
  ["webp", "webp"],
  ["image/webp", "webp"],
  ["heic", "heic"],
  ["image/heic", "heic"],
  ["heif", "heif"],
  ["image/heif", "heif"],
  ["mp4", "mp4"],
  ["video/mp4", "mp4"],
  ["mov", "mov"],
  ["video/quicktime", "mov"],
  ["wav", "wav"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/wave", "wav"],
  ["mp3", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/mpeg", "mp3"],
]);
const MEDIA_FORMATS = Object.freeze({
  image_url: new Set(["jpg", "png", "webp", "heic", "heif"]),
  video_url: new Set(["mp4", "mov"]),
  audio_url: new Set(["wav", "mp3"]),
});
const MEDIA_SIZE_LIMITS = Object.freeze({
  image_url: 30 * MEBIBYTE,
  video_url: 50 * MEBIBYTE,
  audio_url: 15 * MEBIBYTE,
});

const HTTP_ERRORS = Object.freeze({
  400: {
    code: "MINIMAX_INVALID_REQUEST",
    message: "MiniMax 请求参数不正确，请检查提示词和素材组合。",
  },
  401: {
    code: "MINIMAX_UNAUTHORIZED",
    message: "MiniMax API 凭证无效或已过期。",
  },
  402: {
    code: "MINIMAX_BALANCE_EXHAUSTED",
    message: "MiniMax 账户余额或可用额度不足。",
  },
  403: {
    code: "MINIMAX_FORBIDDEN",
    message: "MiniMax 账户没有调用该视频模型的权限。",
  },
  404: {
    code: "MINIMAX_TASK_NOT_FOUND",
    message: "MiniMax 视频任务不存在或已被删除。",
  },
  422: {
    code: "MINIMAX_UNPROCESSABLE_INPUT",
    message: "MiniMax 无法处理当前素材，请检查格式、尺寸和输入组合。",
  },
  429: {
    code: "MINIMAX_RATE_LIMITED",
    message: "MiniMax API 请求过于频繁，请稍后重试。",
  },
});

function httpError(status) {
  if (HTTP_ERRORS[status]) return HTTP_ERRORS[status];
  if (status >= 500)
    return {
      code: "MINIMAX_UPSTREAM_UNAVAILABLE",
      message: "MiniMax 视频服务暂时不可用，请稍后重试。",
    };
  return {
    code: "MINIMAX_REQUEST_FAILED",
    message: `MiniMax 视频请求失败（HTTP ${status}）。`,
  };
}

function fail(message, status = 400, code = "MINIMAX_INVALID_INPUT") {
  const error = new Error(message);
  error.name = "MiniMaxVideoError";
  error.status = status;
  error.code = code;
  error.retryable = status === 429 || status >= 500;
  return error;
}

function trimBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function apiKey(env = process.env) {
  return String(env.MINIMAX_API_KEY || env.MINIMIX_API_KEY || "").trim();
}

export function isMiniMaxVideoConfigured(env = process.env) {
  return Boolean(apiKey(env));
}

function requirePublicUrl(value, label) {
  const input = String(value || "").trim();
  if (!input) throw fail(`${label}地址不能为空`);
  if (/^data:/i.test(input))
    throw fail(`${label}不支持 Base64，请先上传并传入公网 URL`);
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw fail(`${label}必须是完整的 HTTP(S) URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw fail(`${label}必须使用 HTTP(S) URL`);
  if (input.length > 4096) throw fail(`${label}地址过长`);
  return input;
}

function optionalMetadataNumber(metadata, field, label, options = {}) {
  if (metadata?.[field] === undefined || metadata?.[field] === null) return null;
  const value = metadata[field];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw fail(`${label} metadata.${field} 必须是有限数字`);
  if (options.integer && !Number.isInteger(value))
    throw fail(`${label} metadata.${field} 必须是整数`);
  if (options.nonNegative && value < 0)
    throw fail(`${label} metadata.${field} 不能小于 0`);
  if (options.positive && value <= 0)
    throw fail(`${label} metadata.${field} 必须大于 0`);
  return value;
}

function canonicalMediaFormat(value, label, field) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\./, "");
  const format = MEDIA_FORMAT_ALIASES.get(raw);
  if (!format) throw fail(`${label} metadata.${field} 不支持`);
  return format;
}

/**
 * Optional, additive caller contract for media facts already known at upload time:
 * { format?, mimeType?, sizeBytes?, width?, height?, durationSeconds?, fps? }.
 * Missing facts are intentionally not inferred from a URL and are therefore not
 * represented as validated. Metadata is validation-only and never sent upstream.
 */
function validateMediaMetadata(rawMetadata, type, label) {
  if (rawMetadata === undefined || rawMetadata === null) return null;
  if (
    typeof rawMetadata !== "object" ||
    Array.isArray(rawMetadata) ||
    Object.getPrototypeOf(rawMetadata) !== Object.prototype
  )
    throw fail(`${label} metadata 必须是对象`);

  const formatFromName =
    rawMetadata.format === undefined || rawMetadata.format === null
      ? null
      : canonicalMediaFormat(rawMetadata.format, label, "format");
  const formatFromMime =
    rawMetadata.mimeType === undefined || rawMetadata.mimeType === null
      ? null
      : canonicalMediaFormat(rawMetadata.mimeType, label, "mimeType");
  if (formatFromName && formatFromMime && formatFromName !== formatFromMime)
    throw fail(`${label} metadata.format 与 metadata.mimeType 不一致`);
  const format = formatFromName || formatFromMime;
  if (format && !MEDIA_FORMATS[type].has(format))
    throw fail(`${label}格式不支持`);

  const sizeBytes = optionalMetadataNumber(rawMetadata, "sizeBytes", label, {
    integer: true,
    nonNegative: true,
  });
  if (sizeBytes !== null && sizeBytes > MEDIA_SIZE_LIMITS[type]) {
    const limitMb = MEDIA_SIZE_LIMITS[type] / MEBIBYTE;
    throw fail(
      `${label}单文件不能超过 ${limitMb}MB`,
      413,
      "MINIMAX_MEDIA_TOO_LARGE",
    );
  }

  const metadata = { format, sizeBytes };
  if (type === "image_url" || type === "video_url") {
    const width = optionalMetadataNumber(rawMetadata, "width", label, {
      integer: true,
      positive: true,
    });
    const height = optionalMetadataNumber(rawMetadata, "height", label, {
      integer: true,
      positive: true,
    });
    for (const [field, value] of [
      ["width", width],
      ["height", height],
    ]) {
      if (
        value !== null &&
        (value < MIN_MEDIA_DIMENSION || value > MAX_MEDIA_DIMENSION)
      )
        throw fail(
          `${label} metadata.${field} 必须在 ${MIN_MEDIA_DIMENSION}–${MAX_MEDIA_DIMENSION} 像素之间`,
        );
    }
    if (width !== null && height !== null) {
      const aspectRatio = width / height;
      if (
        aspectRatio < MIN_MEDIA_ASPECT_RATIO ||
        aspectRatio > MAX_MEDIA_ASPECT_RATIO
      )
        throw fail(`${label}宽高比必须在 0.4–2.5 之间`);
    }
    metadata.width = width;
    metadata.height = height;
  }

  if (type === "video_url" || type === "audio_url") {
    const durationSeconds = optionalMetadataNumber(
      rawMetadata,
      "durationSeconds",
      label,
      { positive: true },
    );
    if (
      durationSeconds !== null &&
      (durationSeconds < 2 || durationSeconds > 15)
    )
      throw fail(`${label} metadata.durationSeconds 必须在 2–15 秒之间`);
    metadata.durationSeconds = durationSeconds;
  }

  if (type === "video_url") {
    const fps = optionalMetadataNumber(rawMetadata, "fps", label, {
      positive: true,
    });
    if (fps !== null && (fps < 23.976 || fps > 60))
      throw fail(`${label} metadata.fps 必须在 23.976–60 之间`);
    metadata.fps = fps;
  }

  return metadata;
}

function mediaValueFromShorthand(item, field) {
  if (typeof item === "string") return item;
  const nested = item?.[field];
  const url = item?.url ?? (nested && typeof nested === "object" ? nested.url : nested);
  const metadata =
    item?.metadata ?? (nested && typeof nested === "object" ? nested.metadata : undefined);
  return metadata === undefined ? url : { url, metadata };
}

function normalizeContentItem(item, index) {
  const type = String(item?.type || "").trim();
  if (!ALLOWED_TYPES.has(type))
    throw fail(`第 ${index + 1} 个 content 类型不支持`);
  if (type === "text") {
    const text = String(item?.text || "").trim();
    if (!text) throw fail("MiniMax-H3 提示词不能为空");
    if (text.length > 7000)
      throw fail("MiniMax-H3 单个文本提示词不能超过 7000 个字符");
    return { content: { type, text }, metadata: null };
  }

  const media = item?.[type];
  const rawUrl = item?.url ?? (media && typeof media === "object" ? media.url : media);
  const url = requirePublicUrl(rawUrl, `第 ${index + 1} 个素材`);
  const metadata = validateMediaMetadata(
    item?.metadata ??
      (media && typeof media === "object" ? media.metadata : undefined),
    type,
    `第 ${index + 1} 个素材`,
  );
  if (type === "image_url") {
    const role = String(item?.role || "first_frame").trim();
    if (!IMAGE_ROLES.has(role)) throw fail("图片 role 不支持");
    return { content: { type, image_url: { url }, role }, metadata };
  }
  if (type === "video_url") {
    const role = String(item?.role || "reference_video").trim();
    if (!VIDEO_ROLES.has(role)) throw fail("视频 role 只能是 reference_video");
    return { content: { type, video_url: { url }, role }, metadata };
  }
  const role = String(item?.role || "reference_audio").trim();
  if (!AUDIO_ROLES.has(role)) throw fail("音频 role 只能是 reference_audio");
  return { content: { type, audio_url: { url }, role }, metadata };
}

function shorthandContent({
  prompt,
  imageUrl,
  imageTailUrl,
  referenceImages = [],
  referenceVideos = [],
  referenceAudios = [],
}) {
  return [
    { type: "text", text: prompt },
    ...(imageUrl
      ? [{ type: "image_url", image_url: imageUrl, role: "first_frame" }]
      : []),
    ...(imageTailUrl
      ? [{ type: "image_url", image_url: imageTailUrl, role: "last_frame" }]
      : []),
    ...(Array.isArray(referenceImages) ? referenceImages : []).map((item) => ({
      type: "image_url",
      image_url: mediaValueFromShorthand(item, "image_url"),
      role: "reference_image",
    })),
    ...(Array.isArray(referenceVideos) ? referenceVideos : []).map((item) => ({
      type: "video_url",
      video_url: mediaValueFromShorthand(item, "video_url"),
      role: "reference_video",
    })),
    ...(Array.isArray(referenceAudios) ? referenceAudios : []).map((item) => ({
      type: "audio_url",
      audio_url: mediaValueFromShorthand(item, "audio_url"),
      role: "reference_audio",
    })),
  ];
}

function validateContent(content) {
  if (!Array.isArray(content) || !content.length)
    throw fail("MiniMax-H3 content 不能为空");
  const entries = content.map(normalizeContentItem);
  const normalized = entries.map((entry) => entry.content);
  if (!normalized.some((item) => item.type === "text" && item.text))
    throw fail("MiniMax-H3 content 必须包含非空 text 提示词");

  const frames = normalized.filter(
    (item) => item.type === "image_url" && ["first_frame", "last_frame"].includes(item.role),
  );
  const references = normalized.filter((item) =>
    ["reference_image", "reference_video", "reference_audio"].includes(item.role),
  );
  if (frames.length && references.length)
    throw fail("首尾帧生视频与多模态参考生视频不能混用");
  if (frames.filter((item) => item.role === "first_frame").length > 1)
    throw fail("首帧图片最多 1 张");
  if (frames.filter((item) => item.role === "last_frame").length > 1)
    throw fail("尾帧图片最多 1 张");
  if (frames.some((item) => item.role === "last_frame") && !frames.some((item) => item.role === "first_frame"))
    throw fail("尾帧图片必须与首帧图片一起使用");

  const referenceImages = references.filter((item) => item.role === "reference_image");
  const referenceVideos = references.filter((item) => item.role === "reference_video");
  const referenceAudios = references.filter((item) => item.role === "reference_audio");
  if (referenceImages.length > 9) throw fail("参考图片最多 9 张");
  if (referenceVideos.length > 3) throw fail("参考视频最多 3 段");
  if (referenceAudios.length > 3) throw fail("参考音频最多 3 段");
  if (referenceAudios.length && !referenceImages.length && !referenceVideos.length)
    throw fail("多模态参考不能只有音频，请至少添加 1 张参考图或 1 段参考视频");

  const knownMediaBytes = entries.reduce(
    (total, entry) => total + (entry.metadata?.sizeBytes || 0),
    0,
  );
  if (knownMediaBytes > MAX_TOTAL_MEDIA_BYTES)
    throw fail(
      "MiniMax-H3 已知素材总大小不能超过 64MB",
      413,
      "MINIMAX_PAYLOAD_TOO_LARGE",
    );

  for (const [role, label] of [
    ["reference_video", "参考视频"],
    ["reference_audio", "参考音频"],
  ]) {
    const knownDuration = entries
      .filter((entry) => entry.content.role === role)
      .reduce(
        (total, entry) => total + (entry.metadata?.durationSeconds || 0),
        0,
      );
    if (knownDuration > 15) throw fail(`${label}已知总时长不能超过 15 秒`);
  }

  return {
    content: normalized,
    mode: references.length ? "reference" : frames.length ? "frame" : "text",
  };
}

export function buildMiniMaxVideoRequest(input = {}) {
  const model = String(input.model || MODEL_NAME).trim();
  if (model !== MODEL_NAME) throw fail("MiniMax 视频模型只能是 MiniMax-H3");
  const resolution = String(input.resolution || "768P").trim().toUpperCase();
  if (!RESOLUTIONS.has(resolution))
    throw fail("MiniMax-H3 分辨率只能是 768P 或 2K");
  const duration = Number(input.duration ?? 5);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15)
    throw fail("MiniMax-H3 时长必须是 4–15 秒的整数");

  const sourceContent = Array.isArray(input.content)
    ? input.content
    : shorthandContent(input);
  const { content, mode } = validateContent(sourceContent);
  let ratio = String(input.ratio || input.aspectRatio || "").trim();
  if (mode === "text") {
    if (!ratio || !FIXED_RATIOS.has(ratio))
      throw fail("文生视频必须选择非 adaptive 的具体画幅比例");
  } else if (mode === "frame") {
    ratio = "adaptive";
  } else {
    ratio ||= "adaptive";
    if (!RATIOS.has(ratio)) throw fail("不支持该 MiniMax-H3 画幅比例");
  }
  if (ratio && !RATIOS.has(ratio))
    throw fail("不支持该 MiniMax-H3 画幅比例");

  const callbackUrl = String(input.callbackUrl || "").trim();
  const body = {
    model: MODEL_NAME,
    content,
    resolution,
    duration,
    ratio,
    ...(callbackUrl
      ? { callback_url: requirePublicUrl(callbackUrl, "回调 URL") }
      : {}),
    ...(input.aigcWatermark !== undefined
      ? { aigc_watermark: Boolean(input.aigcWatermark) }
      : {}),
  };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 64 * 1024 * 1024)
    throw fail("MiniMax-H3 请求体不能超过 64MB", 413, "MINIMAX_PAYLOAD_TOO_LARGE");
  return body;
}

function safeUpstreamCode(payload) {
  const value =
    payload?.error?.code ??
    payload?.error?.type ??
    payload?.code ??
    payload?.base_resp?.status_code;
  return value === undefined || value === null
    ? null
    : String(value).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80) || null;
}

function safeRequestId(payload, response) {
  const value =
    payload?.request_id ||
    payload?.trace_id ||
    response?.headers?.get?.("x-request-id") ||
    response?.headers?.get?.("x-trace-id");
  return value ? String(value).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 128) : null;
}

function upstreamFailure(response, payload) {
  const mapped = httpError(response.status);
  const error = new Error(mapped.message);
  error.name = "MiniMaxVideoError";
  error.status = response.status;
  error.code = mapped.code;
  error.retryable = response.status === 429 || response.status >= 500;
  error.payload = {
    provider: "minimax",
    httpStatus: response.status,
    upstreamCode: safeUpstreamCode(payload),
    requestId: safeRequestId(payload, response),
  };
  return error;
}

async function requestMiniMax(pathname, options = {}) {
  const env = options.env || process.env;
  const key = apiKey(env);
  if (!key)
    throw fail(
      "MiniMax API 尚未配置，请在后端设置 MINIMAX_API_KEY",
      503,
      "MINIMAX_NOT_CONFIGURED",
    );
  const fetchImpl = options.fetchImpl || fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl 必须是函数");
  let response;
  try {
    response = await fetchImpl(
      `${trimBaseUrl(options.baseUrl || env.MINIMAX_VIDEO_BASE_URL)}${pathname}`,
      {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal:
          options.signal ||
          AbortSignal.timeout(
            Number(
              options.timeoutMs ||
                (options.method === "POST" ? DEFAULT_TIMEOUT_MS : QUERY_TIMEOUT_MS),
            ),
          ),
      },
    );
  } catch (cause) {
    const timeout = ["AbortError", "TimeoutError"].includes(String(cause?.name || ""));
    const error = new Error(
      timeout
        ? "MiniMax 视频 API 请求超时，请稍后重试。"
        : "MiniMax 视频 API 网络连接失败，请稍后重试。",
    );
    error.name = "MiniMaxVideoError";
    error.status = timeout ? 504 : 502;
    error.code = timeout ? "MINIMAX_TIMEOUT" : "MINIMAX_NETWORK_ERROR";
    error.retryable = true;
    error.payload = {
      provider: "minimax",
      httpStatus: error.status,
      upstreamCode: null,
      requestId: null,
    };
    throw error;
  }
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok || payload?.type === "error" || payload?.error?.http_code)
    throw upstreamFailure(
      response.ok
        ? { ...response, status: Number(payload?.error?.http_code) || 502 }
        : response,
      payload,
    );
  return payload;
}

export async function submitMiniMaxVideo(input, options = {}) {
  const body = buildMiniMaxVideoRequest(input);
  const payload = await requestMiniMax("/v2/video_generation", {
    ...options,
    method: "POST",
    body,
  });
  const taskId = payload?.task_id || payload?.task?.id;
  if (!String(taskId || "").trim())
    throw fail(
      "MiniMax 已响应，但没有返回 task_id",
      502,
      "MINIMAX_TASK_ID_MISSING",
    );
  return {
    taskId: String(taskId),
    taskType: "minimax-h3-video",
    payload,
  };
}

export async function getMiniMaxVideoTask(taskId, options = {}) {
  const id = String(taskId || "").trim();
  if (!id || !/^[A-Za-z0-9_-]{1,160}$/.test(id))
    throw fail("MiniMax 视频任务 ID 不合法");
  return requestMiniMax(`/v2/query/video_generation/${encodeURIComponent(id)}`, options);
}

export function normalizeMiniMaxVideoTask(payload) {
  const task = payload?.task || payload?.data?.task || payload?.data || payload || {};
  const rawStatus = String(task.status || payload?.status || "").toLowerCase();
  const status =
    {
      queued: "queued",
      pending: "queued",
      running: "processing",
      processing: "processing",
      succeeded: "succeeded",
      success: "succeeded",
      failed: "failed",
      cancelled: "failed",
      canceled: "failed",
    }[rawStatus] || "processing";
  const videoUrl =
    task?.content?.url ||
    task?.output?.url ||
    task?.result?.url ||
    task?.video_url ||
    null;
  const upstreamError =
    task?.error?.message ||
    task?.error_message ||
    task?.fail_reason ||
    payload?.error?.message ||
    null;
  return {
    status,
    videoUrl,
    coverUrl: task?.cover_url || task?.content?.cover_url || null,
    error:
      status === "failed"
        ? generationErrorMessage(
            { message: upstreamError, payload: { status: rawStatus } },
            rawStatus === "cancelled" || rawStatus === "canceled"
              ? "MiniMax 视频任务已取消。"
              : "MiniMax 视频生成失败，请检查素材与提示词。",
          )
        : null,
    rawStatus,
    usage: task?.usage || null,
    resolution: task?.resolution || null,
    duration: task?.duration || null,
    ratio: task?.ratio || null,
  };
}

export const MINIMAX_VIDEO_MODEL = MODEL_NAME;

