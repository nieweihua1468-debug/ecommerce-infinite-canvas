export const MODEL_DEPLOYMENTS = Object.freeze([
  {
    id: "kling-v3",
    name: "Kling 3.0",
    provider: "kling",
    upstreamModelId: "kling-v3",
    kind: "video",
    badge: "3–15s · 可调",
  },
  {
    id: "kling-v3-motion-control",
    name: "Kling 3.0 动作控制",
    provider: "kling",
    upstreamModelId: "kling-v3-motion-control",
    kind: "video",
    badge: "人物图 + 舞蹈视频 · 动作模仿",
  },
  {
    id: "kling-v3-turbo",
    name: "Kling 3.0 Turbo",
    provider: "kling",
    upstreamModelId: "kling-v3-turbo",
    kind: "video",
    badge: "图生视频 · 720P / 1080P · 3–15s",
  },
  {
    id: "kling-v3-omni",
    name: "Kling 3.0 Omni",
    provider: "kling",
    upstreamModelId: "kling-v3-omni",
    kind: "video",
    badge: "3–15s · 多图 / Element / 视频 / 声音",
  },
  {
    id: "doubao-seedance-2-0-260128",
    name: "Seedance 2.0",
    provider: "volcengine",
    upstreamModelId: "doubao-seedance-2-0-260128",
    kind: "video",
    badge: "标准质量 · 多模态",
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    name: "Seedance 2.0 Fast",
    provider: "volcengine",
    upstreamModelId: "doubao-seedance-2-0-fast-260128",
    kind: "video",
    badge: "快速生成 · 多模态",
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2 · Azure",
    provider: "image2",
    upstreamModelId: "gpt-image-2",
    kind: "image",
    badge: "文生图 / 多图编辑",
  },
  {
    id: "vapeur-gpt-image-2",
    name: "GPT Image 2 · Vapeur",
    provider: "vapeur",
    upstreamModelId: "gpt-image-2",
    kind: "image",
    badge: "文生图 / 多图编辑",
  },
  {
    id: "nano-banana",
    name: "Nano Banana Pro",
    provider: "unconfigured",
    upstreamModelId: "nano-banana-pro",
    kind: "image",
    badge: "暂不可用",
    permanentlyDisabled: true,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    upstreamModelId: "deepseek-v4-pro",
    kind: "text",
    badge: "提示词导演",
  },
  {
    id: "vapeur-gpt-5.5",
    name: "GPT 5.5 · Vapeur",
    provider: "vapeur",
    upstreamModelId: "gpt-5.5",
    kind: "text",
    badge: "文本生成 / 提示词导演",
  },
  {
    id: "vapeur-gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "vapeur",
    upstreamModelId: "gemini-3.5-flash",
    kind: "analysis",
    badge: "快速视频理解 / 提示词",
  },
  {
    id: "vapeur-gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "vapeur",
    upstreamModelId: "gemini-3.1-pro",
    kind: "analysis",
    badge: "深度视频理解 / 提示词",
  },
  {
    id: "speech-2.8-hd",
    name: "MiniMax Speech 2.8 HD",
    provider: "minimax",
    upstreamModelId: "speech-2.8-hd",
    kind: "audio",
    badge: "有声口播 / 声音复刻",
  },
  {
    id: "minimax-h3",
    name: "MiniMax H3",
    provider: "minimax",
    upstreamModelId: "MiniMax-H3",
    kind: "video",
    badge: "4–15s · 768P / 2K · 多模态参考",
  },
]);

const statusFor = (configured, readiness) => {
  if (!configured) return "UNAVAILABLE";
  if (!readiness) return "UNKNOWN";
  if (readiness.ready === false || readiness.authenticated === false)
    return "UNAVAILABLE";
  if (readiness.modelAvailable == null) return "DEGRADED";
  return readiness.modelAvailable ? "HEALTHY" : "UNAVAILABLE";
};

export function buildModelCatalog({ providerConfigured = {}, readinessRecords = [] } = {}) {
  const readiness = new Map(
    (Array.isArray(readinessRecords) ? readinessRecords : []).map((record) => [
      String(record.modelId || record.id || ""),
      record,
    ]),
  );
  return MODEL_DEPLOYMENTS.map((model) => {
    const baseConfigured =
      !model.permanentlyDisabled && providerConfigured[model.provider] === true;
    const current = readiness.get(model.id) || null;
    const deploymentStatus = statusFor(baseConfigured, current);
    const configured =
      baseConfigured &&
      !["UNAVAILABLE"].includes(deploymentStatus) &&
      current?.ready !== false;
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      kind: model.kind,
      configured,
      deploymentStatus,
      checkedAt: current?.checkedAt || null,
      badge: configured ? model.badge : "暂不可用",
    };
  });
}

