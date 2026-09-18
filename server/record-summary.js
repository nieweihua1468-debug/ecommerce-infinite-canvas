export const TASK_PROMPT_PREVIEW_LIMIT = 360;

export function summarizeTaskForList(task = {}) {
  const prompt = String(task.prompt || "");
  return {
    ...task,
    prompt:
      prompt.length > TASK_PROMPT_PREVIEW_LIMIT
        ? `${prompt.slice(0, TASK_PROMPT_PREVIEW_LIMIT)}…`
        : prompt,
    ...(prompt.length > TASK_PROMPT_PREVIEW_LIMIT
      ? { promptTruncated: true }
      : {}),
  };
}

export function summarizeWorkflowRunForList(run = {}) {
  const { runtimeAssets: _runtimeAssets, steps = [], ...summary } = run;
  return {
    ...summary,
    steps: (Array.isArray(steps) ? steps : []).map(
      ({ result: _result, ...step }) => step,
    ),
  };
}

