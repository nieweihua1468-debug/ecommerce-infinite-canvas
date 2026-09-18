const MB = 1024 * 1024;

const DEFAULT_LIMITS = {
  standard: { image: 24 * MB, video: 20 * MB, audio: 15 * MB },
  seedance: { image: 48 * MB, video: 60 * MB, audio: 30 * MB },
};
const TRUSTED_HOT_RANK_VIDEO_LIMIT = 60 * MB;

const decodedBytes = (value) => {
  const payload = String(value || "").replace(/\s+/g, "");
  if (!payload) return 0;
  return Math.max(
    0,
    Math.floor((payload.length * 3) / 4) -
      (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0),
  );
};

const sizeLabel = (bytes) => `${Math.round(bytes / MB)}MB`;

export function assertWorkflowProjectAssetFiles(
  runtimeAssets = {},
  { seedanceOnly = false, limits: customLimits } = {},
) {
  const limits = customLimits ||
    (seedanceOnly ? DEFAULT_LIMITS.seedance : DEFAULT_LIMITS.standard);
  for (const assets of Object.values(runtimeAssets || {})) {
    for (const asset of Array.isArray(assets) ? assets : []) {
      const kind = ["image", "video", "audio"].includes(asset?.type)
        ? asset.type
        : String(asset?.mimeType || "").split("/")[0];
      const maxBytes =
        asset?.source === "hot-rank" && kind === "video"
          ? Math.max(Number(limits[kind] || 0), TRUSTED_HOT_RANK_VIDEO_LIMIT)
          : limits[kind];
      const bytes = Number(asset?.size || 0) || decodedBytes(asset?.data);
      if (!maxBytes || bytes <= maxBytes) continue;
      const label = kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
      throw Object.assign(
        new Error(
          `${label}${asset?.name ? ` ${asset.name}` : ""}超过 API 限制，请压缩到 ${sizeLabel(maxBytes)} 以内后再上传。`,
        ),
        { status: 413 },
      );
    }
  }
}

export { DEFAULT_LIMITS };

