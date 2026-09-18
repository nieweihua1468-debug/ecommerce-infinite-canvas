import test from "node:test";
import assert from "node:assert/strict";
import { createOutfitImageTemplates, OUTFIT_TEMPLATE_COUNT } from "./outfit-image-templates.js";
test("public edition does not bundle the private product catalogue", () => {
 assert.equal(OUTFIT_TEMPLATE_COUNT, 0);
 assert.deepEqual(createOutfitImageTemplates(), []);
});
