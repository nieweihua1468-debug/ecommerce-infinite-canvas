import test from "node:test";
import assert from "node:assert/strict";
import {
  hasValidGeneratedAccess,
  isTemplateCoverFile,
  signGeneratedUrls,
  signedGeneratedUrl,
} from "./generated-access.js";

test("signs private generated media with a bounded access token", () => {
  process.env.ADMIN_SESSION_SECRET = "generated-access-test-secret";
  const url = signedGeneratedUrl("/generated/task-1.png", {
    now: 1_000,
    ttlMs: 60_000,
  });
  const parsed = new URL(url, "http://localhost");
  assert.equal(parsed.pathname, "/generated/task-1.png");
  assert.equal(
    hasValidGeneratedAccess(
      "task-1.png",
      parsed.searchParams.get("exp"),
      parsed.searchParams.get("sig"),
      2_000,
    ),
    true,
  );
  assert.equal(
    hasValidGeneratedAccess(
      "task-1.png",
      parsed.searchParams.get("exp"),
      parsed.searchParams.get("sig"),
      62_000,
    ),
    false,
  );
});
test("leaves template covers public and recursively signs task media", () => {
  assert.equal(
    isTemplateCoverFile("template-cover-id-550e8400-e29b-41d4-a716-446655440000.png"),
    true,
  );
  const cover = "/generated/template-cover-id-550e8400-e29b-41d4-a716-446655440000.png";
  assert.equal(signedGeneratedUrl(cover), cover);
  const result = signGeneratedUrls({ imageUrl: "/generated/result.png", nested: [cover] });
  assert.match(result.imageUrl, /[?&]sig=/);
  assert.equal(result.nested[0], cover);
});

