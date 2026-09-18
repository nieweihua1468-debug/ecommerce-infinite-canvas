import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createWorkQueue } from './work-queue.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const VAPEUR_MODEL_ALIAS = 'vapeur-gpt-image-2';
const MAX_REFERENCE_PIXELS = 36_000_000;
const SAFE_REFERENCE_PIXELS = 35_000_000;
const MAX_REFERENCE_BYTES = 24 * 1024 * 1024;
const SAFE_REFERENCE_EDGE = 4096;
const SAFE_SEEDANCE_IMAGE_BYTES = 18 * 1024 * 1024;
const SAFE_KLING_FRAME_BYTES = 10 * 1024 * 1024;
const SAFE_KLING_FRAME_MIN_EDGE = 512;
const execFileAsync = promisify(execFile);
const scheduleImageProviderRequest = createWorkQueue(Number(process.env.IMAGE_PROVIDER_CONCURRENCY || 2));
const IMAGE_REQUEST_TIMEOUT_MS = 240_000;
const IMAGE_REQUEST_MAX_ATTEMPTS = Math.max(
  3,
  Math.min(6, Number(process.env.IMAGE_PROVIDER_MAX_ATTEMPTS || 5)),
);
const RETRYABLE_IMAGE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const IMAGE_RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];

const wait = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    let abort;
    const timer = setTimeout(() => {
      if (signal && abort) signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    if (!signal) return;
    abort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error('图片任务已取消'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(60_000, retryAfter * 1000);
  return IMAGE_RETRY_DELAYS_MS[attempt] || 60_000;
}

async function requestImageProvider(url, options, fetchImpl) {
  const { signal: externalSignal, ...requestOptions } = options || {};
  return scheduleImageProviderRequest(async (queueSignal) => {
    let lastError;
    for (let attempt = 0; attempt < IMAGE_REQUEST_MAX_ATTEMPTS; attempt += 1) {
      if (queueSignal.aborted) throw queueSignal.reason;
      try {
        const timeoutSignal = AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS);
        const response = await fetchImpl(url, {
          ...requestOptions,
          signal: AbortSignal.any([queueSignal, timeoutSignal]),
        });
        if (!RETRYABLE_IMAGE_STATUSES.has(response.status) || attempt === IMAGE_REQUEST_MAX_ATTEMPTS - 1) return response;
        await response.arrayBuffer().catch(() => undefined);
        await wait(retryDelay(response, attempt), queueSignal);
      } catch (error) {
        if (queueSignal.aborted) throw queueSignal.reason || error;
        lastError = error;
        if (attempt === IMAGE_REQUEST_MAX_ATTEMPTS - 1) {
          if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            throw Object.assign(new Error('图片模型响应超过 240 秒，任务已安全停止'), { status: 504, code: 'ImageProviderTimeout', cause: error });
          }
          throw error;
        }
        await wait(IMAGE_RETRY_DELAYS_MS[attempt] || 60_000, queueSignal);
      }
    }
    throw lastError || new Error('图片模型请求失败');
  }, { signal: externalSignal });
}

function isVapeurRequest(input = {}) {
  return String(input.model || '') === VAPEUR_MODEL_ALIAS;
}

function providerConfiguration(input = {}) {
  if (isVapeurRequest(input)) {
    return {
      apiKey: String(process.env.VAPEUR_API_KEY || '').trim(),
      baseUrl: String(process.env.VAPEUR_BASE_URL || 'https://api.vapeur.ai/v1').replace(/\/$/, ''),
      model: String(process.env.VAPEUR_IMAGE_MODEL || 'gpt-image-2'),
      azure: false,
      name: 'Vapeur',
    };
  }
  const baseUrl = String(process.env.IMAGE2_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    apiKey: String(process.env.IMAGE2_API_KEY || '').trim(),
    baseUrl,
    model: String(process.env.IMAGE2_MODEL || 'gpt-image-2'),
    azure: String(process.env.IMAGE2_AUTH_TYPE || '').toLowerCase() === 'azure'
      || baseUrl.toLowerCase().includes('.services.ai.azure.com')
      || baseUrl.toLowerCase().includes('.openai.azure.com'),
    name: 'Image2',
  };
}

