import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_BASE_URL = 'https://api.vapeur.ai/v1';
const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_GEMINI_FAST_MODEL = 'gemini-3.5-flash';
const DEFAULT_GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';
const IMAGE_MIME_PATTERN = /^image\/(jpeg|jpg|png|webp)$/;
const ANALYSIS_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', 'ts', 'mts', 'm2ts', '3gp', 'hevc', 'h265']);
const VIDEO_EXTENSION_BY_MIME = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
  'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi', 'video/avi': 'avi', 'video/mpeg': 'mpeg',
  'video/mp2t': 'ts', 'video/3gpp': '3gp', 'video/hevc': 'hevc', 'video/h265': 'h265',
};
const MAX_ANALYSIS_VIDEO_BYTES = 80 * 1024 * 1024;

const cleanBase64 = (value) => String(value || '').replace(/^data:[^;]+;base64,/i, '');

export function resolveAnalysisVideoInput(video = {}) {
  const mimeType = String(video?.mimeType || '').toLowerCase().split(';')[0].trim();
  const nameExtension = path.extname(String(video?.name || '')).slice(1).toLowerCase();
  const extension = ANALYSIS_VIDEO_EXTENSIONS.has(nameExtension) ? nameExtension : VIDEO_EXTENSION_BY_MIME[mimeType];
  if (!extension) throw Object.assign(new Error('视频分析支持 MP4、MOV、M4V、WebM、MKV、AVI、MPEG、TS、3GP 与 HEVC/H.265'), { status: 400 });
  return { extension, mimeType: mimeType || 'application/octet-stream' };
}

export function shouldNormalizeAnalysisVideo(metadata = {}, extension = '') {
  const codec = String(metadata?.codecName || '').toLowerCase();
  return ['hevc', 'h265', 'av1', 'vp9'].includes(codec) || ['hevc', 'h265'].includes(String(extension || '').toLowerCase());
}

export function resolveMediaAnalysisModel(alias = '') {
  const modelAlias = String(alias || 'vapeur-gemini-3.5-flash');
  if (modelAlias === 'vapeur-gemini-3.5-flash') return { model: String(process.env.VAPEUR_GEMINI_FAST_MODEL || DEFAULT_GEMINI_FAST_MODEL), provider: 'Gemini' };
  if (modelAlias === 'vapeur-gemini-3.1-pro') return { model: String(process.env.VAPEUR_GEMINI_PRO_MODEL || DEFAULT_GEMINI_PRO_MODEL), provider: 'Gemini' };
  if (modelAlias === 'vapeur-gpt-5.5-precise' || modelAlias === 'vapeur-gpt-5.5') return { model: String(process.env.VAPEUR_TEXT_MODEL || DEFAULT_MODEL), provider: 'GPT' };
  return { model: String(process.env.VAPEUR_GEMINI_FAST_MODEL || DEFAULT_GEMINI_FAST_MODEL), provider: 'Gemini' };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => reject(Object.assign(new Error(`视频关键帧提取失败：${error.message}`), { status: 500 })));
    child.on('close', (code) => code === 0 ? resolve() : reject(Object.assign(new Error(`视频关键帧提取失败${stderr ? `：${stderr.trim().split('\n').slice(-1)[0]}` : ''}`), { status: 400 })));
  });
}

function probeVideoDuration(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', () => resolve(0));
    child.on('close', (code) => {
      const duration = Number.parseFloat(stdout.trim());
      resolve(code === 0 && Number.isFinite(duration) && duration > 0 ? duration : 0);
    });
  });
}

function probeVideoMetadata(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration,format_name', '-of', 'json', inputPath], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', () => resolve({ duration: 0, codecName: '', formatName: '' }));
    child.on('close', (code) => {
      try {
        const payload = code === 0 ? JSON.parse(stdout || '{}') : {};
        const stream = payload?.streams?.[0] || {};
        const duration = Number.parseFloat(payload?.format?.duration || 0);
        resolve({ duration: Number.isFinite(duration) && duration > 0 ? duration : 0, codecName: String(stream.codec_name || ''), formatName: String(payload?.format?.format_name || ''), width: Number(stream.width || 0), height: Number(stream.height || 0) });
      } catch { resolve({ duration: 0, codecName: '', formatName: '' }); }
    });
  });
}

