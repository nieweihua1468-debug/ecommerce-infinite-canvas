export function canonicalSeedanceAssetId(value) {
  return String(value || '').trim().replace(/^asset:\/\//, '');
}

export function isSeedancePrivacyImageError(error) {
  const code = String(error?.payload?.error?.code || error?.code || '');
  const message = String(error?.payload?.error?.message || error?.message || '');
  return code === 'InputImageSensitiveContentDetected.PrivacyInformation'
    || /input image may contain real person|检测到真人|真人素材/i.test(message);
}

export function isNoFaceAssetError(error) {
  const code = String(error?.code || error?.payload?.Error?.Code || '');
  const message = String(error?.message || error?.payload?.Error?.Message || '');
  return /^(?:NoFace|FaceNotFound|FaceNotDetected|InvalidFace)$/i.test(code)
    || /(?:no|not).*face|face.*(?:not found|not detected)|未检测到.*人脸|无人脸/i.test(message);
}

export function uniqueSeedanceAssets(values) {
  const seen = new Set();
  return (values || []).filter((asset) => {
    const key = canonicalSeedanceAssetId(asset?.uri);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