function getConfigurationIssue() {
  const apiKey = String(process.env.IMAGE2_API_KEY || '').trim();
  const baseUrl = String(process.env.IMAGE2_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  if (!apiKey) return 'Image2 API 密钥尚未配置';
  if (String(process.env.IMAGE2_ENABLED || 'true').toLowerCase() === 'false') {
    return 'Image2 模型已暂停：当前 API Key 尚未获得 gpt-image-2 模型权限';
  }
  if (baseUrl === DEFAULT_BASE_URL && apiKey.startsWith('sk-toviz')) {
    return 'Image2 网关地址未配置：当前密钥不是 OpenAI 官方密钥，请在管理员环境中填写密钥所属平台的 Base URL';
  }
  return '';
}

export function isImage2Configured() {
  return !getConfigurationIssue();
}

export function isVapeurImageConfigured() {
  return Boolean(String(process.env.VAPEUR_API_KEY || '').trim());
}

export function getImage2Status() {
  return {
    configured: isImage2Configured(),
    enabled: String(process.env.IMAGE2_ENABLED || 'true').toLowerCase() !== 'false',
    model: process.env.IMAGE2_MODEL || 'gpt-image-2',
    baseUrl: process.env.IMAGE2_BASE_URL || DEFAULT_BASE_URL,
    error: getConfigurationIssue(),
  };
}

function requestHeaders(provider) {
  return provider.azure
    ? { 'api-key': provider.apiKey }
    : { Authorization: `Bearer ${provider.apiKey}` };
}

function azureImageSize(input) {
  const aspectRatio = String(input.aspectRatio || '9:16');
  if (aspectRatio === '1:1') return '1024x1024';
  const [width, height] = aspectRatio.split(':').map(Number);
  return width > height ? '1536x1024' : '1024x1536';
}

function cleanBase64(value) {
  return String(value || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

export function readImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > buffer.length) break;
      if (startOfFrame.has(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      offset += length + 2;
    }
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X' && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      return { width: 1 + b0 + ((b1 & 0x3f) << 8), height: 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10) };
    }
  }
  return null;
}

function safeReferenceDimensions({ width, height }, maxEdge = Infinity) {
  const scale = Math.min(
    1,
    Math.sqrt(SAFE_REFERENCE_PIXELS / (width * height)),
    maxEdge / width,
    maxEdge / height,
  );
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
}

