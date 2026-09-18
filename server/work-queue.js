export function createWorkQueue(limit = 1) {
  const concurrency = Math.max(1, Math.floor(Number(limit) || 1));
  const waiting = [];
  const keyedItems = new Map();
  const activeGroups = new Map();
  let active = 0;
  let sequence = 0;

  const cancellationError = (reason) => {
    if (reason instanceof Error) return reason;
    return Object.assign(new Error(String(reason || "任务已取消")), {
      code: "WORK_CANCELLED",
    });
  };

  const removeWaitingItem = (item) => {
    const index = waiting.indexOf(item);
    if (index >= 0) waiting.splice(index, 1);
  };

  const forgetItem = (item) => {
    item.signal.removeEventListener("abort", item.onAbort);
    item.removeExternalAbort?.();
    if (item.key && keyedItems.get(item.key) === item)
      keyedItems.delete(item.key);
  };

  const groupCanStart = (item) =>
    !item.groupKey ||
    (activeGroups.get(item.groupKey) || 0) < item.groupLimit;

  const changeActiveGroup = (item, amount) => {
    if (!item.groupKey) return;
    const next = Math.max(0, (activeGroups.get(item.groupKey) || 0) + amount);
    if (next) activeGroups.set(item.groupKey, next);
    else activeGroups.delete(item.groupKey);
  };

  const drain = () => {
    while (active < concurrency && waiting.length) {
      const nextIndex = waiting.findIndex(
        (candidate) => !candidate.settled && groupCanStart(candidate),
      );
      if (nextIndex < 0) break;
      const [item] = waiting.splice(nextIndex, 1);
      if (item.settled) continue;
      if (item.signal.aborted) {
        item.settled = true;
        forgetItem(item);
        item.reject(cancellationError(item.signal.reason));
        continue;
      }
      item.started = true;
      active += 1;
      changeActiveGroup(item, 1);
      Promise.resolve()
        .then(() => item.work(item.signal))
        .then(
          (value) => {
            if (item.settled) return;
            item.settled = true;
            if (item.signal.aborted)
              item.reject(cancellationError(item.signal.reason));
            else item.resolve(value);
          },
          (error) => {
            if (item.settled) return;
            item.settled = true;
            item.reject(error);
          },
        )
        .finally(() => {
          active -= 1;
          changeActiveGroup(item, -1);
          forgetItem(item);
          drain();
        });
    }
  };

  const schedule = (
    work,
    {
      key = "",
      signal,
      priority = 0,
      groupKey = "",
      groupLimit = Number.POSITIVE_INFINITY,
    } = {},
  ) =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const normalizedKey = String(key || "");
      const item = {
        work,
        resolve,
        reject,
        controller,
        signal: controller.signal,
        key: normalizedKey,
        priority: Number(priority) || 0,
        sequence: sequence++,
        groupKey: String(groupKey || ""),
        groupLimit: Math.max(1, Math.floor(Number(groupLimit) || 1)),
        started: false,
        settled: false,
        onAbort: null,
        removeExternalAbort: null,
      };
      item.onAbort = () => {
        if (item.started || item.settled) return;
        item.settled = true;
        removeWaitingItem(item);
        forgetItem(item);
        reject(cancellationError(item.signal.reason));
        drain();
      };
      item.signal.addEventListener("abort", item.onAbort, { once: true });
      if (signal) {
        const forwardAbort = () => controller.abort(signal.reason);
        if (signal.aborted) forwardAbort();
        else {
          signal.addEventListener("abort", forwardAbort, { once: true });
          item.removeExternalAbort = () =>
            signal.removeEventListener("abort", forwardAbort);
        }
      }
      if (controller.signal.aborted) return;
      if (normalizedKey) {
        const existing = keyedItems.get(normalizedKey);
        if (existing && !existing.settled)
          existing.controller.abort(
            Object.assign(new Error("同一任务已被新的调度请求替换"), {
              code: "WORK_REPLACED",
            }),
          );
        keyedItems.set(normalizedKey, item);
      }
      waiting.push(item);
      waiting.sort(
        (left, right) =>
          right.priority - left.priority || left.sequence - right.sequence,
      );
      drain();
    });

  schedule.cancel = (key, reason) => {
    const item = keyedItems.get(String(key || ""));
    if (!item || item.settled) return false;
    item.controller.abort(cancellationError(reason));
    return true;
  };

  schedule.stats = () => ({
    concurrency,
    active,
    waiting: waiting.filter((item) => !item.settled).length,
  });

  return schedule;
}

