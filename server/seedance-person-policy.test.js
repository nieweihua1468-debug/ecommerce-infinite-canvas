import test from 'node:test';
import assert from 'node:assert/strict';
import { seedanceSubmissionImage } from './seedance-person-policy.js';

test('removes a trusted-person source image from the direct Seedance image input', () => {
  assert.equal(seedanceSubmissionImage({ trustedPerson: true, seedance: true, image: 'face-bytes' }), undefined);
  assert.equal(seedanceSubmissionImage({ trustedPerson: false, seedance: true, image: 'product-bytes' }), 'product-bytes');
});

test('requires an uploaded image and Seedance model for trusted-person mode', () => {
  assert.throws(() => seedanceSubmissionImage({ trustedPerson: true, seedance: true, image: '' }), /需要上传/);
  assert.throws(() => seedanceSubmissionImage({ trustedPerson: true, seedance: false, image: 'face-bytes' }), /仅支持 Seedance/);
});

