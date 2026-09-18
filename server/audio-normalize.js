import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function seedanceAudioMaxDuration(videoDuration) {
  const parsed = Number(videoDuration);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;
  return Math.min(15, parsed);
}

export function isVideoAudioSource(mimeType) {
  return /^video\/(mp4|quicktime|webm|x-m4v)$/i.test(String(mimeType || ''));
}

export function parseFfmpegDuration(value) {
  const match = String(value || '').match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function probeMediaDuration(filePath) {
  let duration = 0;
  try {
    const { stdout } = await execFileAsync(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    duration = Number(String(stdout || '').trim());
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    try {
      await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-i', filePath], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    } catch (probeError) {
      duration = parseFfmpegDuration(probeError?.stderr);
    }
  }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取参考音频时长');
  return duration;
}

export async function normalizeSeedanceAudio({ inputPath, outputPath, videoDuration, forceTranscode = false }) {
  const maxDuration = seedanceAudioMaxDuration(videoDuration);
  const originalDuration = await probeMediaDuration(inputPath);
  const trimmed = originalDuration > maxDuration + 0.02;
  if (!trimmed && !forceTranscode) {
    return { filePath: inputPath, duration: originalDuration, originalDuration, maxDuration, trimmed: false, transcoded: false };
  }

  try {
    await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-t', maxDuration.toFixed(3),
      '-map', '0:a:0',
      '-vn',
      '-map_metadata', '-1',
      '-ac', '1',
      '-ar', '44100',
      '-codec:a', 'libmp3lame',
      '-b:a', '128k',
      outputPath,
    ], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || '');
    if (/matches no streams|does not contain any stream|stream map/i.test(detail)) {
      throw Object.assign(new Error('上传的视频中没有检测到可用音轨，请选择带声音的视频'), { status: 400 });
    }
    throw Object.assign(new Error('参考声音处理失败，请换用 MP3、WAV、MP4、MOV 或 WebM 后重试'), { status: 400, cause: error });
  }

  const duration = await probeMediaDuration(outputPath);
  if (duration > maxDuration + 0.08) throw new Error(`参考音频裁剪后仍超过 ${maxDuration} 秒`);
  return { filePath: outputPath, duration, originalDuration, maxDuration, trimmed, transcoded: true };
}

