import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __test,
  checkVolcengineConnection,
  createAssetGroup,
  normalizeSeedanceTask,
  submitSeedanceVideo,
} from './volcengine.js';

test('creates a deterministic Volcengine HMAC authorization header', () => {
  process.env.VOLCENGINE_ACCESS_KEY_ID = 'test-ak';
  process.env.VOLCENGINE_SECRET_ACCESS_KEY = 'test-sk';
  const signed = __test.signOpenApiRequest('ListEndpoints', '{"PageSize":10}', new Date('2026-07-10T09:00:00.000Z'));
  assert.equal(signed.url, 'https://open.volcengineapi.com/?Action=ListEndpoints&Version=2024-01-01');
  assert.equal(signed.headers['X-Date'], '20260710T090000Z');
  assert.match(signed.headers.Authorization, /^HMAC-SHA256 Credential=test-ak\/20260710\/cn-beijing\/ark\/request/);
  assert.match(signed.headers.Authorization, /SignedHeaders=host;x-content-sha256;x-date/);
});

test('signs the Ark Assets API with content-type in the canonical headers', () => {
  process.env.VOLCENGINE_ACCESS_KEY_ID = 'test-ak';
  process.env.VOLCENGINE_SECRET_ACCESS_KEY = 'test-sk';
  const signed = __test.signAssetApiRequest('GetAssetGroup', '{"Id":"group-test"}', new Date('2026-07-14T05:00:00.000Z'));
  assert.equal(signed.url, 'https://ark.cn-beijing.volcengineapi.com/?Action=GetAssetGroup&Version=2024-01-01');
  assert.match(signed.headers.Authorization, /SignedHeaders=host;x-content-sha256;x-date;content-type/);
  assert.equal(signed.headers['Content-Type'], 'application/json; charset=utf-8');
});

test('creates an AIGC asset group for backend-managed trusted people', async () => {
  process.env.VOLCENGINE_ACCESS_KEY_ID = 'test-ak';
  process.env.VOLCENGINE_SECRET_ACCESS_KEY = 'test-sk';
  process.env.VOLCENGINE_PROJECT_NAME = 'default';
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ Result: { Id: 'group-auto' } }) };
  };
  try {
    const result = await createAssetGroup({ name: 'Commerce Canvas真人-test', description: 'auto' });
    assert.equal(result.Id, 'group-auto');
    assert.match(captured.url, /Action=CreateAssetGroup/);
    assert.deepEqual(captured.body, { Name: 'Commerce Canvas真人-test', ProjectName: 'default', GroupType: 'AIGC', Description: 'auto' });
  } finally {
    global.fetch = originalFetch;
    delete process.env.VOLCENGINE_PROJECT_NAME;
  }
});

