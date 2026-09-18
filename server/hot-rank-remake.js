const ANALYSIS_MODELS = new Set([
  "vapeur-gemini-3.5-flash",
  "vapeur-gemini-3.1-pro",
]);
const TEXT_MODELS = new Set([
  "local-prompt",
  "deepseek-v4-pro",
  "deepseek-chat",
]);
const VIDEO_MODELS = new Set([
  "kling-v3-omni",
  "kling-v3",
  "kling-v3-turbo",
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-0-fast-260128",
  "minimax-h3",
]);
const ASPECT_RATIOS = new Set([
  "9:16",
  "16:9",
  "1:1",
  "3:4",
  "4:3",
  "21:9",
]);
const VIDEO_MODES = new Set(["std", "pro", "4k", "720p", "1080p"]);
const MINIMAX_RESOLUTIONS = new Set(["768P", "2K"]);
const RATIO_MODES = new Set(["fixed", "adaptive"]);
const FAILURE_MODES = new Set(["continue", "fail"]);
const REASONING_LEVELS = new Set(["low", "medium", "high"]);
const ANALYSIS_PATHS = new Set(["/api/media/analyze"]);
const TEXT_PATHS = new Set(["internal://local-prompt", "/api/text/generate"]);
const VIDEO_PATHS = new Set(["/api/tasks/video"]);

const clean = (value, fallback = "", limit = 8_000) =>
  String(value ?? fallback).trim().slice(0, limit);
const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
};
const allowed = (value, values, fallback) => {
  const text = clean(value);
  return values.has(text) ? text : fallback;
};

const DEFAULT_VISUAL_ANALYSIS_PROMPT =
  "按时间顺序分析热点原片，只输出结构化 JSON。必须包含 video_meta、shots、scene、subjects、product、composition、lighting、camera、rhythm、hook、transferable_structure 和 compliance_risks。每个 shot 写明开始/结束时间、景别、构图、主体、服装或商品、动作、运镜、转场与声音线索。提取可迁移的拍摄结构，不复制原品牌、价格、Logo、人物身份或受版权保护的文字。";
const DEFAULT_MOTION_ANALYSIS_PROMPT =
  "分析热点原片的连续动作和时间线，只输出结构化 JSON。逐镜头记录人物行为、商品展示动作、运镜方向、速度变化、节奏、转场、停顿、口播与原声线索，并给出可复刻的 duration、camera_motion、subject_motion、transition 和 beat。不要猜测不可见信息。";
const DEFAULT_DIRECTOR_ANALYSIS_PROMPT =
  "以电商短视频导演视角分析热点原片，只输出结构化 JSON。提取商业目的、目标受众、前三秒爆点、信息密度、情绪曲线、卖点露出顺序、镜头组织、视觉风格和可迁移创意；明确不得复用的品牌、人物身份、价格、Logo 与版权文字。";
const DEFAULT_REQUIREMENT_PROMPT =
  "结合上游视频分析 JSON，为我生成同款视频提示词。保留原片的镜头节奏、景别、动作、运镜和转场逻辑，但必须以我上传的商品或人物素材为唯一主体依据。按照镜头时间线输出可直接提交给视频模型的中文提示词，不得虚构品牌、价格、功效或商品细节，不解释分析过程。";
const DEFAULT_VIDEO_PROMPT =
  "生成商业电商短视频。严格服从上游视频分析、最终提示词和用户上传素材，保持主体、服装、商品、颜色、材质与结构稳定。画面真实、动作自然、镜头连续，不生成错误 Logo、乱码、水印、价格或未经提供的功效信息。";

