import {
  normalizeTemplateManifest,
  templateVersionRef,
} from "../shared/template-manifest.js";

const IMAGE_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const cleanText = (value, limit) => String(value || "").trim().slice(0, limit);

const INSPIRATION_KINDS = new Set([
  "outfit",
  "image",
  "video",
  "qianchuan",
]);
const INSPIRATION_KIND_LABELS = {
  outfit: "搭配图",
  image: "详情页",
  video: "视频模版",
  qianchuan: "素材同款",
};

export function materialTemplatePublicationPatch(
  input = {},
  { coverUrl = "", now = new Date().toISOString(), userId = "" } = {},
) {
  return {
    name: cleanText(input.title, 80) || "素材同款模版",
    description: cleanText(input.description, 500),
    category: "素材模版",
    workflowType: "oral-material",
    experience: "qianchuan-speaking",
    visibility: "global",
    public: true,
    approvalStatus: "approved",
    requestedAt: null,
    enabled: true,
    ...(coverUrl ? { coverUrl, mainImageUrl: coverUrl } : {}),
    tags: Array.isArray(input.tags) ? input.tags : [],
    publishedAt: now,
    publishedBy: String(userId || ""),
    updatedAt: now,
  };
}

export function normalizeInspirationCaseInput(body = {}) {
  const title = cleanText(body.title, 80);
  const workflowTemplateId = cleanText(body.workflowTemplateId, 120);
  const coverMimeType = cleanText(body.coverMimeType, 80).toLowerCase();
  const coverImage = String(body.coverImage || "").replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  if (!title)
    throw Object.assign(new Error("请输入案例名称"), { status: 400 });
  if (!workflowTemplateId)
    throw Object.assign(new Error("请先保存并绑定工作流"), { status: 400 });
  if (!coverImage)
    throw Object.assign(new Error("请上传案例封面"), { status: 400 });
  if (!IMAGE_MIME_TYPES.has(coverMimeType))
    throw Object.assign(new Error("案例封面仅支持 JPG、PNG 或 WebP"), {
      status: 400,
    });
  const tags = Array.isArray(body.tags)
    ? body.tags
    : String(body.tags || "").split(/[，,\s]+/);
  const requestedKind = cleanText(body.kind, 16);
  if (requestedKind && !INSPIRATION_KINDS.has(requestedKind))
    throw Object.assign(new Error("请选择有效的模版分类"), { status: 400 });
  return {
    title,
    workflowTemplateId,
    coverMimeType,
    coverImage,
    extension: IMAGE_MIME_TYPES.get(coverMimeType),
    kind: requestedKind,
    category:
      INSPIRATION_KIND_LABELS[requestedKind] ||
      cleanText(body.category, 40) ||
      "视频模版",
    description: cleanText(body.description, 500),
    ratio: cleanText(body.ratio, 16) || "9:16",
    tags: [...new Set(tags.map((tag) => cleanText(tag, 24)).filter(Boolean))].slice(
      0,
      12,
    ),
  };
}

export function inspirationWorkflowSnapshot(template) {
  return {
    id: String(template.id || ""),
    name: String(template.name || "案例工作流"),
    description: String(template.description || ""),
    category: String(template.category || "模版"),
    runMode: template.runMode === "frontend" ? "frontend" : "backend",
    revision: Math.max(1, Number(template.revision) || 1),
    versionRef: templateVersionRef(template),
    manifest: normalizeTemplateManifest(template),
    nodes: Array.isArray(template.nodes) ? template.nodes : [],
    edges: Array.isArray(template.edges) ? template.edges : [],
  };
}

export function inspirationWorkflowMediaType(template = {}) {
  const nodes = Array.isArray(template.nodes) ? template.nodes : [];
  const edges = Array.isArray(template.edges) ? template.edges : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  });
  const queue = nodes.filter((node) => indegree.get(node.id) === 0);
  const ordered = [];
  while (queue.length) {
    const node = queue.shift();
    ordered.push(node);
    for (const target of outgoing.get(node.id) || []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(nodeById.get(target));
    }
  }
  const generationNodes = (ordered.length === nodes.length ? ordered : nodes)
    .filter((node) => ["image", "video"].includes(node.data?.kind));
  return generationNodes[generationNodes.length - 1]?.data?.kind === "image"
    ? "image"
    : "video";
}

