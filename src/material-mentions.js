const MEDIA_INPUT_TYPES = new Set(["IMAGE", "VIDEO", "AUDIO", "MEDIA"]);

const finiteMentionIndex = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const index = Number(value);
  return Number.isFinite(index) && index >= 0 ? index : null;
};

const mentionIndexOf = (ref = {}) =>
  finiteMentionIndex(
    ref.mentionIndex ?? ref.data?.mentionIndex,
  );

const cloneRef = (ref = {}) => ({
  ...ref,
  ...(ref.data && typeof ref.data === "object"
    ? { data: { ...ref.data } }
    : {}),
});

const setMentionIndex = (ref, value) => {
  const hasTopLevel = Object.prototype.hasOwnProperty.call(ref, "mentionIndex");
  const hasNested = Object.prototype.hasOwnProperty.call(
    ref.data || {},
    "mentionIndex",
  );
  const looksLikeEdge = "source" in ref || "target" in ref;

  if (hasTopLevel || (!hasNested && !looksLikeEdge)) ref.mentionIndex = value;
  if (hasNested || (!hasTopLevel && looksLikeEdge)) {
    ref.data = { ...(ref.data || {}), mentionIndex: value };
  }
};

const refIdentity = (ref = {}) =>
  String(ref.id || ref.mentionId || ref.refId || "");

/**
 * Complete an @material mention and leave a whitespace boundary for typing.
 *
 * An active partial mention is always replaced, even when the same material
 * token already appears elsewhere in the prompt. Clicking an existing chip
 * only moves the caret to a safe position after that token.
 */
export function completeMaterialMention(value, token, caretPosition) {
  const current = String(value || "");
  const mentionToken = String(token || "").trim();
  const caret = Number.isFinite(caretPosition)
    ? Math.max(0, Math.min(current.length, Number(caretPosition)))
    : current.length;
  if (!mentionToken) return { value: current, caret };

  const beforeCaret = current.slice(0, caret);
  const trigger = beforeCaret.match(/@([^@\s]*)$/);
  if (!trigger) {
    const existingIndex = current.indexOf(mentionToken);
    if (existingIndex >= 0) {
      const tokenEnd = existingIndex + mentionToken.length;
      if (/\s/.test(current[tokenEnd] || ""))
        return { value: current, caret: tokenEnd + 1 };
      return {
        value: `${current.slice(0, tokenEnd)} ${current.slice(tokenEnd)}`,
        caret: tokenEnd + 1,
      };
    }
  }

  const start = trigger ? caret - trigger[0].length : caret;
  const before = current.slice(0, start);
  const after = current.slice(caret).replace(/^[ \t]+/, "");
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const insertion = `${prefix}${mentionToken} `;
  return {
    value: `${before}${insertion}${after}`,
    caret: before.length + insertion.length,
  };
}

/** Return the active picker query, or null once a known token is complete. */
export function materialMentionQueryAtCaret(
  value,
  caretPosition,
  knownTokens = [],
) {
  const current = String(value || "");
  const caret = Number.isFinite(caretPosition)
    ? Math.max(0, Math.min(current.length, Number(caretPosition)))
    : current.length;
  const trigger = current.slice(0, caret).match(/@([^@\s]*)$/);
  if (!trigger) return null;
  const fragment = trigger[0];
  if (
    (Array.isArray(knownTokens) ? knownTokens : []).some((token) => {
      const normalized = String(token || "").trim();
      return normalized && fragment.startsWith(normalized);
    })
  )
    return null;
  return trigger[1] || "";
}

/**
 * Return material references in the order understood by a target node.
 *
 * Target ports establish the input skeleton. Within its media positions,
 * mentionIndex is the explicit @material order; refs without it retain their
 * legacy port order. Both normalized refs (`mentionIndex`) and React Flow edges
 * (`data.mentionIndex`) are supported.
 */