const DEFAULT_WORKFLOW_NODES = [
  {
    id: "visual-analysis",
    kind: "analysis",
    label: "热点视频视觉分析",
    description: "镜头、场景、主体、商品、构图、光线与节奏 JSON",
    enabled: true,
    order: 10,
    apiPath: "/api/media/analyze",
    promptVersion: "visual-v1",
    prompt: DEFAULT_VISUAL_ANALYSIS_PROMPT,
    model: "vapeur-gemini-3.1-pro",
    failureMode: "continue",
    reasoningEffort: "medium",
    frameLimit: 18,
    maxTokens: 2_400,
    outputFormat: "json",
  },
  {
    id: "motion-analysis",
    kind: "analysis",
    label: "动作与运镜分析",
    description: "动作连续性、运镜、节奏、转场与声音线索",
    enabled: false,
    order: 20,
    apiPath: "/api/media/analyze",
    promptVersion: "motion-v1",
    prompt: DEFAULT_MOTION_ANALYSIS_PROMPT,
    model: "vapeur-gemini-3.5-flash",
    failureMode: "continue",
    reasoningEffort: "low",
    frameLimit: 12,
    maxTokens: 1_800,
    outputFormat: "json",
  },
  {
    id: "director-analysis",
    kind: "analysis",
    label: "导演与爆点分析",
    description: "商业目的、前三秒爆点、情绪和卖点结构",
    enabled: false,
    order: 30,
    apiPath: "/api/media/analyze",
    promptVersion: "director-v1",
    prompt: DEFAULT_DIRECTOR_ANALYSIS_PROMPT,
    model: "vapeur-gemini-3.1-pro",
    failureMode: "continue",
    reasoningEffort: "medium",
    frameLimit: 12,
    maxTokens: 2_000,
    outputFormat: "json",
  },
  {
    id: "prompt",
    kind: "prompt",
    label: "复刻 Prompt 生成",
    description: "分析 JSON、行业规则与用户要求融合",
    enabled: true,
    order: 40,
    apiPath: "internal://local-prompt",
    promptVersion: "remake-v1",
    prompt: DEFAULT_REQUIREMENT_PROMPT,
    model: "local-prompt",
    maxLength: 5_000,
    maxTokens: 2_400,
    outputFormat: "text",
  },
  {
    id: "video",
    kind: "video",
    label: "同款视频生成",
    description: "真实提交 Kling 或 Seedance 视频任务",
    enabled: true,
    order: 50,
    apiPath: "/api/tasks/video",
    promptVersion: "video-v1",
    prompt: DEFAULT_VIDEO_PROMPT,
    model: "kling-v3-omni",
    negativePrompt:
      "换脸，主体漂移，商品变形，错误Logo，乱码，水印，肢体畸形，穿模，闪烁，跳帧，背景漂移",
    aspectRatio: "9:16",
    duration: 15,
    mode: "pro",
    cfgScale: 0.8,
    multiShot: true,
    sound: false,
    outputFormat: "video",
  },
];

export const DEFAULT_HOT_RANK_REMAKE_CONFIG = Object.freeze({
  schemaVersion: 2,
  enabled: true,
  buttonLabel: "一键同款",
  title: "排行榜一键同款",
  description: "先分析热门原片，再结合你上传的商品或人物素材生成同款视频。",
  input: {
    mediaLabel: "商品 / 人物参考素材",
    mediaDescription: "上传需要出现在成片中的商品图、服装图或人物图",
    mediaRequired: true,
    mediaMaxItems: 4,
    requirementLabel: "本次复刻要求",
    requirementDescription: "可修改商品、人物、场景、镜头、节奏和卖点要求",
    requirementRequired: true,
    requirementPrompt: DEFAULT_REQUIREMENT_PROMPT,
  },
  workflow: {
    revision: 1,
    updatedAt: "",
    nodes: DEFAULT_WORKFLOW_NODES,
  },
});

function legacyNodeConfig(input = {}) {
  const currentNodes =
    input.nodes && typeof input.nodes === "object" ? input.nodes : {};
  return {
    analysis:
      currentNodes.analysis && typeof currentNodes.analysis === "object"
        ? currentNodes.analysis
        : {},
    prompt:
      currentNodes.prompt && typeof currentNodes.prompt === "object"
        ? currentNodes.prompt
        : {},
    video:
      currentNodes.video && typeof currentNodes.video === "object"
        ? currentNodes.video
        : {},
  };
}

