const assetIdsForNodes = (nodes = [], input = {}) => {
  const ids = new Set(
    (Array.isArray(input.directDigitalAssetIds)
      ? input.directDigitalAssetIds
      : []
    ).map(String),
  );
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const runtimeId = input.runtimeDigitalAssetIds?.[node.id];
    const singleId = runtimeId || node.data?.digitalAssetId;
    if (singleId) ids.add(String(singleId));
    for (const id of Array.isArray(node.data?.digitalAssetIds)
      ? node.data.digitalAssetIds
      : []) {
      if (id) ids.add(String(id));
    }
  }
  ids.delete("");
  return [...ids];
};

export function visibleDigitalAssets(assets = []) {
  return assets.filter((asset) => !asset?.deletedAt);
}

export function splitKlingOmniDigitalAssets(assets = []) {
  const elementAssets = [];
  const referenceAssets = [];
  for (const asset of Array.isArray(assets) ? assets : []) {
    const elementId = String(asset?.klingElementId || "").trim();
    if (elementId) elementAssets.push({ ...asset, klingElementId: elementId });
    else referenceAssets.push(asset);
  }
  return { elementAssets, referenceAssets };
}

export function assertWorkflowDigitalAssets({
  nodes = [],
  input = {},
  assets = [],
  ownerId,
  allowDeleted = false,
} = {}) {
  const ownedAssets = new Map(
    assets
      .filter((asset) => String(asset?.ownerId || "") === String(ownerId || ""))
      .map((asset) => [String(asset.id), asset]),
  );
  for (const id of assetIdsForNodes(nodes, input)) {
    const asset = ownedAssets.get(id);
    if (!asset)
      throw Object.assign(
        new Error("项目引用的数字资产已不存在，请重新选择后再生成。"),
        { status: 409, code: "WORKFLOW_ASSET_MISSING" },
      );
    if (asset.deletedAt && !allowDeleted)
      throw Object.assign(
        new Error(`数字资产「${asset.name || "未命名资产"}」已删除，请重新选择后再生成。`),
        { status: 409, code: "WORKFLOW_ASSET_DELETED" },
      );
  }
}

export { assetIdsForNodes };

