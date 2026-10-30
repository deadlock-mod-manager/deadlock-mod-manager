use std::path::Path;
use std::sync::{Arc, OnceLock};

use serde::Serialize;
use source2_model::vpk_extract::VpkArchive;
use source2_model::{Resource, nm_anim, skeleton};
use ts_rs::TS;

use super::staging::{staged_base_game_vpk, staged_core_vpk};
use crate::errors::Error;
use crate::vpk_archive_cache::open_archive;

#[derive(Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewAnimationChoice {
  pub id: String,
  pub kind: PreviewAnimationKind,
  pub label: String,
  pub clips: Vec<String>,
  /// The ability name these clips were found by, when their names spell one.
  #[ts(optional)]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ability: Option<String>,
}

#[derive(Clone, Serialize, TS)]
#[ts(export, rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PreviewAnimationKind {
  Movement,
  Ability,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewBoneTrack {
  pub name: String,
  pub positions: Vec<f32>,
  pub rotations: Vec<f32>,
  pub scales: Vec<f32>,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewAnimation {
  pub duration: f32,
  pub times: Vec<f32>,
  pub tracks: Vec<PreviewBoneTrack>,
  pub segments: Vec<PreviewAnimationSegment>,
}

/// One clip's span inside a decoded sequence.
#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewAnimationSegment {
  pub clip_path: String,
  pub start: f32,
  pub end: f32,
}

const SAMPLE_RATE: f32 = 30.0;
const STATIC_CLIP_SECONDS: f32 = 0.1;
const MAX_SEQUENCE_CLIPS: usize = nm_anim::MAX_PREVIEW_SEQUENCE_CLIPS;
const MAX_SEQUENCE_SECONDS: f32 = 30.0;
const MAX_SAMPLED_TRANSFORMS: usize = 180_000;

struct ClipSampling {
  duration: f32,
  sample_count: usize,
}

fn sampling_plan(clips: &[(usize, f32)], bone_count: usize) -> Result<Vec<ClipSampling>, Error> {
  if clips.is_empty() || clips.len() > MAX_SEQUENCE_CLIPS || bone_count == 0 {
    return Err(invalid("An animation needs clips and skeleton bones"));
  }
  let mut plan = Vec::with_capacity(clips.len());
  for &(frame_count, duration) in clips {
    if frame_count == 0 {
      return Err(invalid("Animation has no frames"));
    }
    let duration = if frame_count == 1 && duration == 0.0 {
      STATIC_CLIP_SECONDS
    } else if !duration.is_finite() || duration <= f32::EPSILON {
      return Err(invalid("Animation has an invalid duration"));
    } else {
      duration
    };
    plan.push(ClipSampling {
      duration,
      sample_count: 2,
    });
  }
  let total_seconds =
    plan.iter().map(|clip| clip.duration).sum::<f32>() + (clips.len() - 1) as f32 / SAMPLE_RATE;
  if total_seconds > MAX_SEQUENCE_SECONDS {
    return Err(invalid("Animation is too long for preview playback"));
  }
  let frame_budget = MAX_SAMPLED_TRANSFORMS / bone_count;
  let Some(extra_budget) = frame_budget.checked_sub(2 * clips.len()) else {
    return Err(invalid("Animation is too complex for preview playback"));
  };
  for (sampling, &(frame_count, _)) in plan.iter_mut().zip(clips) {
    if frame_count > 1 {
      sampling.sample_count = (sampling.duration * SAMPLE_RATE).ceil() as usize + 1;
    }
  }
  let requested_extras: usize = plan.iter().map(|clip| clip.sample_count - 2).sum();
  if requested_extras > extra_budget {
    // Keep both endpoints of every phase, then share the remaining samples
    // proportionally. Sampling less densely must never shorten the motion.
    for clip in &mut plan {
      clip.sample_count = 2 + (clip.sample_count - 2) * extra_budget / requested_extras;
    }
  }
  Ok(plan)
}

pub(super) fn invalid(error: impl std::fmt::Display) -> Error {
  Error::InvalidInput(error.to_string())
}

fn animation_slot() -> &'static Arc<tokio::sync::Semaphore> {
  static SLOT: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
  SLOT.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(1)))
}

