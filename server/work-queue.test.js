import assert from "node:assert/strict";
import test from "node:test";
import { createWorkQueue } from "./work-queue.js";

test("limits expensive generation work without dropping queued jobs", async () => {
  const schedule = createWorkQueue(1);
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = schedule(async () => {
    order.push("first:start");
    await firstGate;
    order.push("first:end");
    return 1;
  });
  const second = schedule(async () => {
    order.push("second:start");
    return 2;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["first:start"]);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(order, ["first:start", "first:end", "second:start"]);
});

test("runs independent jobs concurrently up to the configured device limit", async () => {
  const schedule = createWorkQueue(2);
  let active = 0;
  let maximumActive = 0;
  const releases = [];
  const work = (name) =>
    schedule(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
      return name;
    });

  const first = work("first");
  const second = work("second");
  const third = work("third");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(schedule.stats(), { concurrency: 2, active: 2, waiting: 1 });
  assert.equal(maximumActive, 2);

  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(schedule.stats().active, 2);
  while (releases.length) releases.shift()();
  assert.deepEqual(await Promise.all([first, second, third]), [
    "first",
    "second",
    "third",
  ]);
});

test("cancels a queued keyed job and immediately releases its queue position", async () => {
  const schedule = createWorkQueue(1);
  const order = [];
  let releaseFirst;
  const first = schedule(
    async () => {
      order.push("first:start");
      await new Promise((resolve) => { releaseFirst = resolve; });
      order.push("first:end");
    },
    { key: "first" },
  );
  const cancelled = schedule(
    async () => order.push("cancelled:started"),
    { key: "cancelled" },
  );
  const third = schedule(
    async () => order.push("third:start"),
    { key: "third" },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    schedule.cancel(
      "cancelled",
      Object.assign(new Error("工作流已由用户终止"), {
        code: "WORKFLOW_TERMINATED",
      }),
    ),
    true,
  );
  await assert.rejects(cancelled, { code: "WORKFLOW_TERMINATED" });
  assert.deepEqual(schedule.stats(), { concurrency: 1, active: 1, waiting: 1 });
  releaseFirst();
  await Promise.all([first, third]);
  assert.deepEqual(order, ["first:start", "first:end", "third:start"]);
});

test("forwards cancellation to active work through an abort signal", async () => {
  const schedule = createWorkQueue(1);
  const active = schedule(
    (signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(signal.reason),
          { once: true },
        );
      }),
    { key: "active" },
  );
  await new Promise((resolve) => setImmediate(resolve));
  schedule.cancel(
    "active",
    Object.assign(new Error("工作流已由用户终止"), {
      code: "WORKFLOW_TERMINATED",
    }),
  );
  await assert.rejects(active, { code: "WORKFLOW_TERMINATED" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(schedule.stats(), { concurrency: 1, active: 0, waiting: 0 });
});

test("高优先级任务会在已等待的普通任务之前执行", async () => {
  const schedule = createWorkQueue(1);
  const order = [];
  let releaseActive;
  const active = schedule(async () => {
    order.push("active");
    await new Promise((resolve) => { releaseActive = resolve; });
  });
  const normal = schedule(async () => order.push("normal"), { priority: 0 });
  const prioritized = schedule(async () => order.push("prioritized"), { priority: 100 });

  await new Promise((resolve) => setImmediate(resolve));
  releaseActive();
  await Promise.all([active, normal, prioritized]);
  assert.deepEqual(order, ["active", "prioritized", "normal"]);
});

test("普通用户组可使用设备允许的全部工作流并发", async () => {
  const schedule = createWorkQueue(3);
  const started = [];
  const releases = new Map();
  const work = (name, options) =>
    schedule(
      async () => {
        started.push(name);
        await new Promise((resolve) => releases.set(name, resolve));
      },
      options,
    );

  const normal1 = work("normal-1", { groupKey: "normal", groupLimit: 3 });
  const normal2 = work("normal-2", { groupKey: "normal", groupLimit: 3 });
  const normal3 = work("normal-3", { groupKey: "normal", groupLimit: 3 });
  const normal4 = work("normal-4", { groupKey: "normal", groupLimit: 3 });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    new Set(started),
    new Set(["normal-1", "normal-2", "normal-3"]),
  );
  assert.equal(started.includes("normal-4"), false);
  releases.get("normal-1")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started.includes("normal-4"), true);
  releases.get("normal-2")();
  releases.get("normal-3")();
  releases.get("normal-4")();
  await Promise.all([normal1, normal2, normal3, normal4]);
});

