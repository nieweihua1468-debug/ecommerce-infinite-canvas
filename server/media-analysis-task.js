import { createHash } from "node:crypto";

export const MEDIA_ANALYSIS_ACTIVE_STATUSES = new Set(["queued", "processing"]);

const mediaDigest = (media = {}) =>
  createHash("sha256")
    .update(String(media.mimeType || ""))
    .update("\0")
    .update(String(media.name || ""))
    .update("\0")
    .update(String(media.data || ""))
    .digest("hex");

export function mediaAnalysisInputFingerprint(input = {}) {
  const payload = {
    model: String(input.model || ""),
    targetType: String(input.targetType || "video"),
    instruction: String(input.instruction || ""),
    frameLimit: Number(input.frameLimit) || 18,
    images: (Array.isArray(input.images) ? input.images : []).map(mediaDigest),
    videos: (Array.isArray(input.videos) ? input.videos : []).map(mediaDigest),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function createMediaAnalysisTaskRecord({
  id,
  ownerId,
  input,
  now = new Date().toISOString(),
}) {
  const videos = Array.isArray(input?.videos) ? input.videos : [];
  return {
    id,
    ownerId,
    status: "queued",
    model: String(input?.model || ""),
    targetType: String(input?.targetType || "video"),
    fileName: String(videos[0]?.name || "待分析视频"),
    frameLimit: Number(input?.frameLimit) || 18,
    idempotencyKey: String(input?.idempotencyKey || "").slice(0, 160),
    inputFingerprint: String(
      input?.inputFingerprint || mediaAnalysisInputFingerprint(input),
    ).slice(0, 160),
    serverInputFingerprint: mediaAnalysisInputFingerprint(input),
    content: "",
    error: "",
    videoDurationSeconds: [],
    frameCount: 0,
    exactEndFrameCount: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
}

export function patchMediaAnalysisTask(
  task,
  patch,
  now = new Date().toISOString(),
) {
  return { ...task, ...patch, updatedAt: now };
}

export function publicMediaAnalysisTask(task) {
  if (!task) return null;
  const { ownerId: _ownerId, ...safe } = task;
  return safe;
}

export function failInterruptedMediaAnalysisTask(
  task,
  now = new Date().toISOString(),
) {
  if (!MEDIA_ANALYSIS_ACTIVE_STATUSES.has(task?.status)) return task;
  return {
    ...task,
    status: "failed",
    error: "服务重启导致视频分析中断，请重新提交。",
    completedAt: now,
    updatedAt: now,
  };
}

