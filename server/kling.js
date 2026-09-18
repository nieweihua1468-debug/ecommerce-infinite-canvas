import jwt from 'jsonwebtoken';
import { generationErrorMessage } from '../shared/generation-error-message.js';

const DEFAULT_BASE_URL = 'https://api-beijing.klingai.com';
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function isConfigured() {
  return Boolean(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
}

export function createKlingToken(now = Math.floor(Date.now() / 1000)) {
  if (!isConfigured()) {
    throw new Error('可灵 API 尚未配置，请在 .env.local 中填写 KLING_ACCESS_KEY 和 KLING_SECRET_KEY');
  }
  return jwt.sign(
    {
      iss: process.env.KLING_ACCESS_KEY,
      exp: now + 1800,
      nbf: now - 5,
    },
    process.env.KLING_SECRET_KEY,
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' }, noTimestamp: true },
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function requestHasIdempotencyKey(options = {}) {
  if (!options.body) return false;
  try {
    const body = JSON.parse(options.body);
    return Boolean(
      String(body?.external_task_id || body?.options?.external_task_id || '').trim(),
    );
  } catch {
    return false;
  }
}

function transientKlingError(error) {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  return Boolean(
    error?.retryable ||
      TRANSIENT_HTTP_STATUSES.has(Number(error?.status)) ||
      TRANSIENT_NETWORK_CODES.has(code) ||
      ['AbortError', 'TimeoutError'].includes(String(error?.name || '')) ||
      /fetch failed|failed to fetch|network|socket|timeout|timed out/i.test(
        String(error?.message || ''),
      ),
  );
}

const wait = (milliseconds) =>
  milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();

async function klingRequest(pathname, options = {}) {
  const base = process.env.KLING_BASE_URL || DEFAULT_BASE_URL;
  const method = String(options.method || 'GET').toUpperCase();
  const idempotent = ['GET', 'HEAD'].includes(method) || requestHasIdempotencyKey(options);
  const maxAttempts = idempotent
    ? positiveInteger(
        method === 'GET'
          ? process.env.KLING_READ_MAX_ATTEMPTS
          : process.env.KLING_SUBMIT_MAX_ATTEMPTS,
        method === 'GET' ? 3 : 2,
      )
    : 1;
  const timeoutMs = positiveInteger(
    method === 'GET'
      ? process.env.KLING_READ_TIMEOUT_MS
      : process.env.KLING_SUBMIT_TIMEOUT_MS,
    method === 'GET' ? 20_000 : 90_000,
  );
  const retryBaseMs = positiveInteger(process.env.KLING_RETRY_BASE_MS, 750);
  let lastError;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      const response = await fetch(`${base}${pathname}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${createKlingToken()}`,
          ...options.headers,
        },
        signal: options.signal || AbortSignal.timeout(timeoutMs),
      });

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { message: text || `HTTP ${response.status}` };
      }

      if (!response.ok || (payload.code && String(payload.code) !== '0')) {
        const error = new Error(payload.message || payload.msg || `可灵请求失败（HTTP ${response.status}）`);
        error.status = response.status;
        error.payload = payload;
        error.retryable = TRANSIENT_HTTP_STATUSES.has(response.status);
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (!idempotent || attempt >= maxAttempts || !transientKlingError(error))
        throw error;
      await wait(retryBaseMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

export async function listCustomVoices(pageNum = 1, pageSize = 100) {
  return klingRequest(`/v1/general/custom-voices?pageNum=${Number(pageNum)}&pageSize=${Number(pageSize)}`);
}

export async function listPresetVoices(pageNum = 1, pageSize = 100) {
  return klingRequest(`/v1/general/presets-voices?pageNum=${Number(pageNum)}&pageSize=${Number(pageSize)}`);
}

export async function createCustomVoice({ voiceName, voiceUrl, videoId, callbackUrl, externalTaskId }) {
  if (!String(voiceName || '').trim()) throw new Error('音色名称不能为空');
  if (String(voiceName).trim().length > 20) throw new Error('音色名称不能超过 20 个字符');
  if (!voiceUrl && !videoId) throw new Error('音色 URL 与历史作品 ID 至少填写一个');
  return klingRequest('/v1/general/custom-voices', { method: 'POST', body: JSON.stringify({ voice_name: String(voiceName).trim(), ...(voiceUrl ? { voice_url: String(voiceUrl).trim() } : {}), ...(videoId ? { video_id: String(videoId).trim() } : {}), ...(callbackUrl ? { callback_url: String(callbackUrl).trim() } : {}), ...(externalTaskId ? { external_task_id: String(externalTaskId).trim() } : {}) }) });
}

export async function createAdvancedElement({ elementName, elementDescription, referenceType, elementImageList = [], elementVideoList = [], elementVoiceId, tags = [], callbackUrl, externalTaskId }) {
  if (!String(elementName || '').trim() || !String(elementDescription || '').trim()) throw new Error('主体名称和主体描述不能为空');
  if (String(elementName).trim().length > 20 || String(elementDescription).trim().length > 100) throw new Error('主体名称不能超过 20 字，主体描述不能超过 100 字');
  if (!['image_refer', 'video_refer'].includes(referenceType)) throw new Error('主体参考类型只能是 image_refer 或 video_refer');
  const normalizedImages = Array.isArray(elementImageList) ? { frontal_image: elementImageList[0]?.frontal_image, refer_images: elementImageList.slice(1) } : elementImageList;
  const normalizedVideos = Array.isArray(elementVideoList) ? { refer_videos: elementVideoList } : elementVideoList;
  if (referenceType === 'image_refer' && (!normalizedImages?.frontal_image || !Array.isArray(normalizedImages.refer_images) || normalizedImages.refer_images.length < 1 || normalizedImages.refer_images.length > 3 || normalizedImages.refer_images.some((item) => !item?.image_url))) throw new Error('图片主体需要 1 张正面图和 1–3 张其他参考图');
  if (referenceType === 'video_refer' && (!Array.isArray(normalizedVideos?.refer_videos) || normalizedVideos.refer_videos.length !== 1 || !normalizedVideos.refer_videos[0]?.video_url)) throw new Error('视频主体需要且只能填写 1 段参考视频');
  const body = { element_name: String(elementName).trim(), element_description: String(elementDescription).trim(), reference_type: referenceType, ...(referenceType === 'image_refer' ? { element_image_list: normalizedImages } : { element_video_list: normalizedVideos }), ...(elementVoiceId ? { element_voice_id: String(elementVoiceId).trim() } : {}), ...(tags.length ? { tag_list: tags } : {}), ...(callbackUrl ? { callback_url: String(callbackUrl).trim() } : {}), ...(externalTaskId ? { external_task_id: String(externalTaskId).trim() } : {}) };
  return klingRequest('/v1/general/advanced-custom-elements', { method: 'POST', body: JSON.stringify(body) });
}

export async function listAdvancedElements(pageNum = 1, pageSize = 100) {
  return klingRequest(`/v1/general/advanced-custom-elements?pageNum=${Number(pageNum)}&pageSize=${Number(pageSize)}`);
}

export async function getAdvancedElement(taskId) {
  return klingRequest(`/v1/general/advanced-custom-elements/${encodeURIComponent(taskId)}`);
}

export async function listPresetElements(pageNum = 1, pageSize = 100) {
  return klingRequest(`/v1/general/advanced-presets-elements?pageNum=${Number(pageNum)}&pageSize=${Number(pageSize)}`);
}

export async function submitVideo({
  image,
  imageTail,
  prompt,
  negativePrompt,
  multiShot = true,
  shotType = 'intelligence',
  multiPrompt = [],
  duration = 15,
  mode = 'pro',
  cfgScale = 0.8,
  aspectRatio = '16:9',
  sound = 'off',
  callbackUrl,
  externalTaskId,
  elementIds = [],
}) {
  const taskType = image ? 'image2video' : 'text2video';
  const normalizedShotType = multiShot ? String(shotType || 'intelligence') : null;
  if (imageTail && !image) throw new Error('尾帧图片必须与首帧图片一起使用');
  if (multiShot && !['intelligence', 'customize'].includes(normalizedShotType)) throw new Error('V3 分镜方式只能是 intelligence 或 customize');
  if (!['on', 'off'].includes(sound)) throw new Error('V3 声音参数只能是 on 或 off');
  const normalizedMultiPrompt = Array.isArray(multiPrompt) ? multiPrompt.map((shot, index) => ({ index: Number(shot?.index ?? index + 1), prompt: String(shot?.prompt || '').trim(), duration: String(Number(shot?.duration)) })) : [];
  if (multiShot && normalizedShotType === 'customize') {
    if (normalizedMultiPrompt.length < 1 || normalizedMultiPrompt.length > 6) throw new Error('V3 自定义分镜必须为 1–6 个');
    if (normalizedMultiPrompt.reduce((sum, shot) => sum + Number(shot.duration), 0) !== Number(duration)) throw new Error('V3 自定义分镜时长之和必须等于视频总时长');
  }
  const body = {
    model_name: 'kling-v3',
    ...(image ? { image, ...(imageTail ? { image_tail: imageTail } : {}) } : { aspect_ratio: aspectRatio }),
    prompt: multiShot && normalizedShotType === 'customize' ? '' : prompt,
    ...(negativePrompt ? { negative_prompt: String(negativePrompt).trim() } : {}),
    mode,
    duration: String(duration),
    cfg_scale: cfgScale,
    multi_shot: Boolean(multiShot),
    ...(multiShot ? { shot_type: normalizedShotType } : {}),
    ...(multiShot && normalizedShotType === 'customize' ? { multi_prompt: normalizedMultiPrompt } : {}),
    sound,
    ...(callbackUrl ? { callback_url: String(callbackUrl).trim() } : {}),
    ...(externalTaskId ? { external_task_id: String(externalTaskId).trim() } : {}),
    ...(elementIds.length ? { element_list: elementIds.map((value) => ({ element_id: normalizeElementId(value) })) } : {}),
  };
  const payload = await klingRequest(`/v1/videos/${taskType}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const taskId = payload?.data?.task_id || payload?.task_id;
  if (!taskId) throw new Error('可灵已响应，但没有返回 task_id');
  return { taskId, taskType, payload };
}

export function buildTurboImageToVideoBody({ image, prompt, duration = 5, resolution = '1080p', callbackUrl, externalTaskId, watermark = false }) {
  const normalizedImage = String(image || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
  const normalizedPrompt = String(prompt || '').trim();
  const normalizedDuration = Number(duration);
  const normalizedResolution = String(resolution || '1080p').toLowerCase();
  if (!normalizedImage) throw new Error('Kling 3.0 Turbo 必须提供首帧图片');
  if (!normalizedPrompt) throw new Error('Kling 3.0 Turbo 提示词不能为空');
  if (!Number.isInteger(normalizedDuration) || normalizedDuration < 3 || normalizedDuration > 15) throw new Error('Kling 3.0 Turbo 时长必须是 3–15 秒的整数');
  if (!['720p', '1080p'].includes(normalizedResolution)) throw new Error('Kling 3.0 Turbo 分辨率只能是 720P 或 1080P');
  return {
    contents: [
      { type: 'prompt', text: normalizedPrompt },
      { type: 'first_frame', url: normalizedImage },
    ],
    settings: { resolution: normalizedResolution, duration: normalizedDuration },
    options: {
      ...(callbackUrl ? { callback_url: String(callbackUrl).trim() } : {}),
      ...(externalTaskId ? { external_task_id: String(externalTaskId).trim() } : {}),
      watermark_info: { enabled: Boolean(watermark) },
    },
  };
}

export async function submitTurboImageToVideo(options) {
  const payload = await klingRequest('/image-to-video/kling-3.0-turbo', {
    method: 'POST',
    body: JSON.stringify(buildTurboImageToVideoBody(options)),
  });
  const taskId = payload?.data?.id || payload?.data?.task_id || payload?.id || payload?.task_id;
  if (!taskId) throw new Error('可灵 Turbo 已响应，但没有返回任务 ID');
  return { taskId: String(taskId), taskType: 'turbo-image2video', payload };
}

function normalizeElementId(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new Error('可灵 Element ID 必须是纯数字');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('可灵 Element ID 超出当前平台可安全提交的范围');
  return parsed;
}

export function buildOmniBody({
  image,
  primaryImageType,
  referenceImages = [],
  elementIds = [],
  videoUrls = [],
  prompt,
  multiShot = true,
  shotType = 'intelligence',
  multiPrompt = [],
  duration = 15,
  mode = 'pro',
  cfgScale = 0.8,
  aspectRatio = '16:9',
  sound = 'off',
}) {
  const imageList = [
    ...(image ? [{ image_url: image, ...(primaryImageType ? { type: primaryImageType } : {}) }] : []),
    ...referenceImages.map((item) => ({
      image_url: String(item?.data || item?.imageUrl || '').trim(),
      ...(item?.type ? { type: item.type } : {}),
    })),
  ].filter((item) => item.image_url);
  const elementList = elementIds.map((value) => ({ element_id: normalizeElementId(value) }));
  const videoList = videoUrls.map((item) => ({
    video_url: String(item?.url || item?.videoUrl || '').trim(),
    refer_type: String(item?.referType || item?.refer_type || 'base'),
    keep_original_sound: String(item?.keepOriginalSound || item?.keep_original_sound || 'no'),
  }));
  const normalizedDuration = Number(duration);
  const normalizedShotType = multiShot ? String(shotType || 'intelligence') : null;
  const normalizedMultiPrompt = Array.isArray(multiPrompt) ? multiPrompt.map((shot, index) => ({
    index: Number(shot?.index ?? index + 1),
    prompt: String(shot?.prompt || '').trim(),
    duration: String(Number(shot?.duration)),
  })) : [];

  if (!String(prompt || '').trim() && !(multiShot && normalizedShotType === 'customize')) throw new Error('Omni 提示词不能为空');
  if (imageList.length > 7) throw new Error('Kling 3.0 Omni 最多支持 7 张图片/主体组合');
  if (elementList.length > 3) throw new Error('Kling 3.0 Omni 最多支持 3 个 Element 主体');
  if (imageList.length + elementList.length > (videoList.length ? 4 : 7)) throw new Error(videoList.length ? '带参考视频时，图片与 Element 主体合计最多 4 个' : '图片与 Element 主体合计最多 7 个');
  if (videoList.length > 1) throw new Error('Kling 3.0 Omni 最多支持 1 段参考视频');
  if (videoList.some((item) => !/^https?:\/\//i.test(item.video_url))) throw new Error('Omni 参考视频必须填写可公开访问的 HTTP(S) URL');
  if (videoList.some((item) => !['base', 'feature'].includes(item.refer_type))) throw new Error('参考视频类型只能是 base 或 feature');
  if (videoList.some((item) => !['yes', 'no'].includes(item.keep_original_sound))) throw new Error('参考视频原声参数只能是 yes 或 no');
  if (!['on', 'off'].includes(sound)) throw new Error('Omni 声音参数只能是 on 或 off');
  if (videoList.length && sound !== 'off') throw new Error('使用参考视频时，Omni 声音生成必须关闭');
  if (videoList.some((item) => item.refer_type === 'base') && multiShot) throw new Error('视频编辑（base）不支持多镜头，请关闭多镜头');
  if (videoList.some((item) => item.refer_type === 'feature') && multiShot && normalizedShotType !== 'intelligence') throw new Error('特征参考视频开启多镜头时只能使用智能分镜');
  if (multiShot && !['intelligence', 'customize'].includes(normalizedShotType)) throw new Error('Omni 分镜方式只能是 intelligence 或 customize');
  if (multiShot && normalizedShotType === 'customize') {
    if (normalizedMultiPrompt.length < 1 || normalizedMultiPrompt.length > 6) throw new Error('Omni 自定义分镜必须为 1–6 个');
    if (normalizedMultiPrompt.some((shot, index) => shot.index !== index + 1 || !shot.prompt || shot.prompt.length > 512 || !Number.isInteger(Number(shot.duration)) || Number(shot.duration) < 1)) throw new Error('自定义分镜需按顺序编号，每段提示词不超过 512 字且时长至少 1 秒');
    if (normalizedMultiPrompt.reduce((sum, shot) => sum + Number(shot.duration), 0) !== normalizedDuration) throw new Error('自定义分镜时长之和必须等于视频总时长');
  }

  return {
    model_name: 'kling-v3-omni',
    multi_shot: Boolean(multiShot),
    ...(multiShot ? { shot_type: normalizedShotType } : {}),
    prompt: multiShot && normalizedShotType === 'customize' ? '' : String(prompt || '').trim(),
    ...(multiShot && normalizedShotType === 'customize' ? { multi_prompt: normalizedMultiPrompt } : {}),
    image_list: imageList,
    element_list: elementList,
    video_list: videoList,
    mode,
    sound,
    aspect_ratio: aspectRatio,
    duration: String(normalizedDuration),
    cfg_scale: Number(cfgScale),
  };
}

export async function submitOmniVideo(options) {
  const body = buildOmniBody(options);
  const payload = await klingRequest('/v1/videos/omni-video', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const taskId = payload?.data?.task_id || payload?.task_id;
  if (!taskId) throw new Error('可灵 Omni 已响应，但没有返回 task_id');
  return { taskId, taskType: 'omni-video', payload };
}

export function buildMotionControlBody({
  image,
  videoUrl,
  prompt,
  mode = 'pro',
  characterOrientation = 'video',
  keepOriginalSound = 'yes',
  callbackUrl,
  externalTaskId,
}) {
  const normalizedImage = String(image || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
  const normalizedVideoUrl = String(videoUrl || '').trim();
  const normalizedOrientation = String(characterOrientation || 'video');
  const normalizedSound = typeof keepOriginalSound === 'boolean' ? (keepOriginalSound ? 'yes' : 'no') : String(keepOriginalSound || 'yes');
  if (!normalizedImage) throw new Error('动作控制必须提供一张人物参考图');
  if (!/^https?:\/\//i.test(normalizedVideoUrl)) throw new Error('动作控制必须提供可公开访问的动作参考视频 URL');
  if (!['std', 'pro'].includes(mode)) throw new Error('动作控制模式只能是 std 或 pro');
  if (!['image', 'video'].includes(normalizedOrientation)) throw new Error('人物朝向只能跟随 image 或 video');
  if (!['yes', 'no'].includes(normalizedSound)) throw new Error('保留原声参数只能是 yes 或 no');
  return {
    image_url: normalizedImage,
    video_url: normalizedVideoUrl,
    prompt: String(prompt || '').trim(),
    mode,
    keep_original_sound: normalizedSound,
    character_orientation: normalizedOrientation,
    ...(callbackUrl ? { callback_url: String(callbackUrl).trim() } : {}),
    ...(externalTaskId ? { external_task_id: String(externalTaskId).trim() } : {}),
  };
}

export async function submitMotionControl(options) {
  const payload = await klingRequest('/v1/videos/motion-control', {
    method: 'POST',
    body: JSON.stringify(buildMotionControlBody(options)),
  });
  const taskId = payload?.data?.task_id || payload?.task_id;
  if (!taskId) throw new Error('可灵动作控制已响应，但没有返回 task_id');
  return { taskId, taskType: 'motion-control', payload };
}

export async function getVideoTask(taskId, taskType = 'image2video') {
  if (taskType === 'turbo-image2video') return klingRequest(`/tasks?task_ids=${encodeURIComponent(taskId)}`);
  const safeType = ['text2video', 'omni-video', 'motion-control'].includes(taskType) ? taskType : 'image2video';
  return klingRequest(`/v1/videos/${safeType}/${encodeURIComponent(taskId)}`);
}

export function normalizeKlingTask(payload) {
  const root = payload?.data || payload || {};
  const collections = [root?.tasks, root?.task_list, root?.list, root?.records, root?.items, root];
  const data = collections.find((item) => Array.isArray(item) && item.length)?.[0] || root;
  const upstreamStatus = String(data.task_status || data.status || '').toLowerCase();
  const statusMap = {
    submitted: 'queued',
    pending: 'queued',
    processing: 'processing',
    running: 'processing',
    succeed: 'succeeded',
    success: 'succeeded',
    failed: 'failed',
    failure: 'failed',
  };
  const status = statusMap[upstreamStatus] || 'processing';
  const videos = data?.task_result?.videos || data?.result?.videos || data?.output?.videos || data?.videos || [];
  const directVideoUrl = data?.video_url || data?.result?.video_url || data?.output?.video_url || data?.result?.url || data?.output?.url || '';
  const upstreamError = data.task_status_msg || data.status_message || data.message || data.error?.message || null;
  return {
    status,
    videoUrl: videos[0]?.url || directVideoUrl || null,
    coverUrl: videos[0]?.cover_url || videos[0]?.coverUrl || null,
    error: status === 'failed' ? generationErrorMessage({ message: upstreamError, payload }, '可灵视频生成失败，请调整素材或提示词后重试。') : null,
    rawStatus: upstreamStatus,
  };
}

