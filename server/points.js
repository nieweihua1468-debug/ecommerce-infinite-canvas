import { randomUUID } from "node:crypto";
import { mutateCollection, readCollection } from "./store.js";

let mutationQueue = Promise.resolve();

function serializeMutation(operation) {
  const pending = mutationQueue.then(operation, operation);
  mutationQueue = pending.catch(() => undefined);
  return pending;
}

export function videoPointCost(duration) {
  const seconds = Number(duration);
  if (!Number.isInteger(seconds) || seconds < 1)
    throw Object.assign(new Error("视频时长不合法"), { status: 400 });
  return seconds;
}

export function usagePointCost(kind, quantity = 1) {
  const amount = Number(quantity);
  if (
    !["text", "image", "analysis", "video", "audio"].includes(
      String(kind || ""),
    )
  ) {
    throw Object.assign(new Error("积分计费类型不合法"), { status: 400 });
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw Object.assign(new Error("积分计费数量不合法"), { status: 400 });
  }
  return kind === "video" ? videoPointCost(amount) : amount;
}

const usageKindLabel = {
  text: "文本生成",
  image: "图片生成",
  analysis: "视频分析",
  video: "视频生成",
  audio: "音频生成",
};

export function chargeUsagePoints({
  userId,
  kind,
  quantity = 1,
  taskId,
  reason = "",
}) {
  return serializeMutation(async () => {
    const amount = usagePointCost(kind, quantity);
    const ledgerKind = `${kind}_charge`;
    const ledger = await readCollection("point_ledger", []);
    const existing = ledger.find(
      (entry) => entry.taskId === taskId && entry.kind === ledgerKind,
    );
    if (existing)
      return { amount, balanceAfter: existing.balanceAfter, charged: false };

    let updatedUser;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== userId) return user;
        if (user.status !== "active")
          throw Object.assign(new Error("账号已停用"), { status: 403 });
        const balance = Number(user.pointsBalance || 0);
        if (balance < amount) {
          throw Object.assign(
            new Error(
              `积分不足：${usageKindLabel[kind]}需要 ${amount} 积分，当前余额 ${balance}`,
            ),
            { status: 402 },
          );
        }
        updatedUser = {
          ...user,
          pointsBalance: balance - amount,
          updatedAt: new Date().toISOString(),
        };
        return updatedUser;
      }),
    );
    if (!updatedUser)
      throw Object.assign(new Error("账号不存在"), { status: 404 });

    const entry = {
      id: randomUUID(),
      userId,
      taskId,
      kind: ledgerKind,
      amount: -amount,
      balanceAfter: updatedUser.pointsBalance,
      reason: reason || `${usageKindLabel[kind]} ${amount} 积分`,
      operator: "system",
      createdAt: new Date().toISOString(),
    };
    await mutateCollection("point_ledger", (entries) => [entry, ...entries]);
    return { amount, balanceAfter: updatedUser.pointsBalance, charged: true };
  });
}

export function refundUsagePoints({
  userId,
  kind,
  quantity = 1,
  taskId,
  reason = "",
}) {
  return serializeMutation(async () => {
    const amount = usagePointCost(kind, quantity);
    const chargeKind = `${kind}_charge`;
    const refundKind = `${kind}_refund`;
    const ledger = await readCollection("point_ledger", []);
    const existing = ledger.find(
      (entry) => entry.taskId === taskId && entry.kind === refundKind,
    );
    if (existing)
      return { amount, balanceAfter: existing.balanceAfter, refunded: false };
    const charge = ledger.find(
      (entry) => entry.taskId === taskId && entry.kind === chargeKind,
    );
    if (!charge) return { amount: 0, balanceAfter: null, refunded: false };

    let updatedUser;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== userId) return user;
        updatedUser = {
          ...user,
          pointsBalance: Number(user.pointsBalance || 0) + amount,
          updatedAt: new Date().toISOString(),
        };
        return updatedUser;
      }),
    );
    if (!updatedUser)
      throw Object.assign(new Error("退款用户不存在"), { status: 404 });

    const entry = {
      id: randomUUID(),
      userId,
      taskId,
      kind: refundKind,
      amount,
      balanceAfter: updatedUser.pointsBalance,
      reason: reason || `${usageKindLabel[kind]}失败退款`,
      operator: "system",
      createdAt: new Date().toISOString(),
    };
    await mutateCollection("point_ledger", (entries) => [entry, ...entries]);
    return { amount, balanceAfter: updatedUser.pointsBalance, refunded: true };
  });
}

export function chargeVideoPoints({ userId, duration, taskId }) {
  return chargeUsagePoints({
    userId,
    kind: "video",
    quantity: duration,
    taskId,
    reason: `视频生成 ${duration} 秒`,
  });
}

export function refundVideoPoints({
  userId,
  amount,
  taskId,
  reason = "视频生成失败退款",
}) {
  return refundUsagePoints({
    userId,
    kind: "video",
    quantity: amount,
    taskId,
    reason,
  });
}

