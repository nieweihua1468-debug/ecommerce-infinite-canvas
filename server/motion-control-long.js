import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readExternalMedia } from './safe-external-media.js';

const execFileAsync = promisify(execFile);

export function planMotionSegments(durationSeconds, maximumSegmentSeconds = 5) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration < 3 || duration > 30) throw Object.assign(new Error('动作参考视频时长必须在 3–30 秒之间'), { status: 400 });
  const count = Math.max(1, Math.ceil(duration / maximumSegmentSeconds));
  const segmentDuration = count === 1 ? duration : Math.max(3, duration / count);
  const step = count === 1 ? 0 : (duration - segmentDuration) / (count - 1);
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    start: Number((index * step).toFixed(3)),
    duration: Number(segmentDuration.toFixed(3)),
  }));
}

export async function probeMediaDuration(filePath, exec = execFileAsync) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
  const duration = Number(String(stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取动作参考视频真实时长');
  return duration;
}

export async function splitMotionReference({ inputPath, generatedDir, publicBaseUrl, taskId, durationSeconds, exec = execFileAsync }) {
  const plan = planMotionSegments(durationSeconds);
  if (plan.length === 1) return [{ ...plan[0], path: inputPath, url: `${String(publicBaseUrl).replace(/\/$/, '')}/generated/${path.basename(inputPath)}` }];
  const results = [];
  for (const segment of plan) {
    const fileName = `motion-${taskId}-source-${segment.index}.mp4`;
    const outputPath = path.join(generatedDir, fileName);
    await exec('ffmpeg', ['-y', '-ss', String(segment.start), '-i', inputPath, '-t', String(segment.duration), '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outputPath]);
    results.push({ ...segment, path: outputPath, url: `${String(publicBaseUrl).replace(/\/$/, '')}/generated/${fileName}` });
  }
  return results;
}

const fetchRequestAdapter = (fetchImpl) => async ({ url, signal }) => {
  const response = await fetchImpl(url.href, { signal, redirect: 'manual' });
  const body = response.body?.[Symbol.asyncIterator]
    ? response.body
    : {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(await response.arrayBuffer());
        },
      };
  return { status: response.status, headers: response.headers, body };
};

async function downloadVideo(url, outputPath, { publicBaseUrl, fetchImpl, externalMediaOptions } = {}) {
  const result = await readExternalMedia(url, {
    publicBaseUrl,
    timeoutMs: 30_000,
    maxBytes: 96 * 1024 * 1024,
    ...(externalMediaOptions || {}),
    ...(fetchImpl ? { requestImpl: fetchRequestAdapter(fetchImpl) } : {}),
  });
  if (
    result.contentType &&
    !result.contentType.startsWith('video/') &&
    result.contentType !== 'application/octet-stream'
  )
    throw Object.assign(new Error('动作分段结果不是可用视频'), {
      status: 502,
      code: 'EXTERNAL_MEDIA_TYPE_REJECTED',
    });
  await fs.writeFile(outputPath, result.buffer);
}

async function mediaHasAudio(filePath, exec = execFileAsync) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', filePath]);
  return Boolean(String(stdout || '').trim());
}

export async function stitchMotionResults({ videoUrls, generatedDir, publicBaseUrl, taskId, expectedDuration, keepOriginalSound = true, fetchImpl, externalMediaOptions, exec = execFileAsync }) {
  if (!Array.isArray(videoUrls) || !videoUrls.length) throw new Error('动作控制没有可拼接的视频结果');
  await fs.mkdir(generatedDir, { recursive: true });
  const parts = [];
  for (let index = 0; index < videoUrls.length; index += 1) {
    const partPath = path.join(generatedDir, `motion-${taskId}-result-${index + 1}.mp4`);
    await downloadVideo(videoUrls[index], partPath, {
      publicBaseUrl,
      fetchImpl,
      externalMediaOptions,
    });
    parts.push(partPath);
  }
  const concatList = path.join(generatedDir, `motion-${taskId}-concat.txt`);
  const rawPath = path.join(generatedDir, `motion-${taskId}-raw.mp4`);
  const finalName = `motion-${taskId}-final.mp4`;
  const finalPath = path.join(generatedDir, finalName);
  await fs.writeFile(concatList, parts.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
  await exec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', '-movflags', '+faststart', rawPath]);
  const rawDuration = await probeMediaDuration(rawPath, exec);
  const targetDuration = Math.max(3, Math.min(30, Number(expectedDuration) || rawDuration));
  const speed = rawDuration / targetDuration;
  const hasAudio = keepOriginalSound && await mediaHasAudio(rawPath, exec);
  const args = ['-y', '-i', rawPath, '-filter:v', `setpts=${(targetDuration / rawDuration).toFixed(8)}*PTS,fps=30`];
  if (hasAudio) args.push('-filter:a', `atempo=${Math.max(0.5, Math.min(2, speed)).toFixed(8)}`, '-c:a', 'aac', '-b:a', '160k');
  else args.push('-an');
  args.push('-t', targetDuration.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalPath);
  await exec('ffmpeg', args);
  await Promise.allSettled([concatList, rawPath, ...parts].map((file) => fs.unlink(file)));
  return {
    path: finalPath,
    url: `${String(publicBaseUrl).replace(/\/$/, '')}/generated/${finalName}`,
    duration: await probeMediaDuration(finalPath, exec),
    sourceDuration: rawDuration,
    segmentCount: videoUrls.length,
  };
}