export function orderedMaterialRefs(targetNode = {}, refs = []) {
  const inputs = Array.isArray(targetNode?.data?.inputs)
    ? targetNode.data.inputs
    : [];
  const inputOrder = new Map(
    inputs.map((input, index) => [String(input?.id || ""), index]),
  );
  const inputType = new Map(
    inputs.map((input) => [
      String(input?.id || ""),
      String(input?.type || "").toUpperCase(),
    ]),
  );
  const ordered = (Array.isArray(refs) ? refs : [])
    .map((ref, originalIndex) => ({ ref: cloneRef(ref), originalIndex }))
    .sort((left, right) => {
      const leftPort = inputOrder.get(String(left.ref.targetHandle || ""));
      const rightPort = inputOrder.get(String(right.ref.targetHandle || ""));
      return (
        (leftPort ?? Number.MAX_SAFE_INTEGER) -
          (rightPort ?? Number.MAX_SAFE_INTEGER) ||
        left.originalIndex - right.originalIndex
      );
    });

  const isMedia = ({ ref }) =>
    mentionIndexOf(ref) !== null ||
    MEDIA_INPUT_TYPES.has(inputType.get(String(ref.targetHandle || "")));
  const mediaPositions = ordered
    .map((entry, index) => (isMedia(entry) ? index : -1))
    .filter((index) => index >= 0);
  const legacyOrder = new Map(ordered.map((entry, index) => [entry, index]));
  const mediaEntries = mediaPositions
    .map((index) => ordered[index])
    .sort((left, right) => {
      const leftMention = mentionIndexOf(left.ref);
      const rightMention = mentionIndexOf(right.ref);
      if (leftMention !== null && rightMention !== null)
        return (
          leftMention - rightMention ||
          legacyOrder.get(left) - legacyOrder.get(right)
        );
      if (leftMention !== null) return -1;
      if (rightMention !== null) return 1;
      return legacyOrder.get(left) - legacyOrder.get(right);
    });
  mediaPositions.forEach((position, index) => {
    ordered[position] = mediaEntries[index];
  });
  return ordered.map(({ ref }) => ref);
}

/**
 * Swap two material references without mutating the caller's array.
 *
 * Both the runtime slot (targetHandle) and the UI ordering hint
 * (mentionIndex) move together. This also accepts ordinary React Flow edge
 * objects, where mentionIndex may be absent.
 */
export function swapMaterialRefs(
  targetNode = {},
  refs = [],
  firstRefId,
  secondRefId,
) {
  const next = (Array.isArray(refs) ? refs : []).map(cloneRef);
  const firstIndex = next.findIndex(
    (ref) => refIdentity(ref) === String(firstRefId || ""),
  );
  const secondIndex = next.findIndex(
    (ref) => refIdentity(ref) === String(secondRefId || ""),
  );
  if (
    firstIndex < 0 ||
    secondIndex < 0 ||
    firstIndex === secondIndex
  )
    return orderedMaterialRefs(targetNode, next);

  const first = next[firstIndex];
  const second = next[secondIndex];
  const firstTargetHandle = first.targetHandle;
  const firstMentionIndex = mentionIndexOf(first);
  const secondMentionIndex = mentionIndexOf(second);
  first.targetHandle = second.targetHandle;
  second.targetHandle = firstTargetHandle;
  if (firstMentionIndex !== null || secondMentionIndex !== null) {
    setMentionIndex(first, secondMentionIndex);
    setMentionIndex(second, firstMentionIndex);
  }

  return orderedMaterialRefs(targetNode, next);
}

/** Remove one reference and compact remaining media refs to continuous slots. */
export function removeMaterialRef(targetNode = {}, refs = [], refId) {
  const identity = String(refId || "");
  const sourceRefs = Array.isArray(refs) ? refs : [];
  if (!sourceRefs.some((ref) => refIdentity(ref) === identity))
    return orderedMaterialRefs(targetNode, sourceRefs);
  const remaining = orderedMaterialRefs(
    targetNode,
    sourceRefs.filter(
      (ref) => refIdentity(ref) !== identity,
    ),
  );
  const inputs = Array.isArray(targetNode?.data?.inputs)
    ? targetNode.data.inputs
    : [];
  const typeByHandle = new Map(
    inputs.map((input) => [
      String(input?.id || ""),
      String(input?.type || "").toUpperCase(),
    ]),
  );
  const handlesByType = new Map();
  inputs.forEach((input) => {
    const type = String(input?.type || "").toUpperCase();
    if (!MEDIA_INPUT_TYPES.has(type)) return;
    handlesByType.set(type, [
      ...(handlesByType.get(type) || []),
      String(input?.id || ""),
    ]);
  });
  const nextSlotByType = new Map();
  let nextMentionIndex = 1;
  remaining.forEach((ref) => {
    const type = typeByHandle.get(String(ref.targetHandle || ""));
    const isMedia = mentionIndexOf(ref) !== null || MEDIA_INPUT_TYPES.has(type);
    if (!isMedia) return;
    if (MEDIA_INPUT_TYPES.has(type)) {
      const slot = nextSlotByType.get(type) || 0;
      const nextHandle = handlesByType.get(type)?.[slot];
      if (nextHandle) ref.targetHandle = nextHandle;
      nextSlotByType.set(type, slot + 1);
    }
    setMentionIndex(ref, nextMentionIndex);
    nextMentionIndex += 1;
  });
  return orderedMaterialRefs(targetNode, remaining);
}

