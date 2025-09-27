export enum FeatureFlagReasonTypes {
  VALUE = "real_value",
}

export interface FeatureFlagReason {
  type: FeatureFlagReasonTypes;
  value: string;
}

export interface FeatureFlagValue {
  value: boolean;
  reason: FeatureFlagReason;
}