export function inspirationCaseKind(item = {}) {
  if (INSPIRATION_KINDS.has(item.kind)) return item.kind;
  const haystack = [
    item.title,
    item.category,
    item.workflowName,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].join(" ");
  if (/搭配图|自动搭配|搭配设计|智能搭配/.test(haystack)) return "outfit";
  return item.mediaType === "image" ? "image" : "video";
}

const VIDEO_WORKFLOW_PRESETS = new Set([
  "single-node-outfit-video",
  "main-outfit-video",
  "direct-video",
]);

export function normalizeVideoWorkflowPreset(
  value,
  fallback = "main-outfit-video",
) {
  const normalized = cleanText(value, 40);
  if (VIDEO_WORKFLOW_PRESETS.has(normalized)) return normalized;
  const normalizedFallback = cleanText(fallback, 40);
  return VIDEO_WORKFLOW_PRESETS.has(normalizedFallback)
    ? normalizedFallback
    : "main-outfit-video";
}

export function inspirationThumbnailUrl(item = {}) {
  const explicit = cleanText(item.thumbnailUrl, 500);
  if (explicit) return explicit;
  const coverUrl = cleanText(item.coverUrl || item.mainImageUrl, 500)
    .split(/[?#]/, 1)[0];
  const templatePrefix = "/template-covers/";
  if (coverUrl.startsWith(templatePrefix)) {
    const relativePath = coverUrl.slice(templatePrefix.length);
    const directory = relativePath.split("/", 1)[0];
    if (
      ["outfit-generated", "detail-social", "custom-brand-current"].includes(
        directory,
      ) &&
      relativePath.includes("/") &&
      /\.[a-z0-9]+$/i.test(relativePath)
    ) {
      return `/template-thumbnails/${relativePath.replace(
        /\.[a-z0-9]+$/i,
        ".jpg",
      )}`;
    }
  }
  const prefix = "/inspiration-assets/library/";
  if (!coverUrl.startsWith(prefix)) return "";
  const fileName = coverUrl.slice(prefix.length);
  if (!fileName || fileName.includes("/") || !/\.[a-z0-9]+$/i.test(fileName))
    return "";
  return `/inspiration-assets/thumbnails/${fileName.replace(/\.[a-z0-9]+$/i, ".jpg")}`;
}

export function inspirationListFields(item = {}) {
  const kind = inspirationCaseKind(item);
  const brandStatus = cleanText(item.brandInvocation?.status, 40);
  return {
    id: cleanText(item.id, 160),
    title: cleanText(item.title || item.id, 160),
    kind,
    mediaType: kind === "video" ? "video" : "image",
    category: cleanText(item.category, 80),
    coverUrl: cleanText(item.coverUrl, 500),
    thumbnailUrl: inspirationThumbnailUrl(item),
    mainImageUrl: cleanText(item.mainImageUrl, 500),
    coverFocus: cleanText(item.coverFocus, 80),
    platform: cleanText(item.platform, 80),
    imageType: cleanText(item.imageType, 80),
    style: cleanText(item.style, 80),
    ratio: cleanText(item.ratio || item.aspectRatio, 20),
    defaultProductIncluded: Boolean(item.defaultProductIncluded),
    brand: cleanText(item.brand, 80),
    ...(brandStatus ? { brandInvocation: { status: brandStatus } } : {}),
  };
}

export function createInspirationCatalogCache(buildCatalog) {
  if (typeof buildCatalog !== "function") {
    throw new TypeError("buildCatalog must be a function");
  }
  let current = null;
  return async ({ manifestSource, settings }) => {
    if (
      current &&
      current.manifestSource === manifestSource &&
      current.settings === settings
    ) {
      return current.promise;
    }
    const entry = {
      manifestSource,
      settings,
      promise: null,
    };
    entry.promise = Promise.resolve()
      .then(() => buildCatalog({ manifestSource, settings }))
      .catch((error) => {
        if (current === entry) current = null;
        throw error;
      });
    current = entry;
    return entry.promise;
  };
}

