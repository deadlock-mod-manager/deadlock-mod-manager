import {
  PERFORMANCE_CONFIG_CATEGORY,
  type PolicyMetadataCorrection,
} from "@deadlock-mods/shared";

export const withPerformanceConfigCategory = (
  correction: PolicyMetadataCorrection | null,
): PolicyMetadataCorrection => ({
  ...correction,
  category: PERFORMANCE_CONFIG_CATEGORY,
});

export const withoutPerformanceConfigCategory = (
  correction: PolicyMetadataCorrection | null,
): PolicyMetadataCorrection | null => {
  if (!correction) return null;
  const { category: _category, ...rest } = correction;
  return Object.keys(rest).length > 0 ? rest : null;
};

export const isPerformanceConfigCorrection = (
  correction: PolicyMetadataCorrection | null,
) => correction?.category === PERFORMANCE_CONFIG_CATEGORY;
