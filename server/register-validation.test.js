import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePasswordChangeInput,
  validateRegistrationInput,
} from "./register-validation.js";

test("accepts the documented registration examples", () => {
  assert.equal(
    validateRegistrationInput({
      name: "文鸟工作室",
      contact: "user@example.com",
      password: "WenNiao2026",
    }).valid,
    true,
  );
  assert.equal(
    validateRegistrationInput({
      name: "Studio_01",
      contact: "13800138000",
      password: "Studio2026",
    }).valid,
    true,
  );
});

test("returns a precise field error for each invalid registration value", () => {
  assert.equal(
    validateRegistrationInput({
      name: "a",
      contact: "user@example.com",
      password: "WenNiao2026",
    }).errors.name,
    "用户名需为 2–24 个字符",
  );
  assert.equal(
    validateRegistrationInput({
      name: "文鸟",
      contact: "1380013800",
      password: "WenNiao2026",
    }).errors.contact,
    "请输入有效邮箱，或 11 位中国大陆手机号",
  );
  assert.equal(
    validateRegistrationInput({
      name: "文鸟",
      contact: "user@example.com",
      password: "12345678",
    }).errors.password,
    "密码必须同时包含字母和数字",
  );
});

test("normalizes contact and rejects spaces in passwords", () => {
  const result = validateRegistrationInput({
    name: " Studio_01 ",
    contact: " USER@Example.COM ",
    password: "Studio 2026",
  });
  assert.equal(result.values.contact, "user@example.com");
  assert.equal(result.errors.password, "密码不能包含空格");
});

test("validates password changes with current password and confirmation", () => {
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: "OldPassword2026",
      newPassword: "NewPassword2026",
      confirmPassword: "NewPassword2026",
    }).valid,
    true,
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: "OldPassword2026",
      newPassword: "NewPassword2026",
      confirmPassword: "Different2026",
    }).errors.confirmPassword,
    "两次输入的新密码不一致",
  );
});

test("allows first-time password setup without a current password", () => {
  const result = validatePasswordChangeInput({
    requireCurrent: false,
    newPassword: "FirstPassword2026",
    confirmPassword: "FirstPassword2026",
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.currentPassword, undefined);
});

