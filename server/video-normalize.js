import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { probeMediaDuration } from './audio-normalize.js';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_DURATION = 15;
const DEFAULT_SAFE_BYTES = 18 * 1024 * 1024;

export function seedanceVideoTargetBitrate({ duration, maxBytes = DEFAULT_SAFE_BYTES }) {
  const seconds = Math.max(1, Number(duration) || DEFAULT_MAX_DURATION);
  const totalKbps = Math.floor((maxBytes * 8) / seconds / 1000);
  return Math.max(700, Math.min(6000, totalKbps - 128));
}

export async function normalizeSeedanceVideo({ inputPath, outputPath, mimeType = 'video/mp4', maxDuration = DEFAULT_MAX_DURATION, maxBytes = DEFAULT_SAFE_BYTES, forceTranscode = false, maxLongEdge = 1920 }) {
  const source = await fs.stat(inputPath);
  const originalDuration = await probeMediaDuration(inputPath);
  const durationLimit = Math.min(DEFAULT_MAX_DURATION, Math.max(1, Number(maxDuration) || DEFAULT_MAX_DURATION));
  const trimmed = originalDuration > durationLimit + 0.02;
  const compressed = source.size > maxBytes;
  const transcoded = forceTranscode || trimmed || compressed || String(mimeType).toLowerCase() !== 'video/mp4';
  if (!transcoded) {
    return { filePath: inputPath, duration: originalDuration, originalDuration, originalBytes: source.size, bytes: source.size, trimmed: false, compressed: false, transcoded: false };
  }

  const outputDuration = Math.min(originalDuration, durationLimit);
  const bitrate = seedanceVideoTargetBitrate({ duration: outputDuration, maxBytes });
  try {
    await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-t', outputDuration.toFixed(3),
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', `fps=30,scale='if(gt(iw,ih),min(${Math.max(320, Number(maxLongEdge) || 1920)},iw),-2)':'if(gt(iw,ih),-2,min(${Math.max(320, Number(maxLongEdge) || 1920)},ih))':flags=lanczos,format=yuv420p`,
      '-codec:v', 'libx264', '-preset', 'medium',
      '-b:v', `${bitrate}k`, '-maxrate', `${Math.floor(bitrate * 1.15)}k`, '-bufsize', `${bitrate * 2}k`,
      '-codec:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-movflags', '+faststart', '-map_metadata', '-1',
      outputPath,
    ], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw Object.assign(new Error('参考视频自动优化失败，请换用 MP4、MOV 或 WebM 后重试'), { status: 400, cause: error });
  }
  const output = await fs.stat(outputPath);
  const duration = await probeMediaDuration(outputPath);
  if (duration > durationLimit + 0.08) throw new Error(`参考视频裁剪后仍超过 ${durationLimit} 秒`);
  if (output.size > 20 * 1024 * 1024) throw new Error('参考视频自动压缩后仍超过 20MB，请换用更短的视频');
  return {
    filePath: outputPath,
    duration,
    originalDuration,
    originalBytes: source.size,
    bytes: output.size,
    trimmed,
    compressed: compressed || output.size < source.size,
    transcoded: true,
  };
}

