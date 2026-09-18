const stripDataUri = (value) =>
  String(value || "").replace(
    /^data:(?:image|video|audio)\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );

export function videoRecoveryInput(item = {}) {
  const {
    image: _image,
    imageTail: _imageTail,
    referenceImages: _referenceImages,
    videos: _videos,
    audios: _audios,
    ...input
  } = item;
  return input;
}

export function videoRecoveryAssets(item = {}) {
  const image = stripDataUri(item.image);
  const imageTail = stripDataUri(item.imageTail);
  const referenceImages = Array.isArray(item.referenceImages)
    ? item.referenceImages
    : [];
  const videos = Array.isArray(item.videos) ? item.videos : [];
  const audios = Array.isArray(item.audios) ? item.audios : [];
  return {
    ...(image
      ? {
          "video-primary": [
            {
              type: "image",
              data: image,
              name: String(item.fileName || "主图"),
              mimeType: String(item.imageMimeType || "image/png"),
            },
          ],
        }
      : {}),
    ...(imageTail
      ? {
          "video-tail": [
            {
              type: "image",
              data: imageTail,
              name: "尾帧",
              mimeType: String(item.imageTailMimeType || "image/png"),
            },
          ],
        }
      : {}),
    ...(referenceImages.length
      ? {
          "video-images": referenceImages.map((asset, index) => ({
            type: "image",
            data: stripDataUri(asset?.data),
            name: String(asset?.name || `参考图 ${index + 1}`),
            mimeType: String(asset?.mimeType || "image/png"),
          })),
        }
      : {}),
    ...(videos.length
      ? {
          "video-references": videos.map((asset, index) => ({
            type: "video",
            data: stripDataUri(asset?.data),
            name: String(asset?.name || `参考视频 ${index + 1}`),
            mimeType: String(asset?.mimeType || "video/mp4"),
          })),
        }
      : {}),
    ...(audios.length
      ? {
          "video-audios": audios.map((asset, index) => ({
            type: "audio",
            data: stripDataUri(asset?.data),
            name: String(asset?.name || `参考音频 ${index + 1}`),
            mimeType: String(asset?.mimeType || "audio/mpeg"),
          })),
        }
      : {}),
  };
}

export function restoreVideoRecoveryInput(task, restored = {}) {
  if (!task?.recoveryInput) return null;
  const primary = restored["video-primary"]?.[0];
  const tail = restored["video-tail"]?.[0];
  return {
    ...task.recoveryInput,
    ...(primary
      ? { image: primary.data, imageMimeType: primary.mimeType }
      : {}),
    ...(tail
      ? { imageTail: tail.data, imageTailMimeType: tail.mimeType }
      : {}),
    referenceImages: (restored["video-images"] || []).map((asset, index) => ({
      data: asset.data,
      name: asset.name,
      mimeType: asset.mimeType,
      label: `image_${index + (primary ? 2 : 1)}`,
    })),
    videos: (restored["video-references"] || []).map((asset, index) => ({
      data: asset.data,
      name: asset.name,
      mimeType: asset.mimeType,
      label: `video_${index + 1}`,
    })),
    audios: (restored["video-audios"] || []).map((asset, index) => ({
      data: asset.data,
      name: asset.name,
      mimeType: asset.mimeType,
      label: `voice_${index + 1}`,
    })),
  };
}

export function startupRecoveryAction(task = {}) {
  if (task.status === "submitting" && task.submissionUncertain)
    return "wait-callback";
  if (task.status === "submitting")
    return task.recoveryInput && task.recoveryAssets
      ? "resubmit"
      : "fail-refund";
  if (!["queued", "processing"].includes(task.status)) return "ignore";
  if (task.upstreamTaskId) return "poll";
  if (task.taskType === "image-generation" && task.recoveryInput)
    return "resume-image";
  return "fail-refund";
}