function workflowNodeInput(input, base, legacy, normalizedInput) {
  const rawNodes = Array.isArray(input.workflow?.nodes)
    ? input.workflow.nodes
    : [];
  const supplied = rawNodes.find((node) => node?.id === base.id);
  if (supplied && typeof supplied === "object") return supplied;
  if (rawNodes.length) return {};
  if (base.id === "visual-analysis") return legacy.analysis;
  if (base.id === "prompt")
    return {
      ...legacy.prompt,
      prompt: normalizedInput.requirementPrompt,
      apiPath:
        !legacy.prompt.model || legacy.prompt.model === "local-prompt"
          ? "internal://local-prompt"
          : "/api/text/generate",
    };
  if (base.id === "video") return legacy.video;
  return {};
}

function normalizeWorkflowNode(raw, base) {
  const common = {
    id: base.id,
    kind: base.kind,
    label: clean(raw.label, base.label, 48),
    description: clean(raw.description, base.description, 180),
    enabled:
      ["prompt", "video"].includes(base.kind)
        ? true
        : raw.enabled === undefined
          ? base.enabled
          : Boolean(raw.enabled),
    order: Math.round(clamp(raw.order, 1, 1_000, base.order)),
    promptVersion: clean(raw.promptVersion, base.promptVersion, 40),
    prompt: clean(raw.prompt, base.prompt, 8_000),
    outputFormat: base.outputFormat,
  };
  if (base.kind === "analysis")
    return {
      ...common,
      apiPath: allowed(raw.apiPath, ANALYSIS_PATHS, base.apiPath),
      model: allowed(raw.model, ANALYSIS_MODELS, base.model),
      failureMode: allowed(
        raw.failureMode,
        FAILURE_MODES,
        base.failureMode,
      ),
      reasoningEffort: allowed(
        raw.reasoningEffort,
        REASONING_LEVELS,
        base.reasoningEffort,
      ),
      frameLimit: Math.round(
        clamp(raw.frameLimit, 6, 18, base.frameLimit),
      ),
      maxTokens: Math.round(
        clamp(raw.maxTokens, 600, 4_000, base.maxTokens),
      ),
    };
  if (base.kind === "prompt") {
    const model = allowed(raw.model, TEXT_MODELS, base.model);
    return {
      ...common,
      apiPath: allowed(
        raw.apiPath,
        TEXT_PATHS,
        model === "local-prompt"
          ? "internal://local-prompt"
          : "/api/text/generate",
      ),
      model,
      maxLength: Math.round(
        clamp(raw.maxLength, 500, 8_000, base.maxLength),
      ),
      maxTokens: Math.round(
        clamp(raw.maxTokens, 400, 4_000, base.maxTokens),
      ),
    };
  }
  const model = allowed(raw.model, VIDEO_MODELS, base.model);
  const isMiniMax = model === "minimax-h3";
  return {
    ...common,
    apiPath: allowed(raw.apiPath, VIDEO_PATHS, base.apiPath),
    model,
    negativePrompt: clean(
      raw.negativePrompt,
      base.negativePrompt,
      2_000,
    ),
    aspectRatio: allowed(
      raw.aspectRatio,
      ASPECT_RATIOS,
      base.aspectRatio,
    ),
    duration: Math.round(
      clamp(raw.duration, isMiniMax ? 4 : 3, 15, base.duration),
    ),
    mode: allowed(raw.mode, VIDEO_MODES, base.mode),
    resolution: isMiniMax
      ? allowed(
          String(raw.resolution || "").toUpperCase(),
          MINIMAX_RESOLUTIONS,
          MINIMAX_RESOLUTIONS.has(base.resolution)
            ? base.resolution
            : "768P",
        )
      : clean(raw.resolution, base.resolution, 12),
    ratioMode: allowed(raw.ratioMode, RATIO_MODES, base.ratioMode || "fixed"),
    aigcWatermark:
      raw.aigcWatermark === undefined
        ? Boolean(base.aigcWatermark)
        : Boolean(raw.aigcWatermark),
    cfgScale: clamp(raw.cfgScale, 0, 1, base.cfgScale),
    multiShot: isMiniMax
      ? false
      : raw.multiShot === undefined
        ? base.multiShot
        : Boolean(raw.multiShot),
    sound: isMiniMax
      ? false
      : raw.sound === undefined
        ? base.sound
        : Boolean(raw.sound),
  };
}

