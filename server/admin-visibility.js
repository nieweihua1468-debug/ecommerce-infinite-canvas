const DASHBOARD_TIME_ZONE = "Asia/Shanghai";

export function normalizeLegacyAccountType(user = {}) {
  const { adminHidden: _adminHidden, ...normalized } = user;
  return {
    ...normalized,
    accountType: user.accountType === "admin" ? "admin" : "creator",
    templateAccess:
      user.accountType === "admin" ||
      user.templateAccess === true ||
      user.inspirationAccess === true,
  };
}

export function isPlatformAdmin(user) {
  return user?.accountType === "admin";
}

export function hasTemplateAccess(user) {
  return (
    isPlatformAdmin(user) ||
    user?.templateAccess === true ||
    user?.inspirationAccess === true
  );
}

// Keep the old export while deployed clients finish migrating to templateAccess.
export const hasInspirationAccess = hasTemplateAccess;

function dateKey(value, timeZone = DASHBOARD_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function generationKind(task) {
  if (
    task?.outputType === "image" ||
    task?.taskType === "image-generation" ||
    task?.kind === "image" ||
    task?.imageUrl ||
    (Array.isArray(task?.imageUrls) && task.imageUrls.length)
  ) {
    return "image";
  }
  if (
    task?.outputType === "video" ||
    task?.kind === "video" ||
    task?.videoUrl ||
    String(task?.taskType || "").includes("video")
  ) {
    return "video";
  }
  return "";
}

export function todayGenerationStats(
  tasks = [],
  now = new Date(),
  timeZone = DASHBOARD_TIME_ZONE,
) {
  const today = dateKey(now, timeZone);
  const stats = { total: 0, images: 0, videos: 0, date: today };
  for (const task of tasks) {
    if (dateKey(task?.createdAt, timeZone) !== today) continue;
    const kind = generationKind(task);
    if (!kind) continue;
    stats.total += 1;
    stats[kind === "image" ? "images" : "videos"] += 1;
  }
  return stats;
}

const FAILURE_LABELS = {
  authorization: "密钥或权限",
  missing_resource: "资源失效",
  network: "网络连接",
  policy: "内容审核",
  provider_unavailable: "模型服务",
  quota: "额度不足",
  rate_limit: "请求限流",
  storage: "结果存储",
  timeout: "接口超时",
  validation: "素材或参数",
  unknown: "未分类",
};

function legacyFailureCategory(error = "") {
  const message = String(error);
  if (/限流|频繁/.test(message)) return "rate_limit";
  if (/超时/.test(message)) return "timeout";
  if (/网络|连接/.test(message)) return "network";
  if (/审核|安全|真人|版权/.test(message)) return "policy";
  if (/参数|素材|像素|时长|格式/.test(message)) return "validation";
  if (/密钥|权限/.test(message)) return "authorization";
  if (/存储/.test(message)) return "storage";
  if (/服务.*不可用/.test(message)) return "provider_unavailable";
  return "unknown";
}

export function recentFailureStats(tasks = [], now = new Date()) {
  const cutoff = new Date(now).getTime() - 24 * 60 * 60 * 1000;
  const counts = new Map();
  for (const task of tasks) {
    if (
      task?.status !== "failed" ||
      new Date(task.createdAt).getTime() < cutoff
    )
      continue;
    const category =
      task.failure?.category || legacyFailureCategory(task.error);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: FAILURE_LABELS[category] || FAILURE_LABELS.unknown,
      count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.category.localeCompare(right.category),
    );
  return {
    total: categories.reduce((sum, item) => sum + item.count, 0),
    categories,
  };
}

export { DASHBOARD_TIME_ZONE };

