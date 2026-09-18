export function templateVisibilityScope(template = {}) {
  return template.system ||
    String(template.id || "").startsWith("builtin-") ||
    template.visibility === "team" ||
    template.visibility === "global" ||
    template.public === true
    ? "team"
    : "private";
}

export function privateTemplateCopyName(name) {
  const normalized = String(name || "未命名").trim() || "未命名";
  if (/模[板版]$/.test(normalized))
    return normalized.replace(/模版$/, "模板");
  return `${normalized}模板`;
}

export function buildPrivateTemplateCopy(template = {}) {
  return {
    name: privateTemplateCopyName(template.name),
    description: String(template.description || "").trim(),
    category: String(template.category || "自定义"),
    accent: String(template.accent || "#daff51"),
    visibility: "private",
    public: false,
    runMode: template.runMode === "frontend" ? "frontend" : "backend",
    nodes: Array.isArray(template.nodes) ? template.nodes : [],
    edges: Array.isArray(template.edges) ? template.edges : [],
    sourceTemplateId: String(template.id || ""),
    sourceTemplateRevision: Math.max(1, Number(template.revision) || 1),
  };
}

