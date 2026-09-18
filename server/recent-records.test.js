import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRecordIds,
  parseRecordLimit,
  selectRecentRecords,
} from "./recent-records.js";

const records = [
  { id: "old-active", status: "processing", createdAt: "2026-01-01T00:00:00Z" },
  { id: "newest", status: "succeeded", createdAt: "2026-01-04T00:00:00Z" },
  { id: "newer", status: "failed", createdAt: "2026-01-03T00:00:00Z" },
  { id: "older", status: "succeeded", createdAt: "2026-01-02T00:00:00Z" },
];

test("record limits are optional, positive and bounded", () => {
  assert.equal(parseRecordLimit(undefined), 0);
  assert.equal(parseRecordLimit("invalid"), 0);
  assert.equal(parseRecordLimit(20), 20);
  assert.equal(parseRecordLimit(900, { max: 120 }), 120);
});

test("record ids are normalized, deduplicated and bounded", () => {
  assert.deepEqual(parseRecordIds(" a, b,a, "), ["a", "b"]);
  assert.deepEqual(parseRecordIds(["a", "b", "c"], { max: 2 }), ["a", "b"]);
});

test("recent selection retains every active record outside the recent window", () => {
  assert.deepEqual(
    selectRecentRecords(records, {
      limit: 2,
      activeStatuses: ["queued", "processing"],
    }).map((record) => record.id),
    ["newest", "newer", "old-active"],
  );
});

test("id selection returns terminal updates and ignores the recent limit", () => {
  assert.deepEqual(
    selectRecentRecords(records, { ids: ["older", "newest"], limit: 1 }).map(
      (record) => record.id,
    ),
    ["newest", "older"],
  );
});

test("an omitted limit preserves the full compatibility response", () => {
  assert.equal(selectRecentRecords(records).length, records.length);
});

