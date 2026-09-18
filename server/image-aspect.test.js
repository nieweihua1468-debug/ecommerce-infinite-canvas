import assert from "node:assert/strict";
import test from "node:test";
import { centeredCropForAspectRatio } from "./image-aspect.js";

test("center-crops Azure portrait output from 2:3 to exact 9:16", () => {
  assert.deepEqual(centeredCropForAspectRatio(1024, 1536, "9:16"), {
    width: 864,
    height: 1536,
    x: 80,
    y: 0,
    changed: true,
  });
});

test("keeps an image that already matches the requested ratio", () => {
  assert.deepEqual(centeredCropForAspectRatio(1080, 1920, "9:16"), {
    width: 1080,
    height: 1920,
    x: 0,
    y: 0,
    changed: false,
  });
});

test("center-crops portrait output to a square when requested", () => {
  assert.deepEqual(centeredCropForAspectRatio(1024, 1536, "1:1"), {
    width: 1024,
    height: 1024,
    x: 0,
    y: 256,
    changed: true,
  });
});

