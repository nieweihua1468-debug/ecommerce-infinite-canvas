export const HOT_RANK_SCHEMA_VERSION = 1;

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const listValue = (value) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Imported spreadsheets can contain a plain comma-separated fallback.
  }
  return text
    .split(/[|,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

export function normalizeHotRankItem(raw = {}, index = 0) {
  const weekKey = String(raw.week_key || raw.weekKey || "").trim();
  const videoId = String(raw.video_id || raw.videoId || "").trim();
  const rank = Math.max(
    1,
    Math.round(numberValue(raw.source_rank ?? raw.rank, index + 1)),
  );
  const likes = numberValue(raw.like_increment ?? raw.likeIncrement);
  const comments = numberValue(raw.comment_count ?? raw.commentCount);
  const shares = numberValue(raw.share_count ?? raw.shareCount);
  const importedScore = Number(raw.hot_score ?? raw.hotScore);
  const calculatedScore = Math.round(
    Math.log10(Math.max(1, likes + comments * 2 + shares * 3)) * 10 +
      Math.max(0, 20 - rank),
  );
  return {
    id: String(raw.id || `${weekKey || "hot-rank"}:${videoId || rank}`),
    weekKey,
    reportStartDate: String(raw.report_start_date || raw.reportStartDate || ""),
    reportEndDate: String(raw.report_end_date || raw.reportEndDate || ""),
    rank,
    categoryRank: Math.max(
      1,
      Math.round(numberValue(raw.category_rank ?? raw.categoryRank, rank)),
    ),
    platform: String(raw.platform || "douyin"),
    mediaType: String(raw.media_type || raw.mediaType || "video"),
    videoId,
    videoUrl: String(raw.video_url || raw.videoUrl || ""),
    videoTitle: String(raw.video_title || raw.videoTitle || "未命名视频"),
    durationSec: numberValue(raw.duration_sec ?? raw.durationSec),
    resolution: String(raw.resolution || raw.video_resolution || ""),
    creatorName: String(raw.creator_name || raw.creatorName || "未知创作者"),
    productTitle: String(raw.product_title || raw.productTitle || "未命名商品"),
    primaryCategory: String(raw.primary_category || raw.primaryCategory || "待复核"),
    secondaryCategory: String(raw.secondary_category || raw.secondaryCategory || "待复核"),
    contentType: String(raw.content_type || raw.contentType || "未分类"),
    styleTags: listValue(raw.style_tags ?? raw.styleTags),
    featureTags: listValue(raw.feature_tags ?? raw.featureTags),
    localFileName: String(raw.local_file_name || raw.localFileName || ""),
    downloadStatus: String(raw.download_status || raw.downloadStatus || "pending"),
    hotScore:
      Number.isFinite(importedScore) && importedScore > 0
        ? importedScore
        : calculatedScore,
    replicateReady: Boolean(
      raw.local_file_name || raw.localFileName || raw.video_url || raw.videoUrl,
    ),
  };
}

export function normalizeHotRankManifest(payload = {}) {
  const rows = Array.isArray(payload) ? payload : payload.items;
  const items = (Array.isArray(rows) ? rows : []).map(normalizeHotRankItem);
  return {
    schemaVersion: Number(payload.schemaVersion || HOT_RANK_SCHEMA_VERSION),
    weekKey: String(payload.weekKey || items[0]?.weekKey || ""),
    reportStartDate: String(
      payload.reportStartDate || items[0]?.reportStartDate || "",
    ),
    reportEndDate: String(payload.reportEndDate || items[0]?.reportEndDate || ""),
    source: String(payload.source || "douyin-hot-rank"),
    updatedAt: String(payload.updatedAt || ""),
    total: items.length,
    items,
  };
}

export function filterHotRankItems(items = [], filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("zh-CN");
  const category = String(filters.category || "all");
  const contentType = String(filters.contentType || "all");
  const availableOnly = filters.availableOnly === true;
  return items.filter((item) => {
    if (category !== "all" && item.primaryCategory !== category) return false;
    if (contentType !== "all" && item.contentType !== contentType) return false;
    if (availableOnly && !item.replicateReady) return false;
    if (!query) return true;
    return [
      item.videoTitle,
      item.productTitle,
      item.creatorName,
      item.primaryCategory,
      item.secondaryCategory,
      ...item.styleTags,
      ...item.featureTags,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(query);
  });
}

export function sortHotRankItems(items = [], mode = "ai") {
  return [...items].sort((left, right) => {
    if (mode === "standard")
      return left.rank - right.rank || right.hotScore - left.hotScore;
    return right.hotScore - left.hotScore || left.rank - right.rank;
  });
}

export function summarizeHotRank(items = []) {
  const unique = (selector) =>
    new Set(items.map(selector).filter(Boolean)).size;
  return {
    total: items.length,
    categoryCount: unique((item) => item.primaryCategory),
    creatorCount: unique((item) => item.creatorName),
    localVideoCount: items.filter((item) => item.localFileName).length,
  };
}

