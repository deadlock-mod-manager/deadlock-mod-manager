export interface AssetRepair {
  modId: string;
  sourceVpk: string;
  filePath: string;
  kind:
    | "animationSkeleton"
    | "animationSkeletonRebased"
    | "animationInterface"
    | "animationClipTracks"
    | "animationRigRebase"
    | "cameraInterface"
    | "cameraControls"
    | "cameraAttachmentFrame"
    | "materialBindings"
    | "modelRelocation"
    | "taggedSounds";
}

export interface AssetWarning {
  modId: string;
  sourceVpk: string;
  filePath: string;
  kind:
    | "unverifiedSkeleton"
    | "invalidSkeleton"
    | "invalidBoneRemapping"
    | "invalidAttachment"
    | "invalidHitbox"
    | "missingResource"
    | "missingCameraInterface"
    | "missingCameraAttachments"
    | "outdatedCameraAttachments"
    | "missingSoundBindings"
    | "missingAnimationInterface"
    | "animationMapping"
    | "unreadableResource"
    | "materialMapping"
    | "materialInterface"
    | "modelMapping"
    | "overlappingModel";
  detail: string;
}
