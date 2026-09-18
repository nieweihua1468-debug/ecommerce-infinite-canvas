import test from 'node:test';
import assert from 'node:assert/strict';
import { seedanceVideoTargetBitrate } from './video-normalize.js';

test('chooses a bounded bitrate that keeps a Seedance reference video below the safe size', () => {
  assert.equal(seedanceVideoTargetBitrate({ duration: 15, maxBytes: 18 * 1024 * 1024 }), 6000);
  assert.equal(seedanceVideoTargetBitrate({ duration: 15, maxBytes: 2 * 1024 * 1024 }), 990);
  assert.equal(seedanceVideoTargetBitrate({ duration: 1, maxBytes: 100 * 1024 }), 700);
});

