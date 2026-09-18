import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { buildMotionControlBody, buildOmniBody, buildTurboImageToVideoBody, createAdvancedElement, createCustomVoice, createKlingToken, getVideoTask, normalizeKlingTask, submitMotionControl, submitOmniVideo, submitTurboImageToVideo, submitVideo } from './kling.js';

test('creates a 30 minute HS256 token with a five second nbf allowance', () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  const token = createKlingToken(1_700_000_000);
  const decoded = jwt.verify(token, 'test-secret-key', {
    algorithms: ['HS256'],
    clockTimestamp: 1_700_000_000,
  });
  assert.equal(decoded.iss, 'test-access-key');
  assert.equal(decoded.exp, 1_700_001_800);
  assert.equal(decoded.nbf, 1_699_999_995);
});

test('retries transient Kling task reads without failing the local task', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  process.env.KLING_RETRY_BASE_MS = '0';
  const originalFetch = global.fetch;
  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_status: 'processing' } }) };
  };
  try {
    const payload = await getVideoTask('retry-read', 'image2video');
    assert.equal(payload.data.task_status, 'processing');
    assert.equal(attempts, 2);
  } finally {
    global.fetch = originalFetch;
    delete process.env.KLING_RETRY_BASE_MS;
  }
});

test('retries an idempotent V3 submission with the same Element binding', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  process.env.KLING_RETRY_BASE_MS = '0';
  const originalFetch = global.fetch;
  const bodies = [];
  global.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_id: 'retry-submit' } }) };
  };
  try {
    const result = await submitVideo({
      image: 'frame',
      prompt: '保持主体一致',
      externalTaskId: 'lf-idempotent-task',
      elementIds: ['123456'],
    });
    assert.equal(result.taskId, 'retry-submit');
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(bodies[1].external_task_id, 'lf-idempotent-task');
    assert.deepEqual(bodies[1].element_list, [{ element_id: 123456 }]);
  } finally {
    global.fetch = originalFetch;
    delete process.env.KLING_RETRY_BASE_MS;
  }
});

test('does not retry a submission that has no idempotency key', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  process.env.KLING_RETRY_BASE_MS = '0';
  const originalFetch = global.fetch;
  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
  };
  try {
    await assert.rejects(() => submitVideo({ prompt: '没有幂等任务号' }), /fetch failed/);
    assert.equal(attempts, 1);
  } finally {
    global.fetch = originalFetch;
    delete process.env.KLING_RETRY_BASE_MS;
  }
});

test('normalizes a succeeded Kling task and selects the first video', () => {
  const result = normalizeKlingTask({
    data: {
      task_status: 'succeed',
      task_result: { videos: [{ url: 'https://example.com/result.mp4', cover_url: 'https://example.com/cover.jpg' }] },
    },
  });
  assert.deepEqual(result, {
    status: 'succeeded',
    videoUrl: 'https://example.com/result.mp4',
    coverUrl: 'https://example.com/cover.jpg',
    error: null,
    rawStatus: 'succeed',
  });
});

test('normalizes processing and failed states', () => {
  assert.equal(normalizeKlingTask({ data: { task_status: 'processing' } }).status, 'processing');
  const failed = normalizeKlingTask({ data: { task_status: 'failed', task_status_msg: 'Failure to pass the risk control system' } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, '内容未通过模型安全审核，请调整提示词或更换素材后重试。');
});

test('routes optional image tasks to the correct Kling endpoint with adjustable settings', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_id: `task-${calls.length}` } }) };
  };
  try {
    const textTask = await submitVideo({ prompt: '雨夜', duration: 8, mode: 'std', cfgScale: 0.5, aspectRatio: '9:16', multiShot: false });
    const imageTask = await submitVideo({ image: 'base64', prompt: '走秀', duration: 12, mode: 'pro', cfgScale: 0.8, multiShot: true });
    assert.equal(textTask.taskType, 'text2video');
    assert.equal(imageTask.taskType, 'image2video');
    assert.equal(calls[0].url, 'https://kling.test/v1/videos/text2video');
    assert.equal(calls[0].body.duration, '8');
    assert.equal(calls[0].body.aspect_ratio, '9:16');
    assert.equal(calls[0].body.multi_shot, false);
    assert.equal(calls[1].url, 'https://kling.test/v1/videos/image2video');
    assert.equal(calls[1].body.image, 'base64');
    assert.equal(calls[1].body.cfg_scale, 0.8);
    assert.equal(calls[1].body.shot_type, 'intelligence');
  } finally {
    global.fetch = originalFetch;
  }
});

