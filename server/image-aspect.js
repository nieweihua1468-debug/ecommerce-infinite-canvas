export function centeredCropForAspectRatio(width, height, aspectRatio = "") {
  const [ratioWidth, ratioHeight] = String(aspectRatio)
    .split(":")
    .map(Number);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(ratioWidth) ||
    !Number.isFinite(ratioHeight) ||
    ratioWidth <= 0 ||
    ratioHeight <= 0
  )
    return null;

  const targetRatio = ratioWidth / ratioHeight;
  const currentRatio = width / height;
  if (Math.abs(currentRatio - targetRatio) / targetRatio < 0.002)
    return {
      width,
      height,
      x: 0,
      y: 0,
      changed: false,
    };

  if (currentRatio > targetRatio) {
    const cropWidth = Math.max(2, Math.floor(height * targetRatio));
    return {
      width: cropWidth,
      height,
      x: Math.max(0, Math.floor((width - cropWidth) / 2)),
      y: 0,
      changed: true,
    };
  }

  const cropHeight = Math.max(2, Math.floor(width / targetRatio));
  return {
    width,
    height: cropHeight,
    x: 0,
    y: Math.max(0, Math.floor((height - cropHeight) / 2)),
    changed: true,
  };
}