export function normalizeHotRankRemakeConfig(input = {}) {
  const defaults = DEFAULT_HOT_RANK_REMAKE_CONFIG;
  const currentInput =
    input.input && typeof input.input === "object" ? input.input : {};
  const normalizedInput = {
    mediaLabel: clean(
      currentInput.mediaLabel,
      defaults.input.mediaLabel,
      48,
    ),
    mediaDescription: clean(
      currentInput.mediaDescription,
      defaults.input.mediaDescription,
      180,
    ),
    mediaRequired:
      currentInput.mediaRequired === undefined
        ? defaults.input.mediaRequired
        : Boolean(currentInput.mediaRequired),
    mediaMaxItems: Math.round(
      clamp(currentInput.mediaMaxItems, 1, 8, defaults.input.mediaMaxItems),
    ),
    requirementLabel: clean(
      currentInput.requirementLabel,
      defaults.input.requirementLabel,
      48,
    ),
    requirementDescription: clean(
      currentInput.requirementDescription,
      defaults.input.requirementDescription,
      180,
    ),
    requirementRequired:
      currentInput.requirementRequired === undefined
        ? defaults.input.requirementRequired
        : Boolean(currentInput.requirementRequired),
    requirementPrompt: clean(
      currentInput.requirementPrompt,
      defaults.input.requirementPrompt,
      8_000,
    ),
  };
  const legacy = legacyNodeConfig(input);
  const normalizedNodes = DEFAULT_WORKFLOW_NODES.map((base) =>
    normalizeWorkflowNode(
      workflowNodeInput(input, base, legacy, normalizedInput),
      base,
    ),
  );
  const analyses = normalizedNodes.filter((node) => node.kind === "analysis");
  if (!analyses.some((node) => node.enabled)) analyses[0].enabled = true;
  const video = normalizedNodes.find((node) => node.kind === "video");
  const ordered = [
    ...normalizedNodes
      .filter((node) => node.kind !== "video")
      .sort((left, right) => left.order - right.order),
    video,
  ].map((node, index) => ({ ...node, order: (index + 1) * 10 }));
  const analysis = ordered.find((node) => node.id === "visual-analysis");
  const prompt = ordered.find((node) => node.kind === "prompt");
  const videoNode = ordered.find((node) => node.kind === "video");
  return {
    schemaVersion: 2,
    enabled:
      input.enabled === undefined ? defaults.enabled : Boolean(input.enabled),
    buttonLabel: clean(input.buttonLabel, defaults.buttonLabel, 24),
    title: clean(input.title, defaults.title, 80),
    description: clean(input.description, defaults.description, 300),
    input: {
      ...normalizedInput,
      requirementPrompt: prompt.prompt,
    },
    workflow: {
      revision: Math.round(
        clamp(input.workflow?.revision, 1, 1_000_000, 1),
      ),
      updatedAt: clean(input.workflow?.updatedAt, "", 40),
      nodes: ordered,
    },
    // Additive legacy mirrors keep older admin/front-end consumers working.
    nodes: {
      analysis: {
        enabled: analysis.enabled,
        failureMode: analysis.failureMode,
        label: analysis.label,
        model: analysis.model,
        prompt: analysis.prompt,
        targetType: "video",
        reasoningEffort: analysis.reasoningEffort,
        frameLimit: analysis.frameLimit,
        maxTokens: analysis.maxTokens,
      },
      prompt: {
        label: prompt.label,
        model: prompt.model,
        maxLength: prompt.maxLength,
        maxTokens: prompt.maxTokens,
      },
      video: {
        label: videoNode.label,
        model: videoNode.model,
        prompt: videoNode.prompt,
        negativePrompt: videoNode.negativePrompt,
        aspectRatio: videoNode.aspectRatio,
        duration: videoNode.duration,
        mode: videoNode.mode,
        resolution: videoNode.resolution,
        ratioMode: videoNode.ratioMode,
        aigcWatermark: videoNode.aigcWatermark,
        cfgScale: videoNode.cfgScale,
        multiShot: videoNode.multiShot,
        sound: videoNode.sound,
      },
    },
  };
}

