import test from "node:test";
import assert from "node:assert/strict";
import {
  isDigitalAssetKind,
  isDigitalAssetImageCountValid,
  isKlingConvertibleDigitalAssetKind,
} from "./digital-asset-kind.js";

test("数字人是可保存的快捷图片素材", () => {
  assert.equal(isDigitalAssetKind("avatar"), true);
});

test("数字人快捷素材不进入可灵主体转换", () => {
  assert.equal(isKlingConvertibleDigitalAssetKind("avatar"), false);
  assert.equal(isKlingConvertibleDigitalAssetKind("person"), true);
  assert.equal(isKlingConvertibleDigitalAssetKind("clothing"), true);
});

test("数字人快捷素材仅允许一张图片", () => {
  assert.equal(isDigitalAssetImageCountValid("avatar", 1), true);
  assert.equal(isDigitalAssetImageCountValid("avatar", 2), false);
  assert.equal(isDigitalAssetImageCountValid("person", 4), true);
  assert.equal(isDigitalAssetImageCountValid("person", 5), false);
});

test("模版原创是单图收藏资产且不转换为可灵主体", () => {
  assert.equal(isDigitalAssetKind("template_original"), true);
  assert.equal(isDigitalAssetImageCountValid("template_original", 1), true);
  assert.equal(isDigitalAssetImageCountValid("template_original", 2), false);
  assert.equal(isKlingConvertibleDigitalAssetKind("template_original"), false);
});

