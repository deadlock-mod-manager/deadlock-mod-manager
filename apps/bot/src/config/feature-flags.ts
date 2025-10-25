import type { FeatureFlagDefinition } from "@deadlock-mods/feature-flags";

export const featureFlagDefinitions: FeatureFlagDefinition[] = [
  {
    name: "triage_similarity_threshold",
    description: "Similarity threshold for message triage classification (0-1)",
    type: "number",
    defaultValue: 0.75,
  },
];
