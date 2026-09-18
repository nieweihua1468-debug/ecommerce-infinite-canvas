import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVapeurWorkflowText, isVapeurConfigured, refineVapeurPrompt } from './vapeur.js';

test('Vapeur workflow text uses configured GPT model without exposing credentials', async () => {
  process.env.VAPEUR_API_KEY = 'vapeur-test-key';
  process.env.VAPEUR_BASE_URL = 'https://api.vapeur.ai/v1';
  process.env.VAPEUR_TEXT_MODEL = 'gpt-5.5';
  assert.equal(isVapeurConfigured(), true);
  const result = await generateVapeurWorkflowText({ instruction: '压缩成一句话', inputs: ['上游文本'], maxTokens: 300 }, async (url, options) => {
    assert.equal(url, 'https://api.vapeur.ai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer vapeur-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.5');
    assert.equal(body.reasoning_effort, 'low');
    assert.match(body.messages[1].content, /上游文本/);
    return new Response(JSON.stringify({ model: 'gpt-5.5', choices: [{ message: { content: '一句话结果' } }] }), { status: 200 });
  });
  assert.equal(result.content, '一句话结果');
  assert.equal(result.model, 'gpt-5.5');
  delete process.env.VAPEUR_API_KEY;
  delete process.env.VAPEUR_BASE_URL;
  delete process.env.VAPEUR_TEXT_MODEL;
});

test('Vapeur GPT 5.5 refines homepage image and video prompts', async () => {
  process.env.VAPEUR_API_KEY = 'vapeur-test-key';
  process.env.VAPEUR_BASE_URL = 'https://api.vapeur.ai/v1';
  process.env.VAPEUR_TEXT_MODEL = 'gpt-5.5';
  const result = await refineVapeurPrompt({
    prompt: '模特向前走',
    targetModel: 'kling-v3',
    duration: 15,
    aspectRatio: '9:16',
  }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.5');
    assert.equal(body.max_completion_tokens, 900);
    assert.equal(body.reasoning_effort, 'low');
    assert.match(body.messages[1].content, /Kling-v3|kling-v3/i);
    assert.match(body.messages[1].content, /15 秒/);
    return new Response(JSON.stringify({
      model: 'gpt-5.5',
      choices: [{ message: { content: '模特保持服装一致，自然向前走。' } }],
    }), { status: 200 });
  });
  assert.equal(result.content, '模特保持服装一致，自然向前走。');
  delete process.env.VAPEUR_API_KEY;
  delete process.env.VAPEUR_BASE_URL;
  delete process.env.VAPEUR_TEXT_MODEL;
});

