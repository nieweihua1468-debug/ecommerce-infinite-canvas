import assert from "node:assert/strict";
import test from "node:test";
import {
  workflowQueueOptions,
  workflowUserConcurrency,
} from "./workflow-concurrency.js";

test("普通用户默认可使用服务器全部工作流并发", () => {
  assert.equal(workflowUserConcurrency(6, undefined), 6);
  assert.deepEqual(
    workflowQueueOptions({
      runId: "run-1",
      ownerId: "user-1",
      totalConcurrency: 6,
    }),
    {
      key: "run-1",
      priority: 0,
      groupKey: "workflow:user:user-1",
      groupLimit: 6,
    },
  );
});

test("用户并发配置不会超过服务器总并发", () => {
  assert.equal(workflowUserConcurrency(4, 99), 4);
  assert.equal(workflowUserConcurrency(4, 2), 2);
  assert.equal(workflowUserConcurrency(4, 0), 4);
});

