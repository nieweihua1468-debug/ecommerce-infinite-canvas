import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generationErrorDetails,
  generationErrorMessage,
} from './generation-error-message.js';

test('maps a real-person reference video to the motion-control recovery path', () => {
  assert.equal(
    generationErrorMessage(Object.assign(new Error("The request failed because the input video 'content[2]' may contain real person."), { status: 403 })),
    '第 3 项输入素材中的动作参考视频检测到真人。Seedance 真人资产只认证人物图片；舞蹈动作模仿请把视频节点切换为“Kling 3.0 动作控制”，再连接人物图和舞蹈视频。',
  );
});

test('keeps image-person policy failures on the trusted-person recovery path', () => {
  assert.equal(
    generationErrorMessage(Object.assign(new Error('The request failed because the input image may contain real person.'), { status: 403 })),
    '输入素材检测到真人，请改用“已认证真人”模式并完成授权，或更换为非真人素材。',
  );
});

test('classifies pixels, audio and timeouts with recovery details', () => {
  assert.match(generationErrorMessage(new Error('image data 3 failed: Image exceeds the maximum allowed total pixels. Maximum allowed: 36000000 pixels.')), /第 3 张图片.*3600 万/);
  assert.match(generationErrorMessage(new Error('content[2] audio duration must be less than or equal to 15.2')), /第 3 项.*15.2 秒/);
  assert.match(generationErrorMessage(Object.assign(new Error('Gateway Timeout'), { status: 504 })), /额度已自动退回/);
});

test('explains incompatible reference encoding with an actionable recovery path', () => {
  assert.equal(
    generationErrorMessage(new Error('Invalid image file or mode for image 2')),
    '第 2 张参考图片的颜色模式、方向信息或文件编码不兼容。平台会自动转为标准 JPG/PNG；请从失败节点重新生成。',
  );
});

test('persists a structured and retryable rate-limit reason without exposing payloads', () => {
  const details = generationErrorDetails(
    Object.assign(new Error('Too many requests'), {
      status: 429,
      code: 'rate_limit_exceeded',
      payload: { secret: 'must-not-be-returned' },
    }),
  );

  assert.deepEqual(details, {
    category: 'rate_limit',
    retryable: true,
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: '模型请求过于频繁，请稍后再试。',
  });
  assert.equal(JSON.stringify(details).includes('must-not-be-returned'), false);
});

test('classifies validation and provider outages with correct retry guidance', () => {
  assert.equal(
    generationErrorDetails(Object.assign(new Error('invalid parameter'), { status: 400 })).retryable,
    false,
  );
  assert.equal(
    generationErrorDetails(Object.assign(new Error('service unavailable'), { status: 503 })).retryable,
    true,
  );
  assert.equal(
    generationErrorDetails(Object.assign(new Error('input image may contain real person'), { status: 403 })).category,
    'policy',
  );
});

