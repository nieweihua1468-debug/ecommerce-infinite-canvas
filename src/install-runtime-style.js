export function installRuntimeStyle(id, cssText) {
  if (typeof document === "undefined") return;
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement("style");
    style.id = id;
  }
  if (style.textContent !== cssText) style.textContent = cssText;
  document.head.append(style);
}

