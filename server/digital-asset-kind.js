export const DIGITAL_ASSET_KINDS = Object.freeze([
  "face",
  "person",
  "clothing",
  "avatar",
  "template_original",
]);

export const isDigitalAssetKind = (kind) =>
  DIGITAL_ASSET_KINDS.includes(String(kind || ""));

export const isDigitalAssetImageCountValid = (kind, count) => {
  const imageCount = Number(count);
  if (!Number.isInteger(imageCount) || imageCount < 1) return false;
  return imageCount <= (["avatar", "template_original"].includes(String(kind || "")) ? 1 : 4);
};

export const isKlingConvertibleDigitalAssetKind = (kind) =>
  ["face", "person", "clothing"].includes(String(kind || ""));

