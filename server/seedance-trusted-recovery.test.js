import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSeedanceAssetId, isNoFaceAssetError, isSeedancePrivacyImageError, uniqueSeedanceAssets } from './seedance-trusted-recovery.js';

test('recognizes the Seedance real-person privacy rejection', () => {
  assert.equal(isSeedancePrivacyImageError({ payload: { error: { code: 'InputImageSensitiveContentDetected.PrivacyInformation' } } }), true);
  assert.equal(isSeedancePrivacyImageError(new Error('The request failed because the input image may contain real person.')), true);
  assert.equal(isSeedancePrivacyImageError(new Error('unrelated failure')), false);
});

test('normalizes and deduplicates asset references', () => {
  assert.equal(canonicalSeedanceAssetId('asset://asset-one'), 'asset-one');
  assert.deepEqual(uniqueSeedanceAssets([
    { uri: 'asset-one' },
    { uri: 'asset://asset-one' },
    { uri: 'asset-two' },
  ]), [{ uri: 'asset-one' }, { uri: 'asset-two' }]);
});

test('recognizes a material that contains no usable face', () => {
  assert.equal(isNoFaceAssetError(Object.assign(new Error('No face detected'), { code: 'FaceNotDetected' })), true);
  assert.equal(isNoFaceAssetError(Object.assign(new Error('different person'), { code: 'FaceMismatch' })), false);
});

