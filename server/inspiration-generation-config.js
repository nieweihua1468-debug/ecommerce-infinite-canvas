export const DEFAULT_INSPIRATION_OUTFIT_PROMPT = `将参考图 2 中的完整服装与造型替换到参考图 1 的人物身上。

参考图 1 负责人物身份、五官、发型、身材、姿势、构图、场景、光线与镜头关系；参考图 2 只负责服装、鞋包、帽子、首饰和其他穿搭配件。完整移除参考图 1 的原穿搭，不得混搭、改色、简化或新增参考图 2 中不存在的服饰。

保持人物身份、动作、环境和画面构图不变，让新服装自然贴合身体与动作，准确表现版型、层次、颜色、面料、纹理、褶皱、配件、遮挡、透视、光影和尺度。全过程保持同一人物、同一套服装与同一场景，避免换脸、变形、残留原服装、闪烁、跳帧、背景漂移、文字、Logo 和水印。`;

export const DEFAULT_QUICK_CREATE_PROMPT =
  "模特自然自信地向镜头走来，服装材质与版型保持不变。镜头先中景平稳跟拍，再轻微环绕展示侧面与背面细节，最后定格正面全身。真实布料运动，商业时装大片质感，人物五官稳定，背景自然。";

export const DEFAULT_IMAGE_CREATE_PROMPT =
  "电商时尚大片，服装版型与面料细节清晰，人物自然，高级摄影棚布光，真实质感。";

export const DEFAULT_AUDIO_SPEECH_TEXT =
  "伯希和新品大上新，秋冬热卖，拍一发三，今天直播间直接安排。";

export const DEFAULT_AUDIO_CLONE_PREVIEW_TEXT =
  "你好，这是Commerce Canvas声音克隆试听。";

export const DEFAULT_ANALYSIS_SEEDANCE_FRAMEWORK =
  "逐时间段分析完整视频，输出可直接用于 Seedance 2.0 的中文生成提示词。重点还原主体一致性、人物和服装、场景空间、动作时间线、镜头语言、光线色彩、节奏、对白与声音线索；明确每个镜头的时长与衔接，不要虚构不可见信息。";

export const DEFAULT_ANALYSIS_KLING_FRAMEWORK =
  "逐时间段分析完整视频，输出可直接用于可灵 3.0 / Omni 的中文生成提示词。重点还原主体和数字资产一致性、服装商品细节、分镜时长、人物动作、镜头运动、景别、场景、光线与声音；多镜头按时间顺序清晰描述，不要虚构不可见信息。";

export const DEFAULT_CANVAS_DIRECTOR_PROMPT =
  "将输入想法优化为适配目标模型、可直接执行的结构化生成提示词。";

export const DEFAULT_CANVAS_ANALYSIS_PROMPT =
  "完整分析素材中的主体、人物、服装、商品、场景、光线、构图、动作、镜头变化和时间顺序，输出忠实且可直接用于视频生成的中文提示词。";

export const DEFAULT_QUICK_PROMPT_PRESETS = Object.freeze([
  { label: "电商走秀", prompt: DEFAULT_QUICK_CREATE_PROMPT },
  {
    label: "定点转身",
    prompt:
      "模特保持服装和人物外观稳定，自然转身一周展示服装正面、侧面与背面。固定机位，全身构图，真实布料运动，商业摄影质感。",
  },
  {
    label: "细节环绕",
    prompt:
      "保持主体外观完全一致，镜头缓慢推进并环绕主体，切换到材质细节特写，最后回到完整商品全景。高级广告布光，画面稳定。",
  },
]);

export const DEFAULT_INSPIRATION_GENERATION_CONFIG = Object.freeze({
  modelName: "kling-v3-omni",
  duration: 15,
  aspectRatio: "9:16",
  mode: "pro",
  cfgScale: 0.8,
  multiShot: true,
  outfitPrompt: DEFAULT_INSPIRATION_OUTFIT_PROMPT,
  promptLabel: "提示词",
  promptPlaceholder: DEFAULT_QUICK_CREATE_PROMPT,
  generateButtonLabel: "生成",
  quickPromptPresets: DEFAULT_QUICK_PROMPT_PRESETS,
  batchPromptLabel: "统一提示词",
  batchPrompt: DEFAULT_QUICK_CREATE_PROMPT,
  batchApplyLabel: "应用到全部",
  imagePromptLabel: "图片描述",
  imagePromptPlaceholder: DEFAULT_IMAGE_CREATE_PROMPT,
  audioTextLabel: "配音文本",
  audioTextPlaceholder: DEFAULT_AUDIO_SPEECH_TEXT,
  audioClonePreviewText: DEFAULT_AUDIO_CLONE_PREVIEW_TEXT,
  analysisPromptLabel: "分析框架提示词",
  analysisPromptPlaceholder:
    "告诉模型需要重点分析哪些画面、人物、服装、商品或镜头细节…",
  analysisSeedanceFramework: DEFAULT_ANALYSIS_SEEDANCE_FRAMEWORK,
  analysisKlingFramework: DEFAULT_ANALYSIS_KLING_FRAMEWORK,
  canvasDirectorPrompt: DEFAULT_CANVAS_DIRECTOR_PROMPT,
  canvasVideoPrompt: DEFAULT_QUICK_CREATE_PROMPT,
  canvasAnalysisPrompt: DEFAULT_CANVAS_ANALYSIS_PROMPT,
});