test('builds V3 tail-frame, sound, negative prompt and custom-shot options', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const originalFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => { body = JSON.parse(options.body); return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_id: 'v3-advanced' } }) }; };
  try {
    await submitVideo({ image: 'first', imageTail: 'last', prompt: 'unused', negativePrompt: 'no watermark', duration: 5, sound: 'on', elementIds: ['123456'], multiShot: true, shotType: 'customize', multiPrompt: [{ prompt: '开场', duration: 2 }, { prompt: '结尾', duration: 3 }] });
    assert.equal(body.image_tail, 'last');
    assert.equal(body.sound, 'on');
    assert.equal(body.negative_prompt, 'no watermark');
    assert.equal(body.shot_type, 'customize');
    assert.equal(body.multi_prompt.length, 2);
    assert.equal(body.prompt, '');
    assert.deepEqual(body.element_list, [{ element_id: 123456 }]);
  } finally { global.fetch = originalFetch; }
});

test('creates a Kling advanced image element with voice and clothing tag', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const originalFetch = global.fetch;
  let call;
  global.fetch = async (url, options) => { call = { url, body: JSON.parse(options.body) }; return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_id: 'element-task' } }) }; };
  try {
    await createAdvancedElement({ elementName: '黑色连衣裙', elementDescription: '保持版型和材质', referenceType: 'image_refer', elementImageList: { frontal_image: 'front', refer_images: [{ image_url: 'side' }] }, elementVoiceId: 'voice-1', tags: [{ tag_id: 'o_105' }] });
    assert.equal(call.url, 'https://kling.test/v1/general/advanced-custom-elements');
    assert.equal(call.body.reference_type, 'image_refer');
    assert.deepEqual(call.body.element_image_list, { frontal_image: 'front', refer_images: [{ image_url: 'side' }] });
    assert.equal(call.body.element_voice_id, 'voice-1');
    assert.deepEqual(call.body.tag_list, [{ tag_id: 'o_105' }]);
  } finally { global.fetch = originalFetch; }
});

test('builds a Kling 3.0 Omni multi-modal request with custom shots', () => {
  const body = buildOmniBody({
    image: 'base64-main',
    referenceImages: [{ data: 'base64-reference' }],
    elementIds: ['123456'],
    prompt: '完整创意描述',
    duration: 5,
    mode: 'pro',
    cfgScale: 0.8,
    aspectRatio: '9:16',
    sound: 'on',
    multiShot: true,
    shotType: 'customize',
    multiPrompt: [
      { index: 1, prompt: '第一镜头', duration: 2 },
      { index: 2, prompt: '第二镜头', duration: 3 },
    ],
  });
  assert.equal(body.model_name, 'kling-v3-omni');
  assert.deepEqual(body.image_list, [{ image_url: 'base64-main' }, { image_url: 'base64-reference' }]);
  assert.deepEqual(body.element_list, [{ element_id: 123456 }]);
  assert.equal(body.prompt, '');
  assert.equal(body.multi_prompt.length, 2);
  assert.equal(body.sound, 'on');
  assert.equal(body.duration, '5');
  assert.equal(body.cfg_scale, 0.8);
});

test('enforces Omni video and custom-shot compatibility rules', () => {
  assert.throws(() => buildOmniBody({
    prompt: '编辑视频',
    videoUrls: [{ url: 'https://example.com/source.mp4', referType: 'base' }],
    multiShot: true,
    duration: 5,
  }), /不支持多镜头/);
  assert.throws(() => buildOmniBody({
    prompt: '多镜头',
    multiShot: true,
    shotType: 'customize',
    duration: 5,
    multiPrompt: [{ prompt: '只有三秒', duration: 3 }],
  }), /时长之和/);
});

test('submits Omni tasks through the dedicated endpoint', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_id: 'omni-task' } }) };
  };
  try {
    const task = await submitOmniVideo({ prompt: '城市走秀', duration: 15, aspectRatio: '9:16', sound: 'off' });
    assert.equal(task.taskType, 'omni-video');
    assert.equal(calls[0].url, 'https://kling.test/v1/videos/omni-video');
    assert.equal(calls[0].body.model_name, 'kling-v3-omni');
    assert.equal(calls[0].body.shot_type, 'intelligence');
  } finally {
    global.fetch = originalFetch;
  }
});

