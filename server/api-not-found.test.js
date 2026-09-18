import assert from "node:assert/strict";
import test from "node:test";
import { apiNotFound } from "./api-not-found.js";

test("未知 API 返回 JSON 404 而不是前端页面", () => {
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  apiNotFound({}, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { message: "接口不存在" });
});