export function buildUniformFrameFilter(duration, frameLimit) {
  const safeFrames = Math.max(1, Math.min(18, Number(frameLimit) || 18));
  const safeDuration = Number(duration);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return 'fps=1/3,scale=1280:-2:force_original_aspect_ratio=decrease';
  const framesPerSecond = Math.min(4, safeFrames / Math.max(1, safeDuration));
  return `fps=${framesPerSecond.toFixed(6)},scale=1280:-2:force_original_aspect_ratio=decrease`;
}

async function extractVideoFrames(video, frameLimit = 18) {
  const { extension } = resolveAnalysisVideoInput(video);
  const data = cleanBase64(video?.data);
  if (!data) throw Object.assign(new Error('视频分析节点收到空视频'), { status: 400 });
  const inputBuffer = Buffer.from(data, 'base64');
  if (inputBuffer.length > MAX_ANALYSIS_VIDEO_BYTES) throw Object.assign(new Error('单段分析视频不能超过 80MB'), { status: 400 });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-analyze-'));
  try {
    const inputPath = path.join(directory, `input.${extension}`);
    await fs.writeFile(inputPath, inputBuffer);
    const metadata = await probeVideoMetadata(inputPath);
    let analysisPath = inputPath;
    let normalized = false;
    if (shouldNormalizeAnalysisVideo(metadata, extension)) {
      const normalizedPath = path.join(directory, 'normalized-h264.mp4');
      try {
        await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-map', '0:v:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', normalizedPath]);
        analysisPath = normalizedPath;
        normalized = true;
      } catch {
        // Frame extraction can still decode many HEVC/AV1 files directly, so retain a safe fallback.
      }
    }
    const duration = metadata.duration || await probeVideoDuration(analysisPath);
    const useStoryboard = frameLimit >= 12;
    const videoFilter = useStoryboard
      ? `${buildUniformFrameFilter(duration, frameLimit)},scale=400:400:force_original_aspect_ratio=decrease,pad=400:400:(ow-iw)/2:(oh-ih)/2:color=black,tile=3x2:padding=4:margin=4`
      : buildUniformFrameFilter(duration, frameLimit);
    const outputLimit = useStoryboard ? Math.ceil(frameLimit / 6) : frameLimit;
    const outputPrefix = useStoryboard ? 'storyboard' : 'frame';
    await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-i', analysisPath, '-vf', videoFilter, '-frames:v', String(outputLimit), '-q:v', '3', path.join(directory, `${outputPrefix}-%02d.jpg`)]);
    const names = (await fs.readdir(directory)).filter((name) => new RegExp(`^${outputPrefix}-\\d+\\.jpg$`).test(name)).sort().slice(0, outputLimit);
    if (!names.length) throw Object.assign(new Error('没有从视频中提取到可分析画面'), { status: 400 });
    const uniformTimes = Array.from({ length: frameLimit }, (_, index) => duration > 0 ? Number(Math.min(duration, index * duration / frameLimit).toFixed(2)) : null);
    const frames = await Promise.all(names.map(async (name, index) => ({
      mimeType: 'image/jpeg',
      data: (await fs.readFile(path.join(directory, name))).toString('base64'),
      name: useStoryboard ? `${video?.name || '视频'} · 时间分镜表 ${index + 1}` : `${video?.name || '视频'} · 关键帧 ${index + 1}`,
      source: useStoryboard ? 'video-storyboard' : 'video-frame',
      sampledFrames: useStoryboard ? Math.min(6, frameLimit - index * 6) : 1,
      sampleTimes: useStoryboard ? uniformTimes.slice(index * 6, index * 6 + 6) : uniformTimes.slice(index, index + 1),
      videoDuration: duration,
      sourceCodec: metadata.codecName || 'unknown',
      normalized,
    })));
    if (duration > 0) {
      const endFramePath = path.join(directory, 'video-end-frame.jpg');
      try {
        await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-sseof', '-0.5', '-i', analysisPath, '-an', '-vf', 'reverse', '-frames:v', '1', '-q:v', '2', endFramePath]);
        await fs.access(endFramePath);
        frames.push({
          mimeType: 'image/jpeg',
          data: (await fs.readFile(endFramePath)).toString('base64'),
          name: `${video?.name || '视频'} · 最后一帧`,
          source: 'video-end-frame',
          sampledFrames: 0,
          sampleTimes: [Number(duration.toFixed(2))],
          videoDuration: duration,
          sourceCodec: metadata.codecName || 'unknown',
          normalized,
        });
      } catch {
        // Exact end-frame extraction is an enhancement; keep the uniformly sampled timeline usable if a damaged tail cannot be decoded.
      }
    }
    return frames;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export function buildMediaAnalysisMessages({ instruction = '', media = [], targetType = 'video' }) {
  const targetLabel = targetType === 'image' ? '图片生成' : targetType === 'general' ? '通用生成' : '视频生成';
  const durationLines = [...new Map(media.filter((item) => item.videoDuration > 0).map((item) => [String(item.name || '').split(' · ')[0], Number(item.videoDuration)])).entries()].map(([name, duration]) => `${name}：真实媒体总时长 ${duration.toFixed(2)} 秒，抽帧覆盖 0.00—${duration.toFixed(2)} 秒，并单独提供精确结尾帧。`);
  const userContent = [{
    type: 'text',
    text: [
      `任务：分析按顺序提供的图片或视频关键帧，输出一段可直接用于${targetLabel}模型的中文提示词。`,
      '必须忠实描述可见内容，不得虚构无法从素材确认的品牌、材质、文字、人物身份或商品卖点。',
      targetType === 'image'
        ? '重点描述主体、人物或商品一致性、服装、构图、场景、光线、材质、色彩、镜头视角和需要保持的细节。'
        : '重点描述主体与身份一致性、服装和商品细节、场景、动作时间线、镜头运动、景别、光线、材质、色彩与需要保持的细节；若来自视频关键帧，概括画面变化，不要声称识别到未提供的声音。',
      durationLines.length ? `权威媒体元数据（必须直接采用，严禁根据画面数量猜测时长）：\n${durationLines.join('\n')}` : '',
      `用户补充规则：${String(instruction || '完整分析素材并生成专业提示词').trim()}`,
      '只输出最终提示词，不要标题、分析过程、项目符号、Markdown 或引号。',
    ].join('\n'),
  }];
  media.forEach((item, index) => {
    const timeLabel = item.sampleTimes?.length ? item.sampleTimes.map((time) => `${Number(time).toFixed(2)}秒`).join('、') : '';
    userContent.push({ type: 'text', text: `素材 ${index + 1}${item.name ? `：${item.name}` : ''}${item.source === 'video-frame' ? `（视频关键帧，准确时间点：${timeLabel}）` : item.source === 'video-storyboard' ? `（包含 ${item.sampledFrames || 6} 个均匀时间点，按左到右、上到下依次为：${timeLabel}）` : item.source === 'video-end-frame' ? `（视频精确结尾帧，时间点：${timeLabel}；必须据此分析到视频真实结束）` : ''}` });
    userContent.push({ type: 'image_url', image_url: { url: `data:${item.mimeType};base64,${item.data}`, detail: 'high' } });
  });
  return [
    { role: 'system', content: '你是专业的多模态视觉导演与提示词工程师。你需要看懂输入画面，并输出可直接交给下游生成模型的准确提示词。用户消息提供的媒体总时长和时间点来自 ffprobe/ffmpeg，是权威数据；不得根据画面数量、台词或动作自行猜测另一时长。' },
    { role: 'user', content: userContent },
  ];
}

export async function analyzeWorkflowMedia(input, fetchImpl = fetch) {
  if (input?.signal?.aborted)
    throw input.signal.reason || new Error('视频分析已取消');
  if (!String(process.env.VAPEUR_API_KEY || '').trim()) throw Object.assign(new Error('多模态分析接口尚未配置'), { status: 503 });
  const images = (Array.isArray(input?.images) ? input.images : []).slice(0, 9).map((image, index) => ({
    data: cleanBase64(image?.data, 'image'),
    mimeType: String(image?.mimeType || 'image/png').toLowerCase(),
    name: String(image?.name || `图片 ${index + 1}`),
    source: 'image',
  }));
  if (images.some((image) => !image.data || !IMAGE_MIME_PATTERN.test(image.mimeType))) throw Object.assign(new Error('图片分析仅支持 JPG、PNG 或 WebP'), { status: 400 });
  const videos = (Array.isArray(input?.videos) ? input.videos : []).slice(0, 3);
  if (!images.length && !videos.length) throw Object.assign(new Error('图片/视频分析节点没有收到媒体素材'), { status: 400 });
  const requestedFrameLimit = Math.max(6, Math.min(18, Number(input?.frameLimit) || 18));
  const frameBudget = Math.max(1, Math.floor((24 - images.length) / Math.max(1, videos.length)));
  const videoFrames = (await Promise.all(videos.map((video) => extractVideoFrames(video, Math.min(requestedFrameLimit, frameBudget))))).flat();
  const exactEndFrames = videoFrames.filter((item) => item.source === 'video-end-frame');
  const sampledVideoFrames = videoFrames.filter((item) => item.source !== 'video-end-frame');
  const media = [...images, ...sampledVideoFrames.slice(0, Math.max(0, 24 - images.length - exactEndFrames.length)), ...exactEndFrames].slice(0, 24);
  const selected = resolveMediaAnalysisModel(input?.model);
  const baseUrl = String(process.env.VAPEUR_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const candidates = [selected];
  // Respect the user's explicit model choice. Dense 18-frame storyboards can
  // take longer than 90 seconds, so wait for the selected model instead of
  // silently switching providers or model tiers.
  let lastError;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const requestBody = {
      model: candidate.model,
      messages: buildMediaAnalysisMessages({ instruction: input?.instruction, media, targetType: input?.targetType }),
      max_completion_tokens: Math.max(500, Math.min(3000, Number(input?.maxTokens) || 1800)),
      stream: false,
    };
    if (candidate.provider === 'GPT') requestBody.reasoning_effort = String(input?.reasoningEffort || 'low');
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VAPEUR_API_KEY}` },
        body: JSON.stringify(requestBody),
        signal: input?.signal
          ? AbortSignal.any([input.signal, AbortSignal.timeout(180_000)])
          : AbortSignal.timeout(180_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error?.message || payload?.message || `${candidate.provider} 多模态分析失败（HTTP ${response.status}）`);
        error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
        throw error;
      }
      const content = String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!content) throw Object.assign(new Error(`${candidate.provider} 多模态分析没有返回提示词`), { status: 502 });
      return { content, model: payload.model || candidate.model, mediaCount: media.length, imageCount: images.length, videoCount: videos.length, frameCount: videoFrames.reduce((sum, item) => sum + (item.source === 'video-end-frame' ? 0 : Number(item.sampledFrames || 1)), 0), storyboardCount: videoFrames.filter((item) => item.source === 'video-storyboard').length, videoDurationSeconds: [...new Set(videoFrames.map((item) => Number(item.videoDuration || 0)).filter(Boolean))], exactEndFrameCount: videoFrames.filter((item) => item.source === 'video-end-frame').length, videoCodecs: [...new Set(videoFrames.map((item) => item.sourceCodec).filter(Boolean))], normalizedVideoCount: new Set(videoFrames.filter((item) => item.normalized).map((item) => item.name.split(' · ')[0])).size, fallbackFrom: index > 0 ? selected.model : null, usage: payload.usage || null };
    } catch (error) {
      if (input?.signal?.aborted) throw input.signal.reason || error;
      lastError = error;
      if (Number(error?.status || 502) < 500 || index === candidates.length - 1) break;
    }
  }
  const finalError = new Error(lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError' ? '所选视频分析模型等待超过 180 秒，请稍后重试' : lastError?.message || '视频分析失败');
  finalError.status = Number(lastError?.status || 502) >= 400 && Number(lastError?.status || 502) < 500 ? Number(lastError.status) : 502;
  throw finalError;
}

export const __test = { extractVideoFrames };

