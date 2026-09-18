import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planMotionSegments, probeMediaDuration, stitchMotionResults } from './motion-control-long.js';

test('plans a 15 second motion reference as three balanced API segments', () => {
  const plan = planMotionSegments(15);
  assert.deepEqual(plan, [
    { index: 1, start: 0, duration: 5 },
    { index: 2, start: 5, duration: 5 },
    { index: 3, start: 10, duration: 5 },
  ]);
});

test('keeps every motion segment inside the 3 to 5 second safe window', () => {
  for (const duration of [5.94, 7.08, 10, 14.542, 29.8]) {
    const plan = planMotionSegments(duration);
    assert.ok(plan.every((item) => item.duration >= 3 && item.duration <= 5.001));
    assert.equal(Number((plan.at(-1).start + plan.at(-1).duration).toFixed(2)), Number(duration.toFixed(2)));
  }
});

test('reads an ffprobe duration through the injected process runner', async () => {
  const duration = await probeMediaDuration('/tmp/example.mp4', async (command, args) => {
    assert.equal(command, 'ffprobe');
    assert.equal(args.at(-1), '/tmp/example.mp4');
    return { stdout: '14.542000\n' };
  });
  assert.equal(duration, 14.542);
});

test('rejects a private provider result before downloading or invoking ffmpeg', async () => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-motion-safe-'));
  let fetchCalls = 0;
  let execCalls = 0;
  try {
    await assert.rejects(
      stitchMotionResults({
        videoUrls: ['http://127.0.0.1/private.mp4'],
        generatedDir,
        publicBaseUrl: 'https://studio.example.test',
        taskId: 'private-provider-result',
        expectedDuration: 5,
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error('must not be called');
        },
        exec: async () => {
          execCalls += 1;
          throw new Error('must not be called');
        },
      }),
      { code: 'EXTERNAL_MEDIA_URL_REJECTED', status: 400 },
    );
    assert.equal(fetchCalls, 0);
    assert.equal(execCalls, 0);
  } finally {
    await fs.rm(generatedDir, { recursive: true, force: true });
  }
});

