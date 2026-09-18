const cleanPreset = (preset, index, system = false) => ({
  id: String(preset?.id || `preset-${index + 1}`)
    .trim()
    .slice(0, 60),
  label: String(preset?.label || "")
    .trim()
    .slice(0, 24),
  framework: String(preset?.framework || "")
    .trim()
    .slice(0, 4000),
  ...(system ? { system: true } : {}),
});

export function sanitizeVideoAnalysisPresets(
  presets,
  { system = false, limit = 12 } = {},
) {
  return (Array.isArray(presets) ? presets : [])
    .map((preset, index) => cleanPreset(preset, index, system))
    .filter((preset) => preset.label && preset.framework)
    .slice(0, limit);
}

export function normalizeSystemVideoAnalysisProfiles(
  configured = {},
  fallback = {},
) {
  return Object.fromEntries(
    Object.entries(fallback).map(([targetModel, defaults]) => {
      const profile = configured?.[targetModel] || {};
      return [
        targetModel,
        {
          framework: String(profile.framework || defaults.framework)
            .trim()
            .slice(0, 4000),
          presets: sanitizeVideoAnalysisPresets(
            Array.isArray(profile.presets) ? profile.presets : defaults.presets,
          ),
        },
      ];
    }),
  );
}

export function normalizeVideoAnalysisProfiles(profiles = {}, defaults = {}) {
  return Object.fromEntries(
    Object.entries(defaults).map(([targetModel, systemProfile]) => {
      const profile = profiles?.[targetModel] || {};
      const systemPresets = sanitizeVideoAnalysisPresets(
        systemProfile.presets,
        { system: true },
      );
      const systemIds = new Set(systemPresets.map((preset) => preset.id));
      const personalPresets = sanitizeVideoAnalysisPresets(profile.presets).filter(
        (preset) => !systemIds.has(preset.id),
      );
      return [
        targetModel,
        {
          framework: String(profile.framework || systemProfile.framework)
            .trim()
            .slice(0, 4000),
          presets: [...systemPresets, ...personalPresets].slice(0, 12),
        },
      ];
    }),
  );
}

export function stripSystemVideoAnalysisPresets(presets, systemProfile = {}) {
  const systemIds = new Set(
    sanitizeVideoAnalysisPresets(systemProfile.presets).map(
      (preset) => preset.id,
    ),
  );
  return sanitizeVideoAnalysisPresets(presets).filter(
    (preset) => !systemIds.has(preset.id),
  );
}