const SUPPORTED_MODELS = new Set(["kling-v3", "kling-v3-omni"]);
const SUPPORTED_RATIOS = new Set(["9:16", "16:9", "1:1"]);
const SUPPORTED_MODES = new Set(["std", "pro"]);

export function normalizeInspirationGenerationConfig(input = {}) {
  const modelName = String(input.modelName || "").trim();
  const aspectRatio = String(input.aspectRatio || "").trim();
  const mode = String(input.mode || "").trim();
  const outfitPrompt = String(input.outfitPrompt || "").trim();
  const clean = (value, fallback, limit) =>
    String(value || "").trim().slice(0, limit) || fallback;
  const inputPresets = Array.isArray(input.quickPromptPresets)
    ? input.quickPromptPresets
    : [];
  const quickPromptPresets = DEFAULT_QUICK_PROMPT_PRESETS.map(
    (fallback, index) => ({
      label: clean(inputPresets[index]?.label, fallback.label, 24),
      prompt: clean(inputPresets[index]?.prompt, fallback.prompt, 2500),
    }),
  );
  return {
    modelName: SUPPORTED_MODELS.has(modelName)
      ? modelName
      : DEFAULT_INSPIRATION_GENERATION_CONFIG.modelName,
    duration: Math.min(
      15,
      Math.max(
        3,
        Number(input.duration) ||
          DEFAULT_INSPIRATION_GENERATION_CONFIG.duration,
      ),
    ),
    aspectRatio: SUPPORTED_RATIOS.has(aspectRatio)
      ? aspectRatio
      : DEFAULT_INSPIRATION_GENERATION_CONFIG.aspectRatio,
    mode: SUPPORTED_MODES.has(mode)
      ? mode
      : DEFAULT_INSPIRATION_GENERATION_CONFIG.mode,
    cfgScale: Math.min(
      1,
      Math.max(
        0,
        Number.isFinite(Number(input.cfgScale))
          ? Number(input.cfgScale)
          : DEFAULT_INSPIRATION_GENERATION_CONFIG.cfgScale,
      ),
    ),
    multiShot:
      input.multiShot === undefined
        ? DEFAULT_INSPIRATION_GENERATION_CONFIG.multiShot
        : Boolean(input.multiShot),
    outfitPrompt:
      outfitPrompt.slice(0, 8000) ||
      DEFAULT_INSPIRATION_GENERATION_CONFIG.outfitPrompt,
    promptLabel: clean(input.promptLabel, "提示词", 24),
    promptPlaceholder: clean(
      input.promptPlaceholder,
      DEFAULT_QUICK_CREATE_PROMPT,
      2500,
    ),
    generateButtonLabel: clean(input.generateButtonLabel, "生成", 20),
    quickPromptPresets,
    batchPromptLabel: clean(input.batchPromptLabel, "统一提示词", 24),
    batchPrompt: clean(input.batchPrompt, DEFAULT_QUICK_CREATE_PROMPT, 4000),
    batchApplyLabel: clean(input.batchApplyLabel, "应用到全部", 24),
    imagePromptLabel: clean(input.imagePromptLabel, "图片描述", 24),
    imagePromptPlaceholder: clean(
      input.imagePromptPlaceholder,
      DEFAULT_IMAGE_CREATE_PROMPT,
      4000,
    ),
    audioTextLabel: clean(input.audioTextLabel, "配音文本", 24),
    audioTextPlaceholder: clean(
      input.audioTextPlaceholder,
      DEFAULT_AUDIO_SPEECH_TEXT,
      4000,
    ),
    audioClonePreviewText: clean(
      input.audioClonePreviewText,
      DEFAULT_AUDIO_CLONE_PREVIEW_TEXT,
      1000,
    ),
    analysisPromptLabel: clean(
      input.analysisPromptLabel,
      "分析框架提示词",
      24,
    ),
    analysisPromptPlaceholder: clean(
      input.analysisPromptPlaceholder,
      "告诉模型需要重点分析哪些画面、人物、服装、商品或镜头细节…",
      500,
    ),
    analysisSeedanceFramework: clean(
      input.analysisSeedanceFramework,
      DEFAULT_ANALYSIS_SEEDANCE_FRAMEWORK,
      4000,
    ),
    analysisKlingFramework: clean(
      input.analysisKlingFramework,
      DEFAULT_ANALYSIS_KLING_FRAMEWORK,
      4000,
    ),
    canvasDirectorPrompt: clean(
      input.canvasDirectorPrompt,
      DEFAULT_CANVAS_DIRECTOR_PROMPT,
      2500,
    ),
    canvasVideoPrompt: clean(
      input.canvasVideoPrompt,
      DEFAULT_QUICK_CREATE_PROMPT,
      4000,
    ),
    canvasAnalysisPrompt: clean(
      input.canvasAnalysisPrompt,
      DEFAULT_CANVAS_ANALYSIS_PROMPT,
      4000,
    ),
  };
}

