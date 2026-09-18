import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWorkflowMedia, buildMediaAnalysisMessages, buildUniformFrameFilter, resolveAnalysisVideoInput, resolveMediaAnalysisModel, shouldNormalizeAnalysisVideo } from './media-analysis.js';

test('buildUniformFrameFilter samples across the complete video duration', () => {
  assert.match(buildUniformFrameFilter(15, 12), /fps=0\.800000/);
  assert.match(buildUniformFrameFilter(60, 18), /fps=0\.300000/);
  assert.match(buildUniformFrameFilter(0, 12), /fps=1\/3/);
});

test('accepts HEVC and common editing containers by filename or mime type', () => {
  assert.equal(resolveAnalysisVideoInput({ name: 'iPhone素材.MOV', mimeType: 'video/quicktime' }).extension, 'mov');
  assert.equal(resolveAnalysisVideoInput({ name: '摄影原片.mkv', mimeType: 'application/octet-stream' }).extension, 'mkv');
  assert.equal(resolveAnalysisVideoInput({ name: 'camera.H265', mimeType: '' }).extension, 'h265');
  assert.equal(resolveAnalysisVideoInput({ name: 'legacy.bin', mimeType: 'video/x-msvideo' }).extension, 'avi');
});

test('normalizes HEVC, H265, AV1 and VP9 before visual analysis', () => {
  assert.equal(shouldNormalizeAnalysisVideo({ codecName: 'hevc' }, 'mov'), true);
  assert.equal(shouldNormalizeAnalysisVideo({ codecName: 'av1' }, 'mp4'), true);
  assert.equal(shouldNormalizeAnalysisVideo({ codecName: 'h264' }, 'mp4'), false);
  assert.equal(shouldNormalizeAnalysisVideo({}, 'h265'), true);
});

test('buildMediaAnalysisMessages adds ordered visual inputs and direct prompt rules', () => {
  const messages = buildMediaAnalysisMessages({ instruction: '保留服装版型', targetType: 'video', media: [{ name: '主图', mimeType: 'image/png', data: 'abc', source: 'image' }] });
  assert.equal(messages[1].content[1].text, '素材 1：主图');
  assert.equal(messages[1].content[2].image_url.url, 'data:image/png;base64,abc');
  assert.match(messages[1].content[0].text, /只输出最终提示词/);
  assert.match(messages[1].content[0].text, /保留服装版型/);
});

test('buildMediaAnalysisMessages explains storyboard reading order', () => {
  const messages = buildMediaAnalysisMessages({ targetType: 'video', media: [{ name: '视频.mp4 · 时间分镜表 1', mimeType: 'image/jpeg', data: 'abc', source: 'video-storyboard', sampledFrames: 6, sampleTimes: [0, 0.83, 1.67, 2.5, 3.33, 4.17], videoDuration: 15 }] });
  assert.match(messages[1].content[1].text, /左到右、上到下/);
  assert.match(messages[1].content[1].text, /6 个均匀时间点/);
  assert.match(messages[1].content[0].text, /真实媒体总时长 15\.00 秒/);
  assert.match(messages[1].content[1].text, /4\.17秒/);
  assert.match(messages[0].content, /不得根据画面数量/);
});

test('analyzeWorkflowMedia sends image content to configured GPT-compatible endpoint', async () => {
  process.env.VAPEUR_API_KEY = 'test-key';
  process.env.VAPEUR_BASE_URL = 'https://example.com/v1';
  process.env.VAPEUR_TEXT_MODEL = 'gpt-5.5-test';
  let captured;
  const result = await analyzeWorkflowMedia({ model: 'vapeur-gpt-5.5', images: [{ data: 'abc', name: 'look.png', mimeType: 'image/png' }], targetType: 'image' }, async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ model: 'gpt-5.5-test', choices: [{ message: { content: '商业棚拍提示词' } }] }) };
  });
  assert.equal(captured.url, 'https://example.com/v1/chat/completions');
  assert.equal(captured.body.messages[1].content[2].type, 'image_url');
  assert.equal(result.content, '商业棚拍提示词');
  assert.equal(result.imageCount, 1);
});

test('resolveMediaAnalysisModel only permits supported Gemini and GPT aliases', () => {
  process.env.VAPEUR_GEMINI_FAST_MODEL = 'gemini-fast-test';
  process.env.VAPEUR_GEMINI_PRO_MODEL = 'gemini-pro-test';
  assert.deepEqual(resolveMediaAnalysisModel('vapeur-gemini-3.5-flash'), { model: 'gemini-fast-test', provider: 'Gemini' });
  assert.deepEqual(resolveMediaAnalysisModel('vapeur-gemini-3.1-pro'), { model: 'gemini-pro-test', provider: 'Gemini' });
  assert.equal(resolveMediaAnalysisModel('untrusted-client-model').model, 'gemini-fast-test');
});

test('analyzeWorkflowMedia sends Gemini alias without GPT-only reasoning field', async () => {
  process.env.VAPEUR_API_KEY = 'test-key';
  process.env.VAPEUR_BASE_URL = 'https://example.com/v1';
  process.env.VAPEUR_GEMINI_FAST_MODEL = 'gemini-fast-test';
  let body;
  const result = await analyzeWorkflowMedia({ model: 'vapeur-gemini-3.5-flash', images: [{ data: 'abc', name: 'clip.png', mimeType: 'image/png' }] }, async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ model: 'gemini-fast-test', choices: [{ message: { content: '视频提示词' } }] }) };
  });
  assert.equal(body.model, 'gemini-fast-test');
  assert.equal('reasoning_effort' in body, false);
  assert.equal(result.content, '视频提示词');
});

test('analyzeWorkflowMedia keeps the selected GPT model on an upstream 5xx', async () => {
  process.env.VAPEUR_API_KEY = 'test-key';
  process.env.VAPEUR_BASE_URL = 'https://example.com/v1';
  process.env.VAPEUR_TEXT_MODEL = 'gpt-failing-test';
  process.env.VAPEUR_GEMINI_PRO_MODEL = 'gemini-fallback-test';
  const models = [];
  await assert.rejects(() => analyzeWorkflowMedia({ model: 'vapeur-gpt-5.5', images: [{ data: 'abc', name: 'clip.png', mimeType: 'image/png' }] }, async (_url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);
    return { ok: false, status: 502, json: async () => ({ message: 'upstream timeout' }) };
  }), /upstream timeout/);
  assert.deepEqual(models, ['gpt-failing-test']);
});

test('analyzeWorkflowMedia keeps Gemini Pro selected instead of switching to Flash', async () => {
  process.env.VAPEUR_API_KEY = 'test-key';
  process.env.VAPEUR_BASE_URL = 'https://example.com/v1';
  process.env.VAPEUR_GEMINI_PRO_MODEL = 'gemini-pro-timeout-test';
  process.env.VAPEUR_GEMINI_FAST_MODEL = 'gemini-fast-recovery-test';
  const models = [];
  await assert.rejects(() => analyzeWorkflowMedia({ model: 'vapeur-gemini-3.1-pro', images: [{ data: 'abc', name: 'clip.png', mimeType: 'image/png' }] }, async (_url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);
    return { ok: false, status: 504, json: async () => ({ message: 'upstream timeout' }) };
  }), /upstream timeout/);
  assert.deepEqual(models, ['gemini-pro-timeout-test']);
});

