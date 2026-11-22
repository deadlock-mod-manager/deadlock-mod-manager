#[derive(Debug, Clone)]
pub struct NmSkeleton {
    pub name: String,
    pub bone_names: Vec<String>,
    pub parent_indices: Vec<i32>,
    /// Parent-space (local) reference pose, one entry per bone, in raw Source
    /// coordinates. Additive clips store deltas relative to this pose.
    pub(crate) reference_pose: Vec<ReferenceTransform>,
}

/// One bone's local rest transform in raw Source space (before glTF axis
/// conversion). Translation, uniform scale, and an `(x, y, z, w)` quaternion.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ReferenceTransform {
    pub(crate) translation: [f32; 3],
    pub(crate) scale: f32,
    pub(crate) rotation: [f32; 4],
}

impl Default for ReferenceTransform {
    fn default() -> Self {
        Self {
            translation: [0.0; 3],
            scale: 1.0,
            rotation: [0.0, 0.0, 0.0, 1.0],
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct QuantizationRange {
    pub(crate) start: f32,
    pub(crate) length: f32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct TrackCompressionSetting {
    pub(crate) translation: [QuantizationRange; 3],
    pub(crate) scale: QuantizationRange,
    pub(crate) constant_rotation: [f32; 4],
    pub(crate) rotation_static: bool,
    pub(crate) translation_static: bool,
    pub(crate) scale_static: bool,
}

#[derive(Debug, Clone)]
pub struct NmAnimationClip {
    pub skeleton_path: String,
    pub frame_count: usize,
    pub duration_seconds: f32,
    pub additive: bool,
    pub(crate) compressed_pose_data: Vec<u8>,
    pub(crate) compressed_pose_offsets: Vec<usize>,
    pub(crate) track_settings: Vec<TrackCompressionSetting>,
}

#[derive(Debug, Clone)]
pub struct NmAnimation {
    pub clip_path: String,
    pub skeleton: NmSkeleton,
    pub clip: NmAnimationClip,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NmClipMatch {
    pub clip_path: String,
    pub score: i32,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub(crate) struct NmGraphClipBinding {
    pub(crate) ids: Vec<String>,
    pub(crate) clip_path: String,
}
