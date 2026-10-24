use std::sync::{Arc, OnceLock};

use base64::Engine;
use serde::Serialize;
use source2_model::vpk_extract::VpkArchive;
use source2_model::{Resource, particles};
use ts_rs::TS;

use super::ability_vfx::caster_particles;
use super::animation::{archives, invalid};
use crate::errors::Error;

/// Particle textures are small on screen; this keeps the IPC payload modest.
const TEXTURE_SIDE: u32 = 256;
const MAX_TEXTURES: usize = 64;
const MAX_EFFECT_MODEL_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn effect_slot() -> &'static Arc<tokio::sync::Semaphore> {
  static SLOT: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
  SLOT.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(1)))
}

/// Opens the archive and parses the compiled model at `entry_path`.
pub(super) fn effect_model(
  file_path: &str,
  entry_path: &str,
  rejection: &str,
) -> Result<(VpkArchive, Resource), Error> {
  if !entry_path.ends_with(".vmdl_c") || entry_path.contains("..") {
    return Err(invalid(rejection));
  }
  let (archive, _) = archives(file_path)?;
  let resource = Resource::parse(
    archive
      .extract_entry_limited(entry_path, MAX_EFFECT_MODEL_BYTES)
      .map_err(invalid)?,
  )
  .map_err(invalid)?;
  Ok((archive, resource))
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum PreviewParticleIssue {
  SystemLimit,
  DepthLimit,
  Cycle,
  Unavailable,
  TextureLimit,
  MissingTexture,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewParticleDiagnostic {
  pub path: String,
  pub code: PreviewParticleIssue,
  pub detail: String,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewAttachment {
  pub name: String,
  pub bone: String,
  pub offset: [f32; 3],
  pub rotation: [f32; 4],
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewParticleSystem {
  pub path: String,
  /// The system's KV3 definition as JSON text, parsed and validated by the renderer.
  pub definition: String,
  pub children: Vec<PreviewParticleSystem>,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewSpriteFrame {
  pub duration: f32,
  pub min: [f32; 2],
  pub max: [f32; 2],
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewSpriteSequence {
  pub frames_per_second: f32,
  pub frames: Vec<PreviewSpriteFrame>,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewParticleTexture {
  pub path: String,
  pub data_url: String,
  pub sequences: Vec<PreviewSpriteSequence>,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewParticles {
  pub attachments: Vec<PreviewAttachment>,
  pub systems: Vec<PreviewParticleSystem>,
  pub textures: Vec<PreviewParticleTexture>,
  pub diagnostics: Vec<PreviewParticleDiagnostic>,
  pub source_models: Vec<String>,
}

impl From<particles::ParticleSystemFile> for PreviewParticleSystem {
  fn from(system: particles::ParticleSystemFile) -> Self {
    Self {
      path: system.path,
      definition: system.definition.to_string(),
      children: system.children.into_iter().map(Self::from).collect(),
    }
  }
}

/// The particle effects the model shows in previews, ready to simulate.
#[tauri::command]
pub async fn foundry_decode_particles(
  file_path: String,
  entry_path: String,
) -> Result<PreviewParticles, Error> {
  let permit = effect_slot()
    .clone()
    .acquire_owned()
    .await
    .map_err(invalid)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    let (archive, resource) = effect_model(
      &file_path,
      &entry_path,
      "Particles require a compiled character model",
    )?;
    let discovery = particles::discover_model_preview_particles(&archive, &resource, &entry_path)
      .map_err(invalid)?;
    preview_particles(
      &archive,
      &resource,
      &discovery.paths,
      discovery.source_models,
    )
  })
  .await
  .map_err(invalid)?
}

/// The effects an ability plays on its caster, split by when they start.
#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewAbilityParticles {
  /// From the start of the ability's animation.
  pub cast: PreviewParticles,
  /// From the animation's firing phase: beams, shots, swings.
  pub release: PreviewParticles,
}

/// The particle effects `ability_class` plays on its caster, for previewing
/// that ability's animation on the model at `entry_path`.
#[tauri::command]
pub async fn foundry_decode_ability_particles(
  file_path: String,
  entry_path: String,
  ability_class: String,
) -> Result<PreviewAbilityParticles, Error> {
  let permit = effect_slot()
    .clone()
    .acquire_owned()
    .await
    .map_err(invalid)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    let (archive, resource) = effect_model(
      &file_path,
      &entry_path,
      "Ability effects require a compiled character model",
    )?;
    let particles = caster_particles(&ability_class);
    Ok(PreviewAbilityParticles {
      cast: preview_particles(&archive, &resource, &particles.cast, Vec::new())?,
      release: preview_particles(&archive, &resource, &particles.release, Vec::new())?,
    })
  })
  .await
  .map_err(invalid)?
}

/// Loads `paths` with their textures and the model's attachment points.
fn preview_particles(
  archive: &VpkArchive,
  resource: &Resource,
  paths: &[String],
  source_models: Vec<String>,
) -> Result<PreviewParticles, Error> {
  let loaded = particles::load_particle_systems(archive, paths);
  let mut diagnostics: Vec<_> = loaded
    .diagnostics
    .into_iter()
    .map(|diagnostic| {
      let (code, detail) = match diagnostic.issue {
        particles::ParticleLoadIssue::SystemLimit => {
          (PreviewParticleIssue::SystemLimit, String::new())
        }
        particles::ParticleLoadIssue::DepthLimit => {
          (PreviewParticleIssue::DepthLimit, String::new())
        }
        particles::ParticleLoadIssue::Cycle => (PreviewParticleIssue::Cycle, String::new()),
        particles::ParticleLoadIssue::Unavailable(detail) => {
          (PreviewParticleIssue::Unavailable, detail)
        }
      };
      PreviewParticleDiagnostic {
        path: diagnostic.path,
        code,
        detail,
      }
    })
    .collect();
  let systems = loaded.systems;
  let texture_paths = systems
    .iter()
    .flat_map(particles::particle_texture_paths)
    .collect::<std::collections::BTreeSet<_>>();
  let mut textures = Vec::new();
  for (index, path) in texture_paths.into_iter().enumerate() {
    if index >= MAX_TEXTURES {
      diagnostics.push(PreviewParticleDiagnostic {
        path,
        code: PreviewParticleIssue::TextureLimit,
        detail: String::new(),
      });
      continue;
    }
    match particles::particle_texture(archive, &path, TEXTURE_SIDE) {
      Ok(texture) => textures.push(PreviewParticleTexture {
        data_url: format!(
          "data:image/png;base64,{}",
          base64::engine::general_purpose::STANDARD.encode(&texture.png)
        ),
        sequences: texture
          .sequences
          .into_iter()
          .map(|sequence| PreviewSpriteSequence {
            frames_per_second: sequence.frames_per_second,
            frames: sequence
              .frames
              .into_iter()
              .map(|frame| PreviewSpriteFrame {
                duration: frame.display_time,
                min: frame.cropped_min,
                max: frame.cropped_max,
              })
              .collect(),
          })
          .collect(),
        path,
      }),
      Err(error) => diagnostics.push(PreviewParticleDiagnostic {
        path,
        code: PreviewParticleIssue::MissingTexture,
        detail: error.to_string(),
      }),
    }
  }
  Ok(PreviewParticles {
    attachments: particles::model_attachments(resource)
      .map_err(invalid)?
      .into_iter()
      .map(|attachment| PreviewAttachment {
        name: attachment.name,
        bone: attachment.bone,
        offset: attachment.offset,
        rotation: attachment.rotation,
      })
      .collect(),
    systems: systems
      .into_iter()
      .map(PreviewParticleSystem::from)
      .collect(),
    textures,
    diagnostics,
    source_models,
  })
}