test('places a verified person asset before ordinary Seedance references', async () => {
  process.env.VOLCENGINE_ARK_API_KEY = 'test-ark-key';
  process.env.VOLCENGINE_ENDPOINT_ID = 'ep-test';
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    if (String(url).includes('commerce-canvas-credential-probe')) {
      return { ok: false, status: 404, json: async () => ({ message: 'Task not found' }) };
    }
    captured = { url, body: JSON.parse(options.body), authorization: options.headers.Authorization };
    return { ok: true, status: 200, json: async () => ({ id: 'cgt-test' }) };
  };
  try {
    await checkVolcengineConnection();
    const result = await submitSeedanceVideo({
      image: 'abc123',
      prompt: '模特走秀 <<<voice_1>>> 介绍新款',
      duration: 12,
      aspectRatio: '9:16',
      resolution: '1080p',
      generateAudio: true,
      watermark: false,
      referenceImages: [{ data: 'ref456', mimeType: 'image/jpeg', label: 'image_2' }],
      videos: [{ url: 'https://example.com/reference.mp4', mimeType: 'video/mp4', label: 'video_1' }],
      audios: [{ url: 'https://example.com/voice.mp3', mimeType: 'audio/mpeg', label: 'voice_1' }],
      trustedPersonAssets: [{ uri: 'asset-test-1', label: 'reference_image' }],
    });
    assert.equal(result.taskId, 'cgt-test');
    assert.equal(result.taskType, 'seedance');
    assert.equal(captured.url, 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks');
    assert.equal(captured.body.model, 'ep-test');
    assert.equal(captured.body.content[0].text, '模特走秀 <<<voice_1>>> 介绍新款');
    assert.deepEqual(captured.body.content[1], { type: 'image_url', image_url: { url: 'asset://asset-test-1' }, role: 'reference_image' });
    assert.deepEqual(captured.body.content[2], { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' }, role: 'reference_image' });
    assert.deepEqual(captured.body.content[3], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ref456' }, role: 'reference_image' });
    assert.deepEqual(captured.body.content[4], { type: 'video_url', video_url: { url: 'https://example.com/reference.mp4' }, role: 'reference_video' });
    assert.deepEqual(captured.body.content[5], { type: 'audio_url', audio_url: { url: 'https://example.com/voice.mp3' }, role: 'reference_audio' });
    assert.equal(captured.body.resolution, '1080p');
    assert.equal(captured.body.duration, 12);
    assert.equal(captured.body.ratio, 'adaptive');
    assert.equal(captured.body.generate_audio, true);
    assert.equal(captured.body.watermark, false);
    assert.equal(captured.authorization, 'Bearer test-ark-key');
  } finally {
    global.fetch = originalFetch;
    delete process.env.VOLCENGINE_ARK_API_KEY;
  }
});

test('switches between Seedance 2.0 model IDs and forwards official task options', async () => {
  process.env.VOLCENGINE_ARK_API_KEY = 'test-ark-key';
  process.env.VOLCENGINE_ENDPOINT_ID = 'ep-test';
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (_url, options) => {
    if (String(_url).includes('commerce-canvas-credential-probe')) {
      return { ok: false, status: 404, json: async () => ({ message: 'Task not found' }) };
    }
    captured = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ id: 'cgt-model-switch' }) };
  };
  try {
    await submitSeedanceVideo({ modelName: 'doubao-seedance-2-0-260128', prompt: '测试', duration: 5, aspectRatio: '16:9', ratioMode: 'fixed', resolution: '4k', generateAudio: false, watermark: true, callbackUrl: 'https://example.com/callback', returnLastFrame: true });
    assert.equal(captured.model, 'doubao-seedance-2-0-260128');
    assert.equal(captured.content[0].text, '测试');
    assert.equal(captured.resolution, '4k');
    assert.equal(captured.duration, 5);
    assert.equal(captured.ratio, '16:9');
    assert.equal(captured.generate_audio, false);
    assert.equal(captured.watermark, true);
    assert.equal(captured.callback_url, 'https://example.com/callback');
    assert.equal(captured.return_last_frame, true);
    assert.equal(captured.mode, undefined);
    assert.equal(captured.cfgScale, undefined);
    assert.equal(captured.multiShot, undefined);
  } finally {
    global.fetch = originalFetch;
    delete process.env.VOLCENGINE_ARK_API_KEY;
  }
});

test('normalizes a completed Seedance task', () => {
  assert.deepEqual(normalizeSeedanceTask({ status: 'succeeded', content: { video_url: 'https://example.com/video.mp4' } }), {
    status: 'succeeded',
    videoUrl: 'https://example.com/video.mp4',
    coverUrl: null,
    error: null,
    rawStatus: 'succeeded',
  });
});

test('normalizes a failed Seedance task to an actionable Chinese reason', () => {
  const failed = normalizeSeedanceTask({
    status: 'failed',
    error: { message: "The request failed because the input video 'content[2]' may be related to copyright restrictions." },
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, '第 3 项输入素材可能涉及版权限制，请更换为自有版权或已获授权的图片、视频后重试。');
});

test('allows more time for multi-reference Seedance task submission without slowing polling', () => {
  delete process.env.VOLCENGINE_GENERATION_SUBMIT_TIMEOUT_MS;
  delete process.env.VOLCENGINE_RUNTIME_TIMEOUT_MS;
  assert.equal(__test.runtimeRequestTimeout('/contents/generations/tasks', 'POST'), 180_000);
  assert.equal(__test.runtimeRequestTimeout('/contents/generations/tasks/cgt-test', 'GET'), 60_000);

  process.env.VOLCENGINE_GENERATION_SUBMIT_TIMEOUT_MS = '240000';
  process.env.VOLCENGINE_RUNTIME_TIMEOUT_MS = '45000';
  assert.equal(__test.runtimeRequestTimeout('/contents/generations/tasks', 'POST'), 240_000);
  assert.equal(__test.runtimeRequestTimeout('/contents/generations/tasks/cgt-test', 'GET'), 45_000);

  delete process.env.VOLCENGINE_GENERATION_SUBMIT_TIMEOUT_MS;
  delete process.env.VOLCENGINE_RUNTIME_TIMEOUT_MS;
});