/// The VPK at `file_path`, falling back to the base game and then the engine's
/// core pak, plus the base game on its own for clip listings.
pub(super) fn archives(file_path: &str) -> Result<(VpkArchive, Option<Arc<VpkArchive>>), Error> {
  let base = staged_base_game_vpk()?
    .map(|path| open_archive(&path, None))
    .transpose()?;
  let core = staged_core_vpk()?
    .map(|path| open_archive(&path, None))
    .transpose()?;
  let archive = VpkArchive::open(Path::new(file_path))
    .map_err(invalid)?
    .with_fallbacks(base.iter().chain(core.iter()).cloned().collect());
  Ok((archive, base))
}

fn clip_directory(model_path: &str) -> Result<String, Error> {
  if !model_path.ends_with(".vmdl_c") || model_path.contains("..") {
    return Err(invalid("Animations require a compiled character model"));
  }
  model_path
    .rsplit_once('/')
    .map(|(directory, _)| format!("{directory}/"))
    .ok_or_else(|| invalid("Invalid model path"))
}

fn choices(
  paths: impl Iterator<Item = String>,
  ability_names: &[String],
) -> Vec<PreviewAnimationChoice> {
  nm_anim::preview_actions(paths, ability_names)
    .into_iter()
    .map(|action| {
      let (kind, label) = match action.kind {
        nm_anim::PreviewActionKind::Movement => (
          PreviewAnimationKind::Movement,
          format!("modelPreview.actions.{}", action.id),
        ),
        nm_anim::PreviewActionKind::Ability => {
          let name = action.id.trim_start_matches("ability:").replace('_', " ");
          let mut chars = name.chars();
          let label = chars.next().map_or_else(String::new, |first| {
            first.to_uppercase().collect::<String>() + chars.as_str()
          });
          (PreviewAnimationKind::Ability, label)
        }
      };
      PreviewAnimationChoice {
        id: action.id,
        kind,
        label,
        clips: action.clips,
        ability: action.ability,
      }
    })
    .collect()
}

#[tauri::command]
pub async fn foundry_list_animations(
  file_path: String,
  entry_path: String,
  ability_names: Vec<String>,
) -> Result<Vec<PreviewAnimationChoice>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    clip_directory(&entry_path)?;
    let (archive, base) = archives(&file_path)?;
    let mut listing = archive.list_entries();
    if let Some(base) = base {
      listing.extend(base.list_entries());
    }
    Ok(choices(
      nm_anim::model_clip_paths(&archive, &entry_path, &listing).into_iter(),
      &ability_names,
    ))
  })
  .await
  .map_err(invalid)?
}

