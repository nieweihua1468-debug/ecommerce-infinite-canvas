import assert from 'node:assert/strict';
import test from 'node:test';
import { generateImage2, isImage2Configured, isVapeurImageConfigured, prepareReferenceImage, prepareSeedanceImage, readImageDimensions } from './image2.js';

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function lossyWebpHeader(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.set([0x9d, 0x01, 0x2a], 23);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

test('detects PNG dimensions and downsizes references above the 36 megapixel limit', async () => {
  const source = pngHeader(5504, 8256);
  assert.deepEqual(readImageDimensions(source), { width: 5504, height: 8256 });
  let resizeRequest;
  const prepared = await prepareReferenceImage({ data: source.toString('base64'), mimeType: 'image/png', name: 'oversized.png' }, async (input) => {
    resizeRequest = input;
    return { buffer: Buffer.from('resized'), mimeType: 'image/png', name: 'oversized.png', width: 4828, height: 7244 };
  });
  assert.equal(resizeRequest.width, 5504);
  assert.equal(resizeRequest.height, 8256);
  assert.equal(prepared.resized, true);
  assert.deepEqual(prepared.originalDimensions, { width: 5504, height: 8256 });
  assert.ok(prepared.dimensions.width * prepared.dimensions.height < 36_000_000);
});

test('detects dimensions in ordinary lossy WebP files', () => {
  assert.deepEqual(readImageDimensions(lossyWebpHeader(1920, 1080)), { width: 1920, height: 1080 });
});

test('optimizes Seedance images when either pixels or file bytes exceed the safe limit', async () => {
  const pixelHeavy = pngHeader(5504, 8256);
  const optimizedPixels = await prepareSeedanceImage({ data: pixelHeavy.toString('base64'), mimeType: 'image/png', name: 'pixel-heavy.png' }, async (input) => ({ buffer: Buffer.from('optimized'), mimeType: 'image/jpeg', name: 'pixel-heavy.jpg', width: 4830, height: 7244 }));
  assert.equal(optimizedPixels.resized, true);
  assert.equal(optimizedPixels.compressed, true);
  assert.deepEqual(optimizedPixels.originalDimensions, { width: 5504, height: 8256 });

  const byteHeavy = Buffer.alloc(18 * 1024 * 1024 + 1);
  pngHeader(4000, 4000).copy(byteHeavy);
  const optimizedBytes = await prepareSeedanceImage({ data: byteHeavy.toString('base64'), mimeType: 'image/png', name: 'byte-heavy.png' }, async () => ({ buffer: Buffer.from('optimized'), mimeType: 'image/jpeg', name: 'byte-heavy.jpg', width: 4000, height: 4000 }));
  assert.equal(optimizedBytes.resized, false);
  assert.equal(optimizedBytes.compressed, true);
  assert.equal(optimizedBytes.originalBytes, byteHeavy.length);
});

test('Image2 generation uses the OpenAI-compatible request shape', async () => {
  process.env.IMAGE2_API_KEY = 'test-key';
  process.env.IMAGE2_BASE_URL = 'https://image.test/v1';
  process.env.IMAGE2_MODEL = 'gpt-image-2';
  let call;
  const result = await generateImage2({ prompt: 'fashion editorial', size: '1024x1536', quality: 'medium', outputFormat: 'webp', n: 2 }, async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(call.url, 'https://image.test/v1/images/generations');
  const body = JSON.parse(call.options.body);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.quality, 'medium');
  assert.equal(body.output_format, 'webp');
  assert.equal(result.images[0].base64, 'abc');
  assert.equal(isImage2Configured(), true);
  delete process.env.IMAGE2_API_KEY;
});

test('Image2 rejects a third-party key when its gateway is still the OpenAI endpoint', async () => {
  process.env.IMAGE2_API_KEY = 'sk-toviz-example';
  process.env.IMAGE2_BASE_URL = 'https://api.openai.com/v1';
  await assert.rejects(
    () => generateImage2({ prompt: 'fashion editorial' }),
    /Image2 网关地址未配置/,
  );
  assert.equal(isImage2Configured(), false);
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
});

test('Image2 never exposes an upstream API key error to the client', async () => {
  process.env.IMAGE2_API_KEY = 'third-party-key';
  process.env.IMAGE2_BASE_URL = 'https://image.test/v1';
  await assert.rejects(
    () => generateImage2({ prompt: 'fashion editorial' }, async () => new Response(JSON.stringify({
      error: { message: 'Incorrect API key provided: third-party-key' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })),
    (error) => error.message === '图片模型鉴权失败，请联系管理员检查 Image2 网关与密钥配置' && !error.message.includes('third-party-key'),
  );
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
});

test('Image2 serial retry recovers from a temporary provider rate limit', async () => {
  process.env.IMAGE2_API_KEY = 'retry-test-key';
  process.env.IMAGE2_BASE_URL = 'https://image.test/v1';
  let attempts = 0;
  const result = await generateImage2({ prompt: 'fashion editorial' }, async () => {
    attempts += 1;
    if (attempts === 1) return new Response(JSON.stringify({ message: 'rate limit' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } });
    return new Response(JSON.stringify({ data: [{ b64_json: 'recovered' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(attempts, 2);
  assert.equal(result.images[0].base64, 'recovered');
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
});

test('Image2 keeps retrying a short provider rate-limit burst', async () => {
  process.env.IMAGE2_API_KEY = 'retry-burst-key';
  process.env.IMAGE2_BASE_URL = 'https://image.test/v1';
  let attempts = 0;
  const result = await generateImage2({ prompt: 'fashion editorial' }, async () => {
    attempts += 1;
    if (attempts < 4) return new Response(JSON.stringify({ message: 'rate limit' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } });
    return new Response(JSON.stringify({ data: [{ b64_json: 'recovered-after-burst' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(attempts, 4);
  assert.equal(result.images[0].base64, 'recovered-after-burst');
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
});

test('Image2 uses Azure api-key authentication and supported portrait size', async () => {
  process.env.IMAGE2_API_KEY = 'azure-test-key';
  process.env.IMAGE2_BASE_URL = 'https://resource.services.ai.azure.com/openai/v1';
  process.env.IMAGE2_MODEL = 'gpt-image-2';
  process.env.IMAGE2_ENABLED = 'true';
  let call;
  await generateImage2({ prompt: 'fashion editorial', aspectRatio: '9:16', size: '1024x1792' }, async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({ data: [{ b64_json: 'azure-image' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const body = JSON.parse(call.options.body);
  assert.equal(call.url, 'https://resource.services.ai.azure.com/openai/v1/images/generations');
  assert.equal(call.options.headers['api-key'], 'azure-test-key');
  assert.equal(call.options.headers.Authorization, undefined);
  assert.equal(body.size, '1024x1536');
  assert.equal(body.aspect_ratio, undefined);
  assert.equal(body.resolution, undefined);
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
  delete process.env.IMAGE2_MODEL;
  delete process.env.IMAGE2_ENABLED;
});

test('Azure image edits normalize every reference before submitting it', async () => {
  process.env.IMAGE2_API_KEY = 'azure-test-key';
  process.env.IMAGE2_BASE_URL = 'https://resource.services.ai.azure.com/openai/v1';
  process.env.IMAGE2_MODEL = 'gpt-image-2';
  process.env.IMAGE2_ENABLED = 'true';
  const resizeRequests = [];
  let call;
  const result = await generateImage2({
    prompt: 'keep the person and replace the outfit',
    aspectRatio: '9:16',
    referenceImages: [{
      data: pngHeader(4032, 3024).toString('base64'),
      mimeType: 'image/png',
      name: 'iphone-reference.png',
    }],
  }, async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({ data: [{ b64_json: 'edited-image' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, async (input) => {
    resizeRequests.push(input);
    return {
      buffer: Buffer.from('normalized-image'),
      mimeType: 'image/jpeg',
      name: 'iphone-reference.jpg',
      width: 4032,
      height: 3024,
    };
  });
  assert.equal(call.url, 'https://resource.services.ai.azure.com/openai/v1/images/edits');
  assert.equal(resizeRequests.length, 1);
  assert.equal(call.options.body.getAll('image[]').length, 1);
  assert.equal(result.inputOptimizations[0].normalized, true);
  assert.equal(result.inputOptimizations[0].converted, true);
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
  delete process.env.IMAGE2_MODEL;
  delete process.env.IMAGE2_ENABLED;
});

test('Image2 can be disabled when the provider key lacks model permission', async () => {
  process.env.IMAGE2_API_KEY = 'third-party-key';
  process.env.IMAGE2_BASE_URL = 'https://image.test/v1';
  process.env.IMAGE2_ENABLED = 'false';
  await assert.rejects(() => generateImage2({ prompt: 'fashion editorial' }), /尚未获得 gpt-image-2 模型权限/);
  assert.equal(isImage2Configured(), false);
  delete process.env.IMAGE2_API_KEY;
  delete process.env.IMAGE2_BASE_URL;
  delete process.env.IMAGE2_ENABLED;
});

test('Vapeur image alias uses the Vapeur gateway and upstream model name', async () => {
  process.env.VAPEUR_API_KEY = 'vapeur-test-key';
  process.env.VAPEUR_BASE_URL = 'https://api.vapeur.ai/v1';
  process.env.VAPEUR_IMAGE_MODEL = 'gpt-image-2';
  assert.equal(isVapeurImageConfigured(), true);
  await generateImage2({ model: 'vapeur-gpt-image-2', prompt: 'fashion editorial', aspectRatio: '9:16', size: '1024x1536' }, async (url, options) => {
    assert.equal(url, 'https://api.vapeur.ai/v1/images/generations');
    assert.equal(options.headers.Authorization, 'Bearer vapeur-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-image-2');
    assert.equal(body.aspect_ratio, '9:16');
    return new Response(JSON.stringify({ data: [{ url: 'https://example.com/vapeur.png' }] }), { status: 200 });
  });
  delete process.env.VAPEUR_API_KEY;
  delete process.env.VAPEUR_BASE_URL;
  delete process.env.VAPEUR_IMAGE_MODEL;
});

