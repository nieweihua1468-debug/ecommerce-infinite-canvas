import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoAudioSource, parseFfmpegDuration, seedanceAudioMaxDuration } from './audio-normalize.js';

test('caps Seedance reference audio at the video duration and never above 15 seconds', () => {
  assert.equal(seedanceAudioMaxDuration(7), 7);
  assert.equal(seedanceAudioMaxDuration(15), 15);
  assert.equal(seedanceAudioMaxDuration(30), 15);
  assert.equal(seedanceAudioMaxDuration('invalid'), 15);
});

test('recognizes supported video containers as audio-track sources', () => {
  assert.equal(isVideoAudioSource('video/mp4'), true);
  assert.equal(isVideoAudioSource('video/quicktime'), true);
  assert.equal(isVideoAudioSource('video/webm'), true);
  assert.equal(isVideoAudioSource('video/x-m4v'), true);
  assert.equal(isVideoAudioSource('audio/mpeg'), false);
});

test('parses a media duration from ffmpeg metadata when ffprobe is unavailable', () => {
  assert.equal(parseFfmpegDuration('Duration: 00:01:15.25, start: 0.000000'), 75.25);
  assert.equal(parseFfmpegDuration('no duration available'), 0);
});

