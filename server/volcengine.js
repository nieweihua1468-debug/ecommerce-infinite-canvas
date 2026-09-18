import { createHash, createHmac } from 'node:crypto';
import { generationErrorMessage } from '../shared/generation-error-message.js';

const OPEN_API_HOST = 'open.volcengineapi.com';
const ASSET_API_HOST = 'ark.cn-beijing.volcengineapi.com';
const ARK_RUNTIME_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const REGION = 'cn-beijing';
const SERVICE = 'ark';
const VERSION = '2024-01-01';
const DEFAULT_RUNTIME_TIMEOUT_MS = 60_000;
const DEFAULT_GENERATION_SUBMIT_TIMEOUT_MS = 180_000;

let cachedApiKey = null;
let cachedApiKeyExpiresAt = 0;
let validatedApiKeyValue = null;
let validatedApiKeyCheckedAt = 0;
let connectionState = {
  configured: false,
  ready: false,
  status: 'not_configured',
  error: null,
  endpointId: null,
  modelName: null,
  checkedAt: null,
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding);
const uriEscape = (value) => encodeURIComponent(String(value)).replace(/[!*'()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

function signOpenApiRequest(action, body, now = new Date()) {
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretKey) throw Object.assign(new Error('火山引擎 AK/SK 尚未配置'), { status: 503 });

  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = xDate.slice(0, 8);
  const bodyHash = sha256(body);
  const query = { Action: action, Version: VERSION };
  const canonicalQuery = Object.keys(query).sort().map((key) => `${uriEscape(key)}=${uriEscape(query[key])}`).join('&');
  const canonicalHeaders = `host:${OPEN_API_HOST}\nx-content-sha256:${bodyHash}\nx-date:${xDate}`;
  const signedHeaders = 'host;x-content-sha256;x-date';
  const canonicalRequest = ['POST', '/', canonicalQuery, `${canonicalHeaders}\n`, signedHeaders, bodyHash].join('\n');
  const scope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(secretKey, shortDate);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, 'request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    url: `https://${OPEN_API_HOST}/?${canonicalQuery}`,
    headers: {
      Host: OPEN_API_HOST,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Date': xDate,
      'X-Content-Sha256': bodyHash,
      Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function callOpenApi(action, input) {
  const body = JSON.stringify(input);
  const signed = signOpenApiRequest(action, body);
  const response = await fetch(signed.url, { method: 'POST', headers: signed.headers, body, signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => ({}));
  const apiError = payload?.ResponseMetadata?.Error;
  if (!response.ok || apiError) {
    const error = new Error(apiError?.Message || `火山引擎 OpenAPI 请求失败（HTTP ${response.status}）`);
    error.code = apiError?.Code;
    error.status = response.status;
    throw error;
  }
  return payload.Result || {};
}

function signAssetApiRequest(action, body, now = new Date()) {
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretKey) throw Object.assign(new Error('火山引擎 Assets API 的 AK/SK 尚未配置'), { status: 503 });

  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = xDate.slice(0, 8);
  const bodyHash = sha256(body);
  const query = { Action: action, Version: VERSION };
  const canonicalQuery = Object.keys(query).sort().map((key) => `${uriEscape(key)}=${uriEscape(query[key])}`).join('&');
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `host:${ASSET_API_HOST}\nx-content-sha256:${bodyHash}\nx-date:${xDate}\ncontent-type:${contentType}`;
  const signedHeaders = 'host;x-content-sha256;x-date;content-type';
  const canonicalRequest = ['POST', '/', canonicalQuery, `${canonicalHeaders}\n`, signedHeaders, bodyHash].join('\n');
  const scope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(secretKey, shortDate);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, 'request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    url: `https://${ASSET_API_HOST}/?${canonicalQuery}`,
    headers: {
      Host: ASSET_API_HOST,
      'Content-Type': contentType,
      'X-Date': xDate,
      'X-Content-Sha256': bodyHash,
      Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function callAssetApi(action, input = {}) {
  const body = JSON.stringify(input);
  const signed = signAssetApiRequest(action, body);
  const response = await fetch(signed.url, { method: 'POST', headers: signed.headers, body, signal: AbortSignal.timeout(60_000) });
  const payload = await response.json().catch(() => ({}));
  const apiError = payload?.ResponseMetadata?.Error;
  if (!response.ok || apiError) {
    const error = new Error(apiError?.Message || payload?.message || `火山 Assets API 请求失败（HTTP ${response.status}）`);
    error.code = apiError?.Code || payload?.code;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload?.Result || payload;
}

export async function listAssetGroups({ pageNumber = 1, pageSize = 100 } = {}) {
  return callAssetApi('ListAssetGroups', {
    ProjectName: process.env.VOLCENGINE_PROJECT_NAME || 'default',
    PageNumber: pageNumber,
    PageSize: pageSize,
    Filter: { GroupType: 'AIGC' },
  });
}

export async function createAssetGroup({ name, description = '', groupType = 'AIGC' } = {}) {
  const payload = {
    Name: String(name || '').trim().slice(0, 64),
    ProjectName: process.env.VOLCENGINE_PROJECT_NAME || 'default',
    GroupType: String(groupType || 'AIGC').trim(),
  };
  if (!payload.Name) throw Object.assign(new Error('创建火山资产组时名称不能为空'), { status: 400 });
  if (description) payload.Description = String(description).trim().slice(0, 256);
  return callAssetApi('CreateAssetGroup', payload);
}

export async function getAssetGroup(groupId) {
  return callAssetApi('GetAssetGroup', {
    Id: String(groupId || '').trim(),
    ProjectName: process.env.VOLCENGINE_PROJECT_NAME || 'default',
  });
}

export async function createAsset({ groupId, sourceUrl, assetType = 'Image', name = '' }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!/^group-[A-Za-z0-9_-]+$/.test(normalizedGroupId)) throw Object.assign(new Error('请选择有效的已认证真人 Asset Group'), { status: 400 });
  const payload = {
    GroupId: normalizedGroupId,
    URL: String(sourceUrl || '').trim(),
    AssetType: assetType,
    ProjectName: process.env.VOLCENGINE_PROJECT_NAME || 'default',
  };
  if (name) payload.Name = String(name).slice(0, 64);
  return callAssetApi('CreateAsset', payload);
}

export async function getAsset(assetId) {
  return callAssetApi('GetAsset', {
    Id: String(assetId || '').trim(),
    ProjectName: process.env.VOLCENGINE_PROJECT_NAME || 'default',
  });
}

export async function waitForAssetActive(assetId, { timeoutMs = 900_000, intervalMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const asset = await getAsset(assetId);
    const status = String(asset?.Status || '').toLowerCase();
    if (status === 'active') return asset;
    if (['failed', 'error', 'rejected'].includes(status)) {
      const code = asset?.Error?.Code || 'AssetRejected';
      const message = code === 'FaceMismatch'
        ? '人脸一致性校验失败：上传图片与该认证组中的真人不是同一个人'
        : asset?.Error?.Message || '真人资产处理失败';
      const error = new Error(`${message}（${code}）`);
      error.code = code;
      error.payload = asset;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw Object.assign(new Error('等待真人资产进入 Active 状态超时'), { status: 504 });
}

export function hasVolcengineCredentials() {
  return Boolean(
    process.env.VOLCENGINE_ENDPOINT_ID
    && (process.env.VOLCENGINE_ARK_API_KEY || (process.env.VOLCENGINE_ACCESS_KEY_ID && process.env.VOLCENGINE_SECRET_ACCESS_KEY)),
  );
}

export function getVolcengineStatus() {
  return { ...connectionState };
}

async function getArkApiKey({ forceTemporary = false } = {}) {
  if (!forceTemporary && process.env.VOLCENGINE_ARK_API_KEY) return process.env.VOLCENGINE_ARK_API_KEY;
  if (cachedApiKey && Date.now() < cachedApiKeyExpiresAt - 60_000) return cachedApiKey;
  const endpointId = process.env.VOLCENGINE_ENDPOINT_ID;
  if (!endpointId) throw Object.assign(new Error('缺少 Seedance 推理接入点 ID'), { status: 503 });
  const result = await callOpenApi('GetApiKey', {
    DurationSeconds: 3600,
    ResourceType: 'endpoint',
    ResourceIds: [endpointId],
    ProjectName: process.env.VOLCENGINE_PROJECT_NAME || 'default',
  });
  if (!result.ApiKey) throw new Error('火山引擎未返回临时 API Key');
  cachedApiKey = result.ApiKey;
  cachedApiKeyExpiresAt = result.ExpiredTime ? new Date(result.ExpiredTime).getTime() : Date.now() + 3_600_000;
  return cachedApiKey;
}

async function probeArkApiKey(apiKey) {
  const response = await fetch(`${process.env.VOLCENGINE_ARK_BASE_URL || ARK_RUNTIME_BASE}/contents/generations/tasks/commerce-canvas-credential-probe`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  // A missing probe task returns 400/404 after authentication. Only explicit
  // authentication/authorization failures mean the runtime credential is bad.
  if (![401, 403].includes(response.status)) return true;
  const error = new Error(payload?.error?.message || payload?.message || `Seedance 凭证校验失败（HTTP ${response.status}）`);
  error.status = response.status;
  error.code = payload?.error?.code || payload?.code || 'SeedanceCredentialRejected';
  error.payload = payload;
  throw error;
}

async function validatedArkApiKey() {
  const staticKey = process.env.VOLCENGINE_ARK_API_KEY;
  const candidate = staticKey || cachedApiKey;
  if (candidate && candidate === validatedApiKeyValue && Date.now() - validatedApiKeyCheckedAt < 5 * 60_000) return candidate;
  if (staticKey) {
    try {
      await probeArkApiKey(staticKey);
      validatedApiKeyValue = staticKey;
      validatedApiKeyCheckedAt = Date.now();
      return staticKey;
    } catch (staticError) {
      if (!(process.env.VOLCENGINE_ACCESS_KEY_ID && process.env.VOLCENGINE_SECRET_ACCESS_KEY)) throw staticError;
      const temporaryKey = await getArkApiKey({ forceTemporary: true });
      await probeArkApiKey(temporaryKey);
      validatedApiKeyValue = temporaryKey;
      validatedApiKeyCheckedAt = Date.now();
      return temporaryKey;
    }
  }
  const temporaryKey = await getArkApiKey({ forceTemporary: true });
  await probeArkApiKey(temporaryKey);
  validatedApiKeyValue = temporaryKey;
  validatedApiKeyCheckedAt = Date.now();
  return temporaryKey;
}

export async function checkVolcengineConnection() {
  const endpointId = process.env.VOLCENGINE_ENDPOINT_ID || null;
  const modelName = process.env.VOLCENGINE_MODEL_NAME || 'doubao-seedance-2-0-fast';
  connectionState = {
    configured: hasVolcengineCredentials(),
    ready: false,
    status: hasVolcengineCredentials() ? 'checking' : 'not_configured',
    error: null,
    endpointId,
    modelName,
    checkedAt: new Date().toISOString(),
  };
  if (!connectionState.configured) return getVolcengineStatus();
  try {
    await validatedArkApiKey();
    connectionState = { ...connectionState, ready: true, status: 'ready', error: null, checkedAt: new Date().toISOString() };
  } catch (error) {
    connectionState = {
      ...connectionState,
      ready: false,
      status: error.code === 'AccessDenied' ? 'needs_get_api_key_permission' : 'error',
      error: error.code === 'AccessDenied' ? '当前 IAM 用户缺少 ark:GetApiKey 权限' : error.message,
      checkedAt: new Date().toISOString(),
    };
  }
  return getVolcengineStatus();
}

function positiveTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function runtimeRequestTimeout(pathname, method = 'GET') {
  const isGenerationSubmit = String(method).toUpperCase() === 'POST' && pathname === '/contents/generations/tasks';
  return isGenerationSubmit
    ? positiveTimeout(process.env.VOLCENGINE_GENERATION_SUBMIT_TIMEOUT_MS, DEFAULT_GENERATION_SUBMIT_TIMEOUT_MS)
    : positiveTimeout(process.env.VOLCENGINE_RUNTIME_TIMEOUT_MS, DEFAULT_RUNTIME_TIMEOUT_MS);
}

function isRequestTimeout(error) {
  return error?.name === 'TimeoutError' || (error?.name === 'AbortError' && /timeout/i.test(String(error?.message || '')));
}

async function runtimeRequest(pathname, options = {}) {
  const apiKey = await validatedArkApiKey();
  const method = options.method || 'GET';
  const timeoutMs = runtimeRequestTimeout(pathname, method);
  let response;
  try {
    response = await fetch(`${process.env.VOLCENGINE_ARK_BASE_URL || ARK_RUNTIME_BASE}${pathname}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (!isRequestTimeout(error)) throw error;
    const seconds = Math.ceil(timeoutMs / 1000);
    const isGenerationSubmit = String(method).toUpperCase() === 'POST' && pathname === '/contents/generations/tasks';
    const message = isGenerationSubmit
      ? `Seedance 创建任务等待超过 ${seconds} 秒，未取得任务 ID。上游可能已接收，请先核对火山方舟任务记录后再重试，避免重复创建。`
      : `Seedance 任务查询等待超过 ${seconds} 秒，请稍后重试。`;
    throw Object.assign(new Error(message), { status: 504, code: 'SeedanceRequestTimeout', cause: error });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      validatedApiKeyValue = null;
      validatedApiKeyCheckedAt = 0;
      connectionState = {
        ...connectionState,
        ready: false,
        status: 'credential_rejected',
        error: 'Seedance 运行凭证已失效，请管理员更新模型密钥',
        checkedAt: new Date().toISOString(),
      };
    }
    const error = new Error(payload?.error?.message || payload?.message || `Seedance 请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function submitSeedanceVideo({ modelName, image, imageMimeType = 'image/png', referenceImages = [], videos = [], prompt, duration = 15, aspectRatio = '9:16', ratioMode = 'adaptive', resolution = '720p', generateAudio = true, watermark = false, audios = [], trustedPersonAssets = [], assetUris = [], callbackUrl = '', returnLastFrame = false }) {
  const trustedAssets = [...trustedPersonAssets, ...assetUris].filter((asset, index, items) => asset?.uri && items.findIndex((item) => String(item?.uri || '') === String(asset.uri)) === index);
  const ratio = ratioMode === 'fixed' ? aspectRatio : (image || referenceImages.length || videos.length || trustedAssets.length ? 'adaptive' : aspectRatio);
  const runtimeModel = modelName === 'doubao-seedance-2-0-260128'
    ? process.env.VOLCENGINE_STANDARD_ENDPOINT_ID || modelName
    : modelName === 'doubao-seedance-2-0-fast-260128'
      ? process.env.VOLCENGINE_FAST_ENDPOINT_ID || process.env.VOLCENGINE_ENDPOINT_ID || modelName
      : process.env.VOLCENGINE_ENDPOINT_ID;
  const content = [
    { type: 'text', text: prompt },
    ...trustedAssets.map((asset) => ({
      type: 'image_url',
      image_url: { url: String(asset.uri).startsWith('asset://') ? String(asset.uri) : `asset://${asset.uri}` },
      role: 'reference_image',
    })),
    ...(image ? [{ type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${image}` }, role: referenceImages.length || videos.length || audios.length || trustedAssets.length ? 'reference_image' : 'first_frame' }] : []),
    ...referenceImages.map((reference, index) => ({
      type: 'image_url',
      image_url: { url: `data:${reference.mimeType};base64,${reference.data}` },
      role: 'reference_image',
    })),
    ...videos.map((video, index) => ({
      type: 'video_url',
      video_url: { url: video.url },
      role: 'reference_video',
    })),
    ...audios.map((audio) => ({
      type: 'audio_url',
      audio_url: { url: audio.url },
      role: 'reference_audio',
    })),
  ];
  const payload = await runtimeRequest('/contents/generations/tasks', {
    method: 'POST',
    body: JSON.stringify({
      model: runtimeModel,
      content,
      resolution,
      duration,
      ratio,
      generate_audio: Boolean(generateAudio),
      watermark: Boolean(watermark),
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      ...(returnLastFrame ? { return_last_frame: true } : {}),
    }),
  });
  if (!payload.id) throw new Error('Seedance 已响应，但没有返回任务 ID');
  return { taskId: payload.id, taskType: 'seedance', payload };
}

export async function getSeedanceTask(taskId) {
  return runtimeRequest(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
}

export function normalizeSeedanceTask(payload) {
  const statusMap = { queued: 'queued', running: 'processing', succeeded: 'succeeded', failed: 'failed', cancelled: 'failed', canceled: 'failed' };
  const status = statusMap[payload?.status] || 'processing';
  const upstreamError = payload?.error?.message || payload?.message || null;
  return {
    status,
    videoUrl: payload?.content?.video_url || null,
    coverUrl: null,
    error: status === 'failed' ? generationErrorMessage({ message: upstreamError, payload }, 'Seedance 生成失败，请调整素材或提示词后重试。') : null,
    rawStatus: payload?.status || '',
  };
}

export const __test = { signOpenApiRequest, signAssetApiRequest, callAssetApi, probeArkApiKey, runtimeRequestTimeout };