async function resizeReferenceImageWithFfmpeg({
  buffer,
  mimeType,
  name,
  width,
  height,
  maxBytes = MAX_REFERENCE_BYTES,
  maxEdge = SAFE_REFERENCE_EDGE,
}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-reference-'));
  const inputExtension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  // Provider-facing references are always normalized to baseline JPEG. This
  // removes PNG palette/alpha/color-profile variants that some gateways reject
  // and substantially reduces queued workflow memory.
  const outputExtension = 'jpg';
  const outputMimeType = 'image/jpeg';
  const inputPath = path.join(directory, `input.${inputExtension}`);
  const outputPath = path.join(directory, `output.${outputExtension}`);
  let target = safeReferenceDimensions({ width, height }, maxEdge);
  try {
    await fs.writeFile(inputPath, buffer);
    const render = async (destination, edge) => {
      await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', inputPath,
        '-map_metadata', '-1',
        '-vf', `scale=w='min(iw,${edge})':h='min(ih,${edge})':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,format=${outputExtension === 'png' ? 'rgba' : 'yuvj420p'}`,
        '-frames:v', '1',
        ...(outputExtension === 'jpg' ? ['-q:v', '3'] : ['-compression_level', '8']),
        destination,
      ], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    };
    await render(outputPath, maxEdge);
    let outputBuffer = await fs.readFile(outputPath);
    target = readImageDimensions(outputBuffer) || target;
    if (outputBuffer.length > maxBytes) {
      await render(outputPath, 2048);
      outputBuffer = await fs.readFile(outputPath);
      target = readImageDimensions(outputBuffer) || safeReferenceDimensions({ width, height }, 2048);
    }
    return {
      buffer: outputBuffer,
      mimeType: outputMimeType,
      name: String(name || 'reference-image').replace(/\.[^.]+$/, '') + `.${outputExtension}`,
      width: target.width,
      height: target.height,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function normalizeKlingFrameWithFfmpeg({
  buffer,
  mimeType,
  name,
  width,
  height,
}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-kling-frame-'));
  const inputExtension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const inputPath = path.join(directory, `input.${inputExtension}`);
  const outputPath = path.join(directory, 'output.jpg');
  const pixelScale = Math.sqrt(SAFE_REFERENCE_PIXELS / (width * height));
  const edgeScale = Math.min(SAFE_REFERENCE_EDGE / width, SAFE_REFERENCE_EDGE / height);
  const minimumScale = Math.max(1, SAFE_KLING_FRAME_MIN_EDGE / Math.min(width, height));
  const scale = Math.min(minimumScale, pixelScale, edgeScale);
  const targetWidth = Math.max(2, Math.round((width * scale) / 2) * 2);
  const targetHeight = Math.max(2, Math.round((height * scale) / 2) * 2);
  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-map_metadata', '-1',
      '-vf', `scale=${targetWidth}:${targetHeight}:flags=lanczos,format=yuvj420p`,
      '-frames:v', '1',
      '-q:v', '3',
      outputPath,
    ], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    const outputBuffer = await fs.readFile(outputPath);
    const outputDimensions = readImageDimensions(outputBuffer) || {
      width: targetWidth,
      height: targetHeight,
    };
    return {
      buffer: outputBuffer,
      mimeType: 'image/jpeg',
      name: String(name || 'kling-frame').replace(/\.[^.]+$/, '') + '.jpg',
      ...outputDimensions,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function optimizeSeedanceImageWithFfmpeg({ buffer, mimeType, name, width, height }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-seedance-image-'));
  const inputExtension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const inputPath = path.join(directory, `input.${inputExtension}`);
  const outputPath = path.join(directory, 'output.jpg');
  const target = safeReferenceDimensions({ width, height });
  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-map_metadata', '-1',
      '-vf', `scale=w='min(iw,${SAFE_REFERENCE_EDGE})':h='min(ih,${SAFE_REFERENCE_EDGE})':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,format=yuvj420p`,
      '-frames:v', '1',
      '-q:v', '4',
      outputPath,
    ], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    const outputBuffer = await fs.readFile(outputPath);
    const outputDimensions = readImageDimensions(outputBuffer) || target;
    return {
      buffer: outputBuffer,
      mimeType: 'image/jpeg',
      name: String(name || 'seedance-image').replace(/\.[^.]+$/, '') + '.jpg',
      width: outputDimensions.width,
      height: outputDimensions.height,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export async function prepareReferenceImage(
  image,
  resizeImpl = resizeReferenceImageWithFfmpeg,
  { normalize = false, maxBytes = MAX_REFERENCE_BYTES, maxEdge = SAFE_REFERENCE_EDGE } = {},
) {
  const buffer = Buffer.from(cleanBase64(image?.data), 'base64');
  const dimensions = readImageDimensions(buffer);
  if (!dimensions) throw Object.assign(new Error(`${image?.name || '参考图片'} 无法读取，支持标准 JPG、PNG 或 WebP`), { status: 400 });
  const mimeType = String(image?.mimeType || 'image/png').toLowerCase();
  const overPixels = dimensions.width * dimensions.height > MAX_REFERENCE_PIXELS;
  const overBytes = buffer.length > maxBytes;
  const unsupportedForAzure = !['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType);
  const needsNormalization = normalize || overPixels || overBytes || unsupportedForAzure;
  if (!needsNormalization) {
    return {
      ...image,
      buffer,
      dimensions,
      originalDimensions: dimensions,
      resized: false,
      compressed: false,
      normalized: false,
      originalBytes: buffer.length,
      bytes: buffer.length,
    };
  }
  const resized = await resizeImpl({
    buffer,
    mimeType,
    name: image?.name,
    ...dimensions,
    maxBytes,
    maxEdge,
  });
  if (resized.width * resized.height > MAX_REFERENCE_PIXELS)
    throw Object.assign(new Error(`${image?.name || '参考图片'} 自动缩放后仍超过 3600 万像素`), { status: 400 });
  if (resized.buffer.length > maxBytes)
    throw Object.assign(new Error(`${image?.name || '参考图片'} 自动压缩后仍超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`), { status: 400 });
  return {
    ...image,
    buffer: resized.buffer,
    mimeType: resized.mimeType,
    name: resized.name,
    dimensions: { width: resized.width, height: resized.height },
    originalDimensions: dimensions,
    resized: resized.width !== dimensions.width || resized.height !== dimensions.height,
    compressed: resized.buffer.length < buffer.length,
    normalized: true,
    converted: resized.mimeType !== mimeType,
    originalBytes: buffer.length,
    bytes: resized.buffer.length,
  };
}

export async function prepareSeedanceImage(image, optimizeImpl = optimizeSeedanceImageWithFfmpeg) {
  const buffer = Buffer.from(cleanBase64(image?.data), 'base64');
  const dimensions = readImageDimensions(buffer);
  if (!dimensions) throw Object.assign(new Error(`${image?.name || '图片'} 无法读取尺寸，请重新导出为 JPG、PNG 或 WebP`), { status: 400 });
  const overPixels = dimensions.width * dimensions.height > MAX_REFERENCE_PIXELS;
  const overBytes = buffer.length > SAFE_SEEDANCE_IMAGE_BYTES;
  if (!overPixels && !overBytes) {
    return { ...image, buffer, dimensions, resized: false, compressed: false, originalBytes: buffer.length, bytes: buffer.length };
  }
  const optimized = await optimizeImpl({ buffer, mimeType: String(image?.mimeType || 'image/png'), name: image?.name, ...dimensions });
  if (optimized.width * optimized.height > MAX_REFERENCE_PIXELS) throw new Error('图片自动缩放后仍超过 Seedance 3600 万像素限制');
  if (optimized.buffer.length > SAFE_SEEDANCE_IMAGE_BYTES) throw new Error('图片自动压缩后仍超过 18MB，请换用更小的原图');
  return {
    ...image,
    buffer: optimized.buffer,
    mimeType: optimized.mimeType,
    name: optimized.name,
    dimensions: { width: optimized.width, height: optimized.height },
    originalDimensions: dimensions,
    resized: overPixels,
    compressed: overBytes || optimized.buffer.length < buffer.length,
    originalBytes: buffer.length,
    bytes: optimized.buffer.length,
  };
}

export async function prepareKlingFrame(image, normalizeImpl = normalizeKlingFrameWithFfmpeg) {
  const buffer = Buffer.from(cleanBase64(image?.data), 'base64');
  const dimensions = readImageDimensions(buffer);
  if (!dimensions)
    throw Object.assign(new Error(`${image?.name || '视频帧'} 无法读取尺寸，请重新导出为 JPG 或 PNG`), { status: 400 });
  const ratio = dimensions.width / dimensions.height;
  if (ratio < 0.4 || ratio > 2.5)
    throw Object.assign(new Error(`${image?.name || '视频帧'} 宽高比超出可灵支持范围（1:2.5 至 2.5:1）`), { status: 400 });
  const mimeType = String(image?.mimeType || 'image/png').toLowerCase();
  const needsNormalization =
    Math.min(dimensions.width, dimensions.height) < SAFE_KLING_FRAME_MIN_EDGE
    || dimensions.width * dimensions.height > MAX_REFERENCE_PIXELS
    || buffer.length > SAFE_KLING_FRAME_BYTES
    || !['image/jpeg', 'image/jpg'].includes(mimeType);
  if (!needsNormalization) {
    return {
      ...image,
      buffer,
      dimensions,
      originalDimensions: dimensions,
      resized: false,
      compressed: false,
      normalized: false,
      originalBytes: buffer.length,
      bytes: buffer.length,
    };
  }
  const normalized = await normalizeImpl({
    buffer,
    mimeType,
    name: image?.name,
    ...dimensions,
  });
  if (Math.min(normalized.width, normalized.height) < SAFE_KLING_FRAME_MIN_EDGE)
    throw Object.assign(new Error(`${image?.name || '视频帧'} 自动优化后尺寸仍过小`), { status: 400 });
  if (normalized.width * normalized.height > MAX_REFERENCE_PIXELS)
    throw Object.assign(new Error(`${image?.name || '视频帧'} 自动优化后仍超过 3600 万像素`), { status: 400 });
  if (normalized.buffer.length > SAFE_KLING_FRAME_BYTES)
    throw Object.assign(new Error(`${image?.name || '视频帧'} 自动优化后仍超过 10MB`), { status: 400 });
  return {
    ...image,
    buffer: normalized.buffer,
    mimeType: normalized.mimeType,
    name: normalized.name,
    dimensions: { width: normalized.width, height: normalized.height },
    originalDimensions: dimensions,
    resized: normalized.width !== dimensions.width || normalized.height !== dimensions.height,
    compressed: normalized.buffer.length < buffer.length,
    normalized: true,
    converted: normalized.mimeType !== mimeType,
    originalBytes: buffer.length,
    bytes: normalized.buffer.length,
  };
}

function normalizeImages(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.images) ? payload.images : [];
  return items.map((item, index) => ({
    id: String(index + 1),
    url: item?.url || '',
    base64: item?.b64_json || item?.base64 || item?.image_base64 || '',
    revisedPrompt: item?.revised_prompt || '',
  })).filter((item) => item.url || item.base64);
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstreamMessage = String(payload?.error?.message || payload?.message || `Image2 请求失败（HTTP ${response.status}）`);
    const authenticationFailure = response.status === 401 || response.status === 403 || /api[ _-]?key|authentication|unauthori[sz]ed/i.test(upstreamMessage);
    const error = new Error(authenticationFailure ? '图片模型鉴权失败，请联系管理员检查 Image2 网关与密钥配置' : upstreamMessage);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw error;
  }
  const images = normalizeImages(payload);
  if (!images.length) throw Object.assign(new Error('Image2 未返回可用图片'), { status: 502 });
  return { images, usage: payload?.usage || null, rawId: payload?.id || '' };
}

export async function generateImage2(input, fetchImpl = fetch, resizeImpl = resizeReferenceImageWithFfmpeg) {
  const provider = providerConfiguration(input);
  if (isVapeurRequest(input) && !provider.apiKey) throw Object.assign(new Error('Vapeur 图片模型尚未配置'), { status: 503 });
  if (!isVapeurRequest(input)) {
    const configurationIssue = getConfigurationIssue();
    if (configurationIssue) throw Object.assign(new Error(configurationIssue), { status: 503 });
  }
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('请输入图片提示词'), { status: 400 });
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 4) : [];
  const azure = provider.azure;
  const headers = requestHeaders(provider);
  const size = azure ? azureImageSize(input) : String(input.size || '1024x1536');
  let response;
  if (referenceImages.length) {
    const preparedImages = await Promise.all(referenceImages.map((image) => prepareReferenceImage(
      image,
      resizeImpl,
      { normalize: azure, maxBytes: MAX_REFERENCE_BYTES, maxEdge: SAFE_REFERENCE_EDGE },
    )));
    const form = new FormData();
    form.set('model', provider.model);
    form.set('prompt', prompt);
    form.set('size', size);
    if (!azure) {
      form.set('aspect_ratio', String(input.aspectRatio || '9:16'));
      form.set('resolution', String(input.resolution || '2k'));
    }
    form.set('quality', String(input.quality || 'high'));
    form.set('output_format', String(input.outputFormat || 'png'));
    preparedImages.forEach((image, index) => {
      const mimeType = String(image.mimeType || 'image/png');
      form.append('image[]', new Blob([image.buffer], { type: mimeType }), image.name || `reference-${index + 1}.png`);
    });
    response = await requestImageProvider(`${provider.baseUrl}/images/edits`, { method: 'POST', headers, body: form, signal: input.signal }, fetchImpl);
    const parsed = await parseResponse(response);
    return {
      ...parsed,
      inputOptimizations: preparedImages.map((image, index) => ({
        index: index + 1,
        name: image.name || `参考图 ${index + 1}`,
        mimeType: image.mimeType,
        dimensions: image.dimensions,
        originalDimensions: image.originalDimensions,
        bytes: image.bytes,
        originalBytes: image.originalBytes,
        resized: Boolean(image.resized),
        compressed: Boolean(image.compressed),
        normalized: Boolean(image.normalized),
        converted: Boolean(image.converted),
      })),
    };
  } else {
    response = await requestImageProvider(`${provider.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: input.signal,
      body: JSON.stringify({
        model: provider.model,
        prompt,
        size,
        ...(!azure ? {
          aspect_ratio: String(input.aspectRatio || '9:16'),
          resolution: String(input.resolution || '2k'),
        } : {}),
        quality: String(input.quality || 'high'),
        output_format: String(input.outputFormat || 'png'),
        n: Math.min(4, Math.max(1, Number(input.n) || 1)),
      }),
    }, fetchImpl);
  }
  return parseResponse(response);
}