const edge = (id, source, target, sourceHandle, targetHandle) => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: "removable",
  animated: true,
});

const graphNodeId = (id) => `hot-rank-${id}`;

function analysisGraphNode(node, index) {
  return {
    id: graphNodeId(node.id),
    type: "studio",
    position: { x: 360 + index * 340, y: 70 + (index % 2) * 110 },
    data: {
      kind: "media-analysis",
      title: node.label,
      subtitle: `${node.model} · ${node.frameLimit} 帧 · ${node.promptVersion}`,
      model: node.model,
      prompt: node.prompt,
      targetType: "video",
      reasoningEffort: node.reasoningEffort,
      frameLimit: node.frameLimit,
      maxTokens: node.maxTokens,
      failureMode: node.failureMode,
      backendPath: node.apiPath,
      workflowConfigId: node.id,
      promptVersion: node.promptVersion,
      outputFormat: node.outputFormat,
      remakeEditable: false,
      inputs: [
        { id: "media", label: "榜单原片", type: "ANY", multiple: true },
        { id: "context", label: "上游上下文", type: "TEXT", multiple: true },
      ],
      outputs: [{ id: "prompt", label: "分析 JSON", type: "TEXT" }],
    },
  };
}

function promptGraphNode(node, index, config) {
  return {
    id: graphNodeId(node.id),
    type: "studio",
    position: { x: 360 + index * 340, y: 80 },
    data: {
      kind: "text",
      title: config.input.requirementLabel,
      subtitle: `${node.label} · ${node.promptVersion}`,
      model: node.model,
      prompt: node.prompt,
      systemPrompt: node.prompt,
      maxLength: node.maxLength,
      maxTokens: node.maxTokens,
      backendPath: node.apiPath,
      workflowConfigId: node.id,
      promptVersion: node.promptVersion,
      outputFormat: node.outputFormat,
      remakeEditable: true,
      remakeRequired: config.input.requirementRequired,
      remakeLabel: config.input.requirementLabel,
      remakeDescription: config.input.requirementDescription,
      inputs: [
        { id: "context", label: "分析 JSON", type: "ANY", multiple: true },
      ],
      outputs: [{ id: "prompt", label: "最终提示词", type: "TEXT" }],
    },
  };
}

function videoGraphNode(node, index) {
  return {
    id: graphNodeId(node.id),
    type: "studio",
    position: { x: 360 + index * 340, y: 210 },
    data: {
      kind: "video",
      title: node.label,
      subtitle: `${node.model} · ${node.duration} 秒 · ${node.aspectRatio}`,
      model: node.model,
      prompt: node.prompt,
      negativePrompt: node.negativePrompt,
      aspectRatio: node.aspectRatio,
      duration: node.duration,
      mode: node.mode,
      resolution: node.resolution,
      ratioMode: node.ratioMode,
      aigcWatermark: node.aigcWatermark,
      cfgScale: node.cfgScale,
      multiShot: node.multiShot,
      sound: node.sound ? "on" : "off",
      combineUpstreamText: true,
      appendConfiguredPrompt: true,
      remakeEditable: false,
      backendGenerationPath: node.apiPath,
      backendPath: node.apiPath,
      workflowConfigId: node.id,
      promptVersion: node.promptVersion,
      outputFormat: node.outputFormat,
      inputs: [
        { id: "prompt", label: "分析与最终提示词", type: "TEXT", multiple: true },
        {
          id: "image_1",
          label: "商品 / 人物参考",
          type: "IMAGE",
          multiple: true,
        },
        ...(node.model === "minimax-h3"
          ? [
              { id: "last_frame", label: "尾帧图片", type: "IMAGE" },
              {
                id: "media",
                label: "多模态参考",
                type: "ANY",
                multiple: true,
              },
              {
                id: "reference_audio",
                label: "参考音频",
                type: "AUDIO",
                multiple: true,
              },
            ]
          : []),
      ],
      outputs: [{ id: "video", label: "同款视频", type: "VIDEO" }],
    },
  };
}

