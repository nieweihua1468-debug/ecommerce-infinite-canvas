import { buildRefineMessages, buildTextGenerationMessages } from './deepseek.js';

const DEFAULT_BASE_URL = 'https://api.vapeur.ai/v1';
const DEFAULT_TEXT_MODEL = 'gpt-5.5';

export function isVapeurConfigured() {
  return Boolean(String(process.env.VAPEUR_API_KEY || '').trim());
}

export function getVapeurStatus() {
  return {
    configured: isVapeurConfigured(),
    textModel: process.env.VAPEUR_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    imageModel: process.env.VAPEUR_IMAGE_MODEL || 'gpt-image-2',
    baseUrl: process.env.VAPEUR_BASE_URL || DEFAULT_BASE_URL,
  };
}

async function requestVapeurText(messages, {
  maxTokens = 1200,
  reasoningEffort = 'low',
  signal,
} = {}, fetchImpl = fetch) {
  if (!isVapeurConfigured()) throw Object.assign(new Error('Vapeur API 尚未配置'), { status: 503 });
  const baseUrl = String(process.env.VAPEUR_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = String(process.env.VAPEUR_TEXT_MODEL || DEFAULT_TEXT_MODEL);
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VAPEUR_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: Math.max(200, Math.min(2400, Number(maxTokens) || 1200)),
      reasoning_effort: String(reasoningEffort || 'low'),
      stream: false,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstreamMessage = String(payload?.error?.message || payload?.message || `Vapeur 请求失败（HTTP ${response.status}）`);
    const authenticationFailure = response.status === 401 || response.status === 403 || /api[ _-]?key|authentication|unauthori[sz]ed|permission/i.test(upstreamMessage);
    const error = new Error(authenticationFailure ? 'Vapeur 文本模型鉴权或模型权限不足，请联系管理员' : upstreamMessage);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw error;
  }
  const content = String(payload?.choices?.[0]?.message?.content || '').trim();
  if (!content) throw Object.assign(new Error('Vapeur 文本模型没有返回内容'), { status: 502 });
  return { content, model: payload.model || model, usage: payload.usage || null };
}

export async function generateVapeurWorkflowText(input, fetchImpl = fetch) {
  const instruction = String(input.instruction || '').trim();
  const inputs = Array.isArray(input.inputs) ? input.inputs : [];
  if (!instruction && !inputs.some((value) => String(value || '').trim())) {
    throw Object.assign(new Error('文本节点缺少规则或上游文本'), { status: 400 });
  }
  return requestVapeurText(
    buildTextGenerationMessages({ instruction, inputs, maxLength: input.maxLength }),
    {
      maxTokens: input.maxTokens,
      reasoningEffort: input.reasoningEffort,
      signal: input.signal,
    },
    fetchImpl,
  );
}

export async function refineVapeurPrompt(input, fetchImpl = fetch) {
  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    throw Object.assign(new Error('请先输入需要润色的内容'), { status: 400 });
  }
  return requestVapeurText(
    buildRefineMessages(input),
    { maxTokens: 900, reasoningEffort: 'low' },
    fetchImpl,
  );
}

