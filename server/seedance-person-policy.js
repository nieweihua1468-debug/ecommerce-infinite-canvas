export function seedanceSubmissionImage({ trustedPerson, seedance, image }) {
  const normalizedImage = String(image || '');
  if (trustedPerson && !seedance) throw Object.assign(new Error('真人人脸资产模式仅支持 Seedance 2.0'), { status: 400 });
  if (trustedPerson && !normalizedImage) throw Object.assign(new Error('真人人脸模式需要上传一张已获授权的人物图片'), { status: 400 });
  return trustedPerson ? undefined : normalizedImage || undefined;
}