/// Decodes `clip_paths` back to back into one timeline, so an action made of
/// several clips (start, loop, end) plays as a single animation.
#[tauri::command]
pub async fn foundry_decode_animation(
  file_path: String,
  entry_path: String,
  clip_paths: Vec<String>,
) -> Result<PreviewAnimation, Error> {
  if clip_paths.is_empty() || clip_paths.len() > MAX_SEQUENCE_CLIPS {
    return Err(invalid("An animation needs between one and eight clips"));
  }
  // Queue behind the running decode instead of failing, so switching actions
  // quickly still plays the last one picked.
  let permit = animation_slot()
    .clone()
    .acquire_owned()
    .await
    .map_err(invalid)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    clip_directory(&entry_path)?;
    // Clips come from the model's anim graphs, which may live in another
    // hero's folder, so only the path's shape is checked here.
    if clip_paths
      .iter()
      .any(|clip_path| !clip_path.ends_with(".vnmclip_c") || clip_path.contains(".."))
    {
      return Err(invalid("Not an animation clip"));
    }
    let (archive, _) = archives(&file_path)?;
    let resource =
      Resource::parse(archive.extract_entry(&entry_path).map_err(invalid)?).map_err(invalid)?;
    let skeleton = skeleton::parse_model_skeleton(&resource)
      .map_err(invalid)?
      .ok_or_else(|| invalid("This model has no skeleton"))?;
    if skeleton.bones.len() > 2048 {
      return Err(invalid("The model has too many bones to animate"));
    }
    let mut clips = Vec::with_capacity(clip_paths.len());
    for clip_path in &clip_paths {
      let animation =
        nm_anim::load_nm_animation_from_archive(&archive, clip_path).map_err(invalid)?;
      if animation.clip.additive {
        return Err(invalid(
          "Additive animation layers cannot play on their own",
        ));
      }
      if !skeleton.bones.iter().any(|bone| {
        animation
          .skeleton
          .bone_names
          .iter()
          .any(|name| name.eq_ignore_ascii_case(&bone.name))
      }) {
        return Err(invalid("Animation skeleton does not match this model"));
      }
      clips.push(animation);
    }
    let metadata: Vec<_> = clips
      .iter()
      .map(|animation| (animation.clip.frame_count, animation.clip.duration_seconds))
      .collect();
    let plan = sampling_plan(&metadata, skeleton.bones.len())?;
    let total_frames: usize = plan.iter().map(|clip| clip.sample_count).sum();
    let mut times = Vec::with_capacity(total_frames);
    let mut segments = Vec::with_capacity(clips.len());
    let mut tracks: Vec<_> = skeleton
      .bones
      .iter()
      .map(|bone| PreviewBoneTrack {
        name: bone.name.clone(),
        positions: Vec::with_capacity(total_frames * 3),
        rotations: Vec::with_capacity(total_frames * 4),
        scales: Vec::with_capacity(total_frames * 3),
      })
      .collect();
    let mut offset = 0.0;
    for (animation, sampling) in clips.iter().zip(plan) {
      let duration = sampling.duration;
      for frame in 0..sampling.sample_count {
        let time = duration * frame as f32 / (sampling.sample_count - 1) as f32;
        times.push(offset + time);
        let sampled = animation.sample_pose(time, false).map_err(invalid)?;
        let mut pose = nm_anim::retarget_nm_pose(animation, &sampled, &skeleton);
        skeleton.pin_procedural_cloth_roots(&mut pose);
        for (track, transform) in tracks.iter_mut().zip(pose) {
          if !transform
            .translation
            .iter()
            .chain(&transform.rotation)
            .chain(&transform.scale)
            .all(|v| v.is_finite())
          {
            return Err(invalid("Animation contains invalid transforms"));
          }
          track.positions.extend(transform.translation);
          track.rotations.extend(transform.rotation);
          track.scales.extend(transform.scale);
        }
      }
      segments.push(PreviewAnimationSegment {
        clip_path: animation.clip_path.clone(),
        start: offset,
        end: offset + duration,
      });
      // One frame of blend between clips keeps keyframe times strictly increasing.
      offset += duration + 1.0 / SAMPLE_RATE;
    }
    Ok(PreviewAnimation {
      duration: offset - 1.0 / SAMPLE_RATE,
      times,
      tracks,
      segments,
    })
  })
  .await
  .map_err(invalid)?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn static_phases_get_a_short_span_and_keep_both_endpoints() {
    let plan = sampling_plan(&[(1, 0.0), (1, 0.25)], 512).unwrap();
    assert_eq!(plan[0].duration, STATIC_CLIP_SECONDS);
    assert_eq!(plan[1].duration, 0.25);
    assert!(plan.iter().all(|clip| clip.sample_count == 2));
  }

  #[test]
  fn rejects_empty_frames_and_malformed_durations() {
    for clip in [
      (0, 0.0),
      (0, 1.0),
      (2, 0.0),
      (2, f32::EPSILON),
      (1, -0.1),
      (1, f32::NAN),
      (1, f32::INFINITY),
      (2, f32::NEG_INFINITY),
    ] {
      assert!(sampling_plan(&[clip], 100).is_err(), "accepted {clip:?}");
    }
  }

  #[test]
  fn normal_clips_keep_thirty_fps_and_their_full_duration() {
    let plan = sampling_plan(&[(52, 1.699)], 100).unwrap();
    assert_eq!(plan[0].duration, 1.699);
    assert_eq!(plan[0].sample_count, 52);
  }

  #[test]
  fn high_bone_sequences_reduce_samples_without_shortening_any_phase() {
    let plan = sampling_plan(&[(46, 1.5), (1, 0.0), (241, 8.0)], 768).unwrap();
    let frames: usize = plan.iter().map(|clip| clip.sample_count).sum();
    assert!(frames * 768 <= MAX_SAMPLED_TRANSFORMS);
    assert!(plan.iter().all(|clip| clip.sample_count >= 2));
    assert!(plan[0].sample_count < 46);
    assert!(plan[2].sample_count < 241);
    assert_eq!(plan[0].duration, 1.5);
    assert_eq!(plan[1].duration, STATIC_CLIP_SECONDS);
    assert_eq!(plan[1].sample_count, 2);
    assert_eq!(plan[2].duration, 8.0);
  }

  #[test]
  fn sampling_still_enforces_sequence_and_transform_limits() {
    assert!(sampling_plan(&[(901, 30.0)], 2048).is_ok());
    assert!(sampling_plan(&[(451, 15.0), (451, 15.0)], 100).is_err());
    assert!(sampling_plan(&[(902, 30.01)], 100).is_err());
    assert!(sampling_plan(&[], 100).is_err());
    assert!(sampling_plan(&[(2, 1.0); MAX_SEQUENCE_CLIPS + 1], 100).is_err());
    assert!(sampling_plan(&[(2, 1.0)], 0).is_err());
    assert!(sampling_plan(&[(2, 1.0)], MAX_SAMPLED_TRANSFORMS).is_err());
  }

  #[test]
  #[ignore = "requires staged Hellboy and base VPKs via DMM_ANIMATION_TEST_VPK and DMM_ANIMATION_TEST_BASE_VPK"]
  fn staged_hellboy_leap_and_charge_metadata_and_poses() {
    let mod_path = std::env::var("DMM_ANIMATION_TEST_VPK").unwrap();
    let base_path = std::env::var("DMM_ANIMATION_TEST_BASE_VPK").unwrap();
    let base = Arc::new(VpkArchive::open(Path::new(&base_path)).unwrap());
    let mut listing = base.list_entries();
    let archive = VpkArchive::open(Path::new(&mod_path))
      .unwrap()
      .with_fallbacks(vec![base]);
    listing.extend(archive.list_entries());
    let entry_path = "models/heroes_wip/abrams/abrams.vmdl_c";
    let resource = Resource::parse(archive.extract_entry(entry_path).unwrap()).unwrap();
    let skeleton = skeleton::parse_model_skeleton(&resource).unwrap().unwrap();
    eprintln!("Hellboy model bones: {}", skeleton.bones.len());
    let paths: Vec<_> = nm_anim::model_clip_paths(&archive, entry_path, &listing)
      .into_iter()
      .filter(|path| {
        path.contains("ability_") && (path.contains("leap") || path.contains("charge"))
      })
      .collect();
    assert!(!paths.is_empty());
    for path in paths {
      let animation = nm_anim::load_nm_animation_from_archive(&archive, &path).unwrap();
      let clip = &animation.clip;
      let plan = sampling_plan(
        &[(clip.frame_count, clip.duration_seconds)],
        skeleton.bones.len(),
      )
      .unwrap();
      eprintln!(
        "{path}: frames={}, source_duration={}, display_duration={}, samples={}, additive={}",
        clip.frame_count,
        clip.duration_seconds,
        plan[0].duration,
        plan[0].sample_count,
        clip.additive
      );
      for time in [0.0, plan[0].duration] {
        let sampled = animation.sample_pose(time, false).unwrap();
        let mut pose = nm_anim::retarget_nm_pose(&animation, &sampled, &skeleton);
        skeleton.pin_procedural_cloth_roots(&mut pose);
        assert_eq!(pose.len(), skeleton.bones.len());
        assert!(pose.iter().all(|transform| {
          transform
            .translation
            .iter()
            .chain(&transform.rotation)
            .chain(&transform.scale)
            .all(|value| value.is_finite())
        }));
      }
    }
  }

  #[test]
  fn clips_are_deduplicated_and_idle_first() {
    let paths = [
      "models/a/clips/ability_cast.vnmclip_c",
      "models/a/clips/weapon_stand_idle.vnmclip_c",
      "models/a/clips/ability_cast.vnmclip_c",
      "models/a/clips/aim_idle.vnmclip+non_additive.vnmclip_c",
      "models/a/body.vmdl_c",
    ];
    let clips = choices(paths.into_iter().map(str::to_owned), &[]);
    assert_eq!(clips.len(), 2);
    assert_eq!(clips[0].id, "idle");
    assert_eq!(clips[0].label, "modelPreview.actions.idle");
    assert!(matches!(clips[1].kind, PreviewAnimationKind::Ability));
    assert_eq!(clips[1].label, "Cast");
  }

  #[test]
  fn rejects_non_model_and_parent_paths() {
    assert!(clip_directory("models/a/body.vmdl_c").is_ok());
    assert!(clip_directory("models/../body.vmdl_c").is_err());
    assert!(clip_directory("models/a/mesh.vmesh_c").is_err());
  }
}
