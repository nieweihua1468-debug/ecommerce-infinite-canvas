import assert from "node:assert/strict";
import test from "node:test";
import { allowsLocalAdminSession } from "./local-development.js";

test("allows the local administrator preview on loopback in development", () => {
  assert.equal(
    allowsLocalAdminSession({
      nodeEnv: "development",
      remoteAddress: "127.0.0.1",
    }),
    true,
  );
  assert.equal(
    allowsLocalAdminSession({ nodeEnv: "", remoteAddress: "::1" }),
    true,
  );
});

test("never enables the local administrator preview in production", () => {
  assert.equal(
    allowsLocalAdminSession({
      nodeEnv: "production",
      remoteAddress: "127.0.0.1",
    }),
    false,
  );
});

test("rejects non-loopback development requests", () => {
  assert.equal(
    allowsLocalAdminSession({
      nodeEnv: "development",
      remoteAddress: "192.168.1.10",
    }),
    false,
  );
});