export function buildHotRankRemakeTemplate(item = {}, input = {}) {
  const config = normalizeHotRankRemakeConfig(input);
  const sourceNodeId = "hot-rank-source";
  const productNodeId = "hot-rank-product";
  const outputNodeId = "hot-rank-output";
  const workflowNodes = config.workflow.nodes.filter((node) => node.enabled);
  const videoConfig = workflowNodes.find((node) => node.kind === "video");
  const beforeVideo = workflowNodes.filter((node) => node.kind !== "video");
  const title = clean(item.videoTitle, "热点视频", 160);
  const product = clean(item.productTitle, "榜单商品", 160);
  const rank = Math.max(1, Number(item.rank) || 1);
  const runtimeNodes = workflowNodes.map((node, index) =>
    node.kind === "analysis"
      ? analysisGraphNode(node, index)
      : node.kind === "prompt"
        ? promptGraphNode(node, index, config)
        : videoGraphNode(node, index),
  );
  const nodes = [
    {
      id: sourceNodeId,
      type: "studio",
      position: { x: 20, y: 70 },
      data: {
        kind: "input",
        title: "榜单原片",
        subtitle: `原榜 #${rank} · ${title}`,
        accept: "video/*",
        remakeEditable: false,
        remakeRequired: true,
        outputs: [{ id: "asset", label: "原片", type: "ANY" }],
      },
    },
    {
      id: productNodeId,
      type: "studio",
      position: { x: 20, y: 350 },
      data: {
        kind: "input",
        title: config.input.mediaLabel,
        subtitle: config.input.mediaDescription,
        accept: "image/*,video/*",
        maxFiles: config.input.mediaMaxItems,
        remakeEditable: true,
        remakeRequired: config.input.mediaRequired,
        remakeLabel: config.input.mediaLabel,
        remakeDescription: config.input.mediaDescription,
        outputs: [
          { id: "asset", label: "用户素材", type: "ANY", multiple: true },
        ],
      },
    },
    ...runtimeNodes,
    {
      id: outputNodeId,
      type: "studio",
      position: { x: 700 + workflowNodes.length * 340, y: 210 },
      data: {
        kind: "output",
        title: "同款成片",
        subtitle: "任务中心持续显示节点日志、进度与结果",
        aspectRatio: videoConfig.aspectRatio,
        inputs: [{ id: "video", label: "视频", type: "VIDEO" }],
      },
    },
  ];
  const edges = [];
  beforeVideo.forEach((node, index) => {
    const targetId = graphNodeId(node.id);
    if (node.kind === "analysis") {
      edges.push(
        edge(
          `hot-rank-source-${node.id}`,
          sourceNodeId,
          targetId,
          "asset",
          "media",
        ),
      );
      if (index > 0)
        edges.push(
          edge(
            `hot-rank-order-${beforeVideo[index - 1].id}-${node.id}`,
            graphNodeId(beforeVideo[index - 1].id),
            targetId,
            "prompt",
            "context",
          ),
        );
    } else {
      beforeVideo.slice(0, index).forEach((upstream) =>
        edges.push(
          edge(
            `hot-rank-context-${upstream.id}-${node.id}`,
            graphNodeId(upstream.id),
            targetId,
            "prompt",
            "context",
          ),
        ),
      );
    }
  });
  const videoNodeId = graphNodeId(videoConfig.id);
  const promptIndex = beforeVideo.findIndex((node) => node.kind === "prompt");
  const videoUpstreams =
    promptIndex < 0
      ? beforeVideo
      : [
          beforeVideo[promptIndex],
          ...beforeVideo.slice(promptIndex + 1),
        ];
  videoUpstreams.forEach((upstream) =>
    edges.push(
      edge(
        `hot-rank-prompt-${upstream.id}-video`,
        graphNodeId(upstream.id),
        videoNodeId,
        "prompt",
        "prompt",
      ),
    ),
  );
  edges.push(
    edge(
      "hot-rank-product-video",
      productNodeId,
      videoNodeId,
      "asset",
      "image_1",
    ),
    edge(
      "hot-rank-video-output",
      videoNodeId,
      outputNodeId,
      "video",
      "video",
    ),
  );
  return {
    id: `hot-rank-remake-${clean(item.id, rank, 120)}`,
    name: `榜单 #${rank} · ${product} · 一键同款`,
    description: `${title} · ${config.description}`,
    category: "排行榜同款",
    tags: ["排行榜", "一键同款", clean(item.primaryCategory, "热点")].filter(
      Boolean,
    ),
    visibility: "private",
    public: false,
    runMode: "backend",
    remakeSource: "hot-rank",
    sourceTemplateId: "draft",
    revision: config.workflow.revision,
    workflowSchemaVersion: config.schemaVersion,
    workflowConfigRevision: config.workflow.revision,
    hotRankItemId: clean(item.id, "", 120),
    hotRankRank: rank,
    hotRankTitle: title,
    sourceInputNodeId: sourceNodeId,
    nodes,
    edges,
  };
}

