// Public edition: brand-specific products and knowledge are intentionally empty.
export const CUSTOM_BRAND_BRAND_CATEGORY = { id: "custom-brand", label: "自有品牌", children: [] };
export const CUSTOM_BRAND_DETAIL_PAGE_BLUEPRINTS = [];
export const CUSTOM_BRAND_DETAIL_PAGE_TEMPLATE_COUNT = 0;
export function createCustomBrandInvocation() { return null; }
export function customBrandInvocationForTemplate() { return null; }
export function composeCustomBrandLockedPrompt(prompt, invocation) {
  const text = String(prompt || "");
  const prefix = String(invocation?.systemPrompt || "").trim();
  return prefix && !text.includes(prefix) ? `${prefix}\n\n${text}` : text;
}