test('builds Kling 3.0 Turbo first-frame request with all supported options', () => {
  const body = buildTurboImageToVideoBody({ image: 'base64-first-frame', prompt: '模特自然向前走', duration: 12, resolution: '1080p', callbackUrl: 'https://example.com/callback', externalTaskId: 'campaign-1', watermark: true });
  assert.deepEqual(body.contents, [{ type: 'prompt', text: '模特自然向前走' }, { type: 'first_frame', url: 'base64-first-frame' }]);
  assert.deepEqual(body.settings, { resolution: '1080p', duration: 12 });
  assert.deepEqual(body.options, { callback_url: 'https://example.com/callback', external_task_id: 'campaign-1', watermark_info: { enabled: true } });
  assert.throws(() => buildTurboImageToVideoBody({ prompt: '没有首帧' }), /必须提供首帧图片/);
  assert.throws(() => buildTurboImageToVideoBody({ image: 'frame', prompt: '错误分辨率', resolution: '4k' }), /720P 或 1080P/);
});

test('submits Kling 3.0 Turbo through its dedicated endpoint', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const originalFetch = global.fetch;
  let call;
  global.fetch = async (url, options) => {
    call = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { id: 'turbo-task', status: 'submitted' } }) };
  };
  try {
    const task = await submitTurboImageToVideo({ image: 'first', prompt: '走秀', duration: 5, resolution: '720p' });
    assert.equal(task.taskId, 'turbo-task');
    assert.equal(task.taskType, 'turbo-image2video');
    assert.equal(call.url, 'https://kling.test/image-to-video/kling-3.0-turbo');
    assert.equal(call.body.settings.resolution, '720p');
  } finally { global.fetch = originalFetch; }
});

test('builds a Kling motion-control dance request with orientation and original sound', () => {
  const body = buildMotionControlBody({
    image: 'data:image/png;base64,person-image',
    videoUrl: 'https://example.com/dance.mp4',
    prompt: '保持人物身份与服装稳定，精准复现舞蹈动作',
    mode: 'pro',
    characterOrientation: 'video',
    keepOriginalSound: true,
  });
  assert.deepEqual(body, {
    image_url: 'person-image',
    video_url: 'https://example.com/dance.mp4',
    prompt: '保持人物身份与服装稳定，精准复现舞蹈动作',
    mode: 'pro',
    keep_original_sound: 'yes',
    character_orientation: 'video',
  });
  assert.throws(() => buildMotionControlBody({ image: 'person', videoUrl: 'not-public' }), /公开访问/);
  assert.throws(() => buildMotionControlBody({ image: 'person', videoUrl: 'https://example.com/dance.mp4', characterOrientation: 'side' }), /人物朝向/);
});

test('submits and queries Kling motion-control tasks through dedicated endpoints', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: options.body ? { task_id: 'motion-task' } : { task_status: 'processing' } }) };
  };
  try {
    const submitted = await submitMotionControl({ image: 'person', videoUrl: 'https://example.com/dance.mp4', prompt: '跳舞' });
    assert.equal(submitted.taskType, 'motion-control');
    assert.equal(calls[0].url, 'https://kling.test/v1/videos/motion-control');
    await getVideoTask('motion-task', 'motion-control');
    assert.equal(calls[1].url, 'https://kling.test/v1/videos/motion-control/motion-task');
  } finally { global.fetch = originalFetch; }
});

test('normalizes Kling Turbo task-list results', () => {
  const task = normalizeKlingTask({ data: { tasks: [{ id: 'turbo-task', status: 'success', output: { video_url: 'https://example.com/turbo.mp4' } }] } });
  assert.equal(task.status, 'succeeded');
  assert.equal(task.videoUrl, 'https://example.com/turbo.mp4');
});

test('queries Kling 3.0 Turbo tasks through the shared task endpoint', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const originalFetch = global.fetch;
  let requestUrl;
  global.fetch = async (url) => {
    requestUrl = url;
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: [{ id: 'turbo-task', status: 'processing' }] }) };
  };
  try {
    const payload = await getVideoTask('turbo-task', 'turbo-image2video');
    const task = normalizeKlingTask(payload);
    assert.equal(requestUrl, 'https://kling.test/tasks?task_ids=turbo-task');
    assert.equal(task.status, 'processing');
  } finally { global.fetch = originalFetch; }
});

test('creates a Kling custom voice from a public media URL', async () => {
  process.env.KLING_ACCESS_KEY = 'test-access-key';
  process.env.KLING_SECRET_KEY = 'test-secret-key';
  process.env.KLING_BASE_URL = 'https://kling.test';
  const originalFetch = global.fetch;
  let call;
  global.fetch = async (url, options) => {
    call = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 0, data: { task_id: 'voice-task' } }) };
  };
  try {
    await createCustomVoice({ voiceName: '主播音色', voiceUrl: 'https://example.com/voice.mp3' });
    assert.equal(call.url, 'https://kling.test/v1/general/custom-voices');
    assert.deepEqual(call.body, { voice_name: '主播音色', voice_url: 'https://example.com/voice.mp3' });
  } finally { global.fetch = originalFetch; }
});

