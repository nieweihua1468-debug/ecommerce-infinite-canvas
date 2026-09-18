export const TEMPLATE_MANIFEST_SCHEMA_VERSION = 1;

const MEDIA_FIELD_KINDS = new Set([
  "input",
  "batch-input",
  "face-input",
  "person-video-input",
  "audio",
  "audio-input",
  "audio-reference",
]);
const TEXT_FIELD_KINDS = new Set([
  "text-input",
  "text",
  "media-analysis",
  "image",
  "video",
]);

const clean = (value, fallback = "") => String(value || fallback).trim();
const revisionOf = (template = {}) => Math.max(1, Number(template.revision) || 1);

function orderedNodes(template = {}) {
  const nodes = Array.isArray(template.nodes) ? template.nodes : [];
  const edges = Array.isArray(template.edges) ? template.edges : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    if (!byId.has(edge.source) || !byId.has(edge.target)) return;
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
      if (indegree.get(target) === 0) queue.push(byId.get(target));
    }
  }
  return ordered.length === nodes.length ? ordered : nodes;
}

function mediaFieldType(node = {}) {
  const kind = node.data?.kind;
  if (["audio", "audio-input", "audio-reference"].includes(kind)) return "audio";
  if (kind === "person-video-input") return "video";
  if (kind === "face-input") return "verified_person";
  if (kind === "batch-input") return "batch_media";
  return "media";
}

function fieldAccept(node = {}) {
  const kind = node.data?.kind;
  if (["audio", "audio-input", "audio-reference"].includes(kind)) return "audio/*";
  if (kind === "person-video-input") return "video/*";
  if (kind === "face-input") return "image/jpeg,image/png,image/webp";
  return clean(node.data?.accept, "image/*,video/*");
}

function manifestFields(template = {}) {
  return orderedNodes(template).flatMap((node, index) => {
    const kind = node.data?.kind;
    if (node.data?.remakeEditable === false) return [];
    const isMedia = MEDIA_FIELD_KINDS.has(kind) || node.data?.directMediaInput;
    const isText = TEXT_FIELD_KINDS.has(kind);
    const isAsset = kind === "asset";
    if (!isMedia && !isText && !isAsset) return [];
    const type = isMedia ? mediaFieldType(node) : isAsset ? "digital_asset" : "text";
    return [{
      fieldId: clean(node.data?.remakeFieldId, `node:${node.id}`),
      nodeId: clean(node.id, `node-${index + 1}`),
      label: clean(node.data?.remakeLabel || node.data?.title, `输入 ${index + 1}`),
      description: clean(node.data?.remakeDescription || node.data?.subtitle),
      type,
      role: clean(node.data?.remakeRole, kind),
      required: node.data?.remakeRequired === true,
      editable: true,
      ...(isMedia
        ? {
            accept: fieldAccept(node),
            maxItems: Math.max(1, Number(node.data?.maxFiles || node.data?.maxItems) || (kind === "face-input" ? 9 : 4)),
          }
        : {}),
    }];
  });
}

function outputContract(template = {}) {
  const generationNodes = orderedNodes(template).filter((node) =>
    ["image", "video", "audio"].includes(node.data?.kind),
  );
  const node = generationNodes[generationNodes.length - 1];
  if (!node) return { type: "unknown" };
  return {
    nodeId: clean(node.id),
    type: node.data.kind,
    model: clean(node.data.model),
    aspectRatio: clean(node.data.aspectRatio),
    duration: Number(node.data.duration) || undefined,
    quality: clean(node.data.quality || node.data.mode),
  };
}

function assetRequirements(template = {}) {
  const requirements = [];
  for (const node of Array.isArray(template.nodes) ? template.nodes : []) {
    const kind = node.data?.kind;
    if (kind === "face-input" || kind === "person-video-input") {
      requirements.push({
        nodeId: clean(node.id),
        type: "seedance_verified_person",
        required: node.data?.remakeRequired === true,
      });
    }
    if (kind === "asset" || (kind === "video" && Array.isArray(node.data?.digitalAssetIds))) {
      requirements.push({
        nodeId: clean(node.id),
        type: node.data?.provider === "volcengine" ? "seedance_asset" : "kling_element",
        required: node.data?.remakeRequired === true,
        limit: kind === "video" ? 3 : 1,
      });
    }
  }
  return requirements;
}

export function templateVersionRef(template = {}) {
  const id = clean(template.id, "template");
  return `${id}@${revisionOf(template)}`;
}

export function buildTemplateManifest(template = {}) {
  const revision = revisionOf(template);
  const fields = manifestFields(template);
  const output = outputContract(template);
  const validationIssues = [];
  if (output.type === "unknown") validationIssues.push("模板缺少可执行的图片、视频或音频输出节点");
  if (!fields.length) validationIssues.push("模板没有向使用者开放任何素材或文案输入");
  return {
    schemaVersion: TEMPLATE_MANIFEST_SCHEMA_VERSION,
    templateId: clean(template.id),
    templateRevision: revision,
    versionRef: templateVersionRef(template),
    fields,
    output,
    assetRequirements: assetRequirements(template),
    validation: {
      status: validationIssues.length ? "draft" : "ready",
      issues: validationIssues,
    },
    execution: {
      mode: template.runMode === "frontend" ? "frontend" : "backend",
      keepUserInSimpleRunner: true,
    },
  };
}

export function normalizeTemplateManifest(template = {}) {
  const manifest = template.manifest;
  if (
    manifest &&
    Number(manifest.schemaVersion) === TEMPLATE_MANIFEST_SCHEMA_VERSION &&
    Array.isArray(manifest.fields) &&
    Math.max(1, Number(manifest.templateRevision) || 1) === revisionOf(template) &&
    (!template.id || !manifest.templateId || String(manifest.templateId) === String(template.id))
  ) {
    return {
      ...manifest,
      templateId: clean(manifest.templateId, template.id),
      templateRevision: Math.max(1, Number(manifest.templateRevision) || revisionOf(template)),
      versionRef: clean(manifest.versionRef, templateVersionRef(template)),
    };
  }
  return buildTemplateManifest(template);
}

