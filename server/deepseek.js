const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-pro';

export const DEFAULT_PROMPT_FRAMEWORK = [
  '保留用户原始意图与明确要求，不虚构未提供的品牌、材质、价格或功效。',
  '根据目标模型自动调整提示词结构与可用参数。',
  '图片任务依次描述：主体与一致性、构图、场景、光线、材质质感、文字或 Logo、负面约束。',
  '视频任务依次描述：主体与一致性、场景、动作时间线、镜头语言、光线与质感、声音或对白、负面约束。',
  '有参考图时优先锁定人物五官、服装版型、颜色、材质、Logo 和背景；无参考图时补齐主体与环境。',
  '最终只输出可直接用于生成的提示词，不要标题、解释、Markdown 或引号。',
].join('\n');

export function isDeepSeekConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export function buildRefineMessages({ prompt, duration = 15, multiShot = true, sourceType = 'text', aspectRatio = '16:9', targetModel = 'kling-v3', framework = DEFAULT_PROMPT_FRAMEWORK, referenceCount = 0, resolution = '2k', quality = 'high' }) {
  const imageTask = targetModel === 'gpt-image-2' || ['image-edit', 'text-to-image'].includes(sourceType);
  if (imageTask) {
    const sourceLabel = sourceType === 'image-edit' || Number(referenceCount) > 0
      ? `参考图编辑（${Math.max(1, Number(referenceCount) || 1)} 张参考图；必须保持指定的人物、服装、商品、Logo、文字与颜色一致）`
      : '文生图（需要完整描述主体、构图、环境、光线、材质与风格）';
    return [
      {
        role: 'system',
        content: [
          '你是电商视觉与广告图片提示词导演。请把用户的简单想法改写成可直接用于目标图片生成模型的中文提示词。',
          '只描述单张静态画面的可见内容、构图和必须保持的细节，不要加入视频时长、运镜、分镜、对白或环境音。',
          `用户自定义优化框架：\n${String(framework || DEFAULT_PROMPT_FRAMEWORK).trim().slice(0, 4000)}`,
        ].join('\n'),
      },
      {
        role: 'user',
        content: `目标模型：${targetModel}\n任务类型：${sourceLabel}\n画幅：${aspectRatio}\n清晰度：${resolution}\n生成质量：${quality}\n原始想法：${String(prompt || '').trim()}`,
      },
    ];
  }
  const sourceLabel = sourceType === 'image' ? '图生视频（必须保持主图人物、商品、服装与文字一致）' : '文生视频（需要完整描述主体、环境、光线与风格）';
  return [
    {
      role: 'system',
      content: [
        '你是电商短视频与广告片提示词导演。请把用户的简单想法改写成可直接用于目标生成模型的中文提示词。',
        `用户自定义优化框架：\n${String(framework || DEFAULT_PROMPT_FRAMEWORK).trim().slice(0, 4000)}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: `目标模型：${targetModel}\n任务类型：${sourceLabel}\n时长：${duration} 秒\n画幅：${aspectRatio}\n镜头：${multiShot ? '智能多镜头，可给出清晰时间线' : '单一连续镜头，不允许剪辑切换'}\n原始想法：${String(prompt || '').trim()}`,
    },
  ];
}

export function buildTextGenerationMessages({ instruction, inputs = [], maxLength = 2500 }) {
  const source = (Array.isArray(inputs) ? inputs : [inputs]).map((value) => String(value || '').trim()).filter(Boolean).join('\n\n--- 上游内容 ---\n\n');
  return [
    {
      role: 'system',
      content: [
        '你是工作流中的文本处理节点。严格执行当前节点规则，并将结果交给下游节点。',
        '只输出最终文本，不要解释处理过程，不要添加 Markdown 代码围栏。',
        `输出最多 ${Math.max(100, Math.min(8000, Number(maxLength) || 2500))} 个中文字符。`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: source
        ? `当前节点规则：\n${String(instruction || '整理并优化上游内容').trim()}\n\n上游输入：\n${source}`
        : `当前节点规则与生成要求：\n${String(instruction || '').trim()}`,
    },
  ];
}

async function requestDeepSeek(messages, maxTokens = 900, signal) {
  if (!isDeepSeekConfigured()) throw Object.assign(new Error('DeepSeek API 尚未配置'), { status: 503 });
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, max_tokens: maxTokens, stream: false }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
      : AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || `DeepSeek 请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('DeepSeek 没有返回文本结果');
  return { content, model: payload.model || model, usage: payload.usage || null };
}

export async function generateWorkflowText(input) {
  const instruction = String(input.instruction || '').trim();
  const inputs = Array.isArray(input.inputs) ? input.inputs : [];
  if (!instruction && !inputs.some((value) => String(value || '').trim())) throw Object.assign(new Error('文本节点缺少规则或上游文本'), { status: 400 });
  return requestDeepSeek(buildTextGenerationMessages({ instruction, inputs, maxLength: input.maxLength }), Math.max(200, Math.min(2400, Number(input.maxTokens) || 1200)), input.signal);
}

export async function refineVideoPrompt(input) {
  if (!isDeepSeekConfigured()) {
    throw Object.assign(new Error('DeepSeek API 尚未配置'), { status: 503 });
  }
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('请先输入需要润色的内容'), { status: 400 });

  return requestDeepSeek(buildRefineMessages(input), 900);
}

