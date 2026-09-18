const recordTimestamp = (record) => {
  const value = new Date(record?.createdAt || record?.updatedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

export function parseRecordLimit(value, { max = 500 } = {}) {
  if (value === undefined || value === null || String(value).trim() === "")
    return 0;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.max(1, parsed), Math.max(1, max));
}

export function parseRecordIds(value, { max = 200 } = {}) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [
    ...new Set(
      values
        .map((item) => String(item || "").trim().slice(0, 160))
        .filter(Boolean),
    ),
  ].slice(0, Math.max(1, max));
}

export function selectRecentRecords(
  records,
  { limit = 0, ids = [], activeStatuses = [] } = {},
) {
  const sorted = [...(Array.isArray(records) ? records : [])].sort(
    (left, right) => recordTimestamp(right) - recordTimestamp(left),
  );
  const requestedIds = new Set(parseRecordIds(ids));
  if (requestedIds.size)
    return sorted.filter((record) => requestedIds.has(String(record?.id || "")));
  const boundedLimit = parseRecordLimit(limit);
  if (!boundedLimit) return sorted;

  const active = new Set(activeStatuses.map((status) => String(status)));
  const selectedIds = new Set(
    sorted
      .filter((record) => active.has(String(record?.status || "")))
      .map((record) => String(record?.id || "")),
  );
  sorted.slice(0, boundedLimit).forEach((record) =>
    selectedIds.add(String(record?.id || "")),
  );
  return sorted.filter((record) => selectedIds.has(String(record?.id || "")));
}

