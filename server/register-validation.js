const NAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_PATTERN = /^1[3-9]\d{9}$/;

export function validateRegistrationInput(input = {}) {
  const name = String(input.name || "").trim();
  const contact = String(input.contact || "")
    .trim()
    .toLowerCase();
  const password = String(input.password || "");
  const errors = {};

  if (!name) errors.name = "请输入用户名";
  else if (name.length < 2 || name.length > 24)
    errors.name = "用户名需为 2–24 个字符";
  else if (!NAME_PATTERN.test(name))
    errors.name = "用户名仅支持中文、英文、数字、点、下划线和短横线";

  if (!contact) errors.contact = "请输入邮箱或手机号";
  else if (
    contact.length > 120 ||
    (!EMAIL_PATTERN.test(contact) && !MOBILE_PATTERN.test(contact))
  )
    errors.contact = "请输入有效邮箱，或 11 位中国大陆手机号";

  if (!password) errors.password = "请输入密码";
  else if (password.length < 8 || password.length > 32)
    errors.password = "密码需为 8–32 位";
  else if (/\s/.test(password)) errors.password = "密码不能包含空格";
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    errors.password = "密码必须同时包含字母和数字";

  const firstField = ["name", "contact", "password"].find(
    (field) => errors[field],
  );
  return {
    valid: !firstField,
    values: { name, contact, password },
    errors,
    firstField: firstField || null,
    firstError: firstField ? errors[firstField] : null,
  };
}

export function validatePasswordChangeInput(input = {}) {
  const currentPassword = String(input.currentPassword || "");
  const newPassword = String(input.newPassword || "");
  const confirmPassword = String(input.confirmPassword || "");
  const requireCurrent = input.requireCurrent !== false;
  const errors = {};

  if (requireCurrent && !currentPassword)
    errors.currentPassword = "请输入当前密码";

  const passwordValidation = validateRegistrationInput({
    name: "AccountUser",
    contact: "account@example.com",
    password: newPassword,
  });
  if (passwordValidation.errors.password)
    errors.newPassword = passwordValidation.errors.password.replace(
      "请输入密码",
      "请输入新密码",
    );
  else if (requireCurrent && currentPassword === newPassword)
    errors.newPassword = "新密码不能与当前密码相同";

  if (!confirmPassword) errors.confirmPassword = "请再次输入新密码";
  else if (newPassword !== confirmPassword)
    errors.confirmPassword = "两次输入的新密码不一致";

  const firstField = [
    "currentPassword",
    "newPassword",
    "confirmPassword",
  ].find((field) => errors[field]);
  return {
    valid: !firstField,
    values: { currentPassword, newPassword, confirmPassword },
    errors,
    firstField: firstField || null,
    firstError: firstField ? errors[firstField] : null,
  };
}

