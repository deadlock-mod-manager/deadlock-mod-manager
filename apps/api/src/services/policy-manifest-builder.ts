import type { PolicyRule } from "@deadlock-mods/database";
import type { PolicyManifest } from "@deadlock-mods/shared";

export const policyRulesToManifest = (
  rules: PolicyRule[],
  generatedAt = new Date(),
): PolicyManifest => ({
  version: 1,
  revision: rules.reduce(
    (latest, rule) =>
      Math.max(
        latest,
        (rule.updatedAt ?? rule.createdAt ?? new Date(0)).getTime(),
      ),
    0,
  ),
  generatedAt: generatedAt.toISOString(),
  rules: rules
    .filter((rule) => rule.active)
    .map((rule) => ({
      provider: rule.provider,
      submissionType: rule.submissionType,
      submissionId: rule.submissionId,
      kind: rule.kind,
      reason: rule.reason,
      correction: rule.correction ?? null,
      updatedAt: (
        rule.updatedAt ??
        rule.createdAt ??
        new Date(0)
      ).toISOString(),
    })),
});
