import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRefineMessages, buildTextGenerationMessages } from './deepseek.js';

test('builds an image-to-video refinement brief with runtime settings', () => {
  const messages = buildRefineMessages({
    prompt: '模特走秀',
    duration: 9,
    multiShot: false,
    sourceType: 'image',
    aspectRatio: '9:16',
    targetModel: 'kling-v3-omni',
    framework: '优先保持服装一致性',
  });
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /图生视频/);
  assert.match(messages[1].content, /9 秒/);
  assert.match(messages[1].content, /9:16/);
  assert.match(messages[1].content, /单一连续镜头/);
  assert.match(messages[1].content, /模特走秀/);
  assert.match(messages[1].content, /kling-v3-omni/);
  assert.match(messages[0].content, /优先保持服装一致性/);
});

test('builds a text-to-video refinement brief when no source image exists', () => {
  const messages = buildRefineMessages({ prompt: '雨夜街道', sourceType: 'text' });
  assert.match(messages[1].content, /文生视频/);
});

test('builds a GPT Image 2 refinement brief without video-only directions', () => {
  const messages = buildRefineMessages({
    prompt: '模特穿白色西装站在影棚',
    sourceType: 'image-edit',
    targetModel: 'gpt-image-2',
    referenceCount: 3,
    aspectRatio: '9:16',
    resolution: '2k',
    quality: 'high',
    framework: '保持人物与服装一致',
  });
  assert.match(messages[0].content, /广告图片提示词导演/);
  assert.match(messages[0].content, /不要加入视频时长、运镜、分镜/);
  assert.match(messages[1].content, /参考图编辑（3 张参考图/);
  assert.match(messages[1].content, /9:16/);
  assert.match(messages[1].content, /2k/);
  assert.match(messages[1].content, /high/);
  assert.doesNotMatch(messages[1].content, /镜头：/);
});

test('builds a workflow text node request with ordered upstream text', () => {
  const messages = buildTextGenerationMessages({
    instruction: '合成为一段商品卖点文案',
    inputs: ['轻量羽绒服', '适合通勤'],
    maxLength: 600,
  });
  assert.match(messages[0].content, /工作流中的文本处理节点/);
  assert.match(messages[0].content, /最多 600/);
  assert.match(messages[1].content, /合成为一段商品卖点文案/);
  assert.match(messages[1].content, /轻量羽绒服/);
  assert.match(messages[1].content, /适合通勤/);
});

