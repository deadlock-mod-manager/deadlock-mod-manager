export enum FeatureFlagReasonTypes {
  VALUE = "real_value",
  SEGMENT_OVERRIDE = "segment_override",
}

export interface FeatureFlagReason {
  type: FeatureFlagReasonTypes;
  value: string;
}

export interface FeatureFlagValue {
  value: boolean;
  reason: FeatureFlagReason;
}