export function publicHotRankRemakeConfig(input = {}, runtime = {}) {
  const config = normalizeHotRankRemakeConfig(input);
  const enabledNodes = config.workflow.nodes.filter((node) => node.enabled);
  const enabledAnalysis = enabledNodes.filter((node) => node.kind === "analysis");
  const promptNodes = enabledNodes.filter((node) => node.kind === "prompt");
  const videoNode = enabledNodes.find((node) => node.kind === "video");
  const analysisReady =
    Boolean(runtime.analysisConfigured) ||
    enabledAnalysis.every((node) => node.failureMode === "continue");
  const promptReady = promptNodes.every(
    (node) => node.model === "local-prompt" || Boolean(runtime.textConfigured),
  );
  const videoReady = Boolean(runtime.videoConfigured);
  return {
    schemaVersion: config.schemaVersion,
    enabled: config.enabled,
    buttonLabel: config.buttonLabel,
    title: config.title,
    description: config.description,
    input: config.input,
    flow: ["榜单原片", ...enabledNodes.map((node) => node.label), "任务中心"],
    workflow: {
      revision: config.workflow.revision,
      updatedAt: config.workflow.updatedAt,
      nodes: config.workflow.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.label,
        description: node.description,
        enabled: node.enabled,
        order: node.order,
        apiPath: node.apiPath,
        promptVersion: node.promptVersion,
        model: node.model,
        outputFormat: node.outputFormat,
      })),
    },
    output: {
      model: videoNode.model,
      aspectRatio: videoNode.aspectRatio,
      duration: videoNode.duration,
      mode: videoNode.mode,
      resolution: videoNode.resolution,
      ratioMode: videoNode.ratioMode,
      aigcWatermark: videoNode.aigcWatermark,
    },
    readiness: {
      runnable: config.enabled && analysisReady && promptReady && videoReady,
      analysis: {
        configured: Boolean(runtime.analysisConfigured),
        fallback: enabledAnalysis.every(
          (node) => node.failureMode === "continue",
        ),
        enabledCount: enabledAnalysis.length,
      },
      prompt: {
        configured: promptReady,
        mode: promptNodes.map((node) => node.model).join(","),
      },
      video: {
        configured: videoReady,
        provider: String(runtime.videoProvider || "kling"),
      },
      message: videoReady
        ? "真实生成服务已就绪"
        : `请配置${runtime.videoProvider === "volcengine" ? " Seedance" : runtime.videoProvider === "minimax" ? " MiniMax" : " Kling"} 视频生成凭证`,
    },
  };
}

