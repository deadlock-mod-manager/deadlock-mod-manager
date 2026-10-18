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
    | "modelRelocation";
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
    | "outdatedCameraAttachments"
    | "missingAnimationInterface"
    | "animationMapping"
    | "unreadableResource"
    | "materialMapping"
    | "materialInterface"
    | "modelMapping"
    | "overlappingModel";
  detail: string;
}
