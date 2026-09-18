export function isTemplateLibraryVideoTemplate(item) {
  return (
    item?.type === "video-template" &&
    item?.source?.platform === "桌面扁平无视频版"
  );
}

