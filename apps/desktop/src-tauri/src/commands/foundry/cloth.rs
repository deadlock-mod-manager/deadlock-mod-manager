use serde::Serialize;
use source2_model::fe_model;
use ts_rs::TS;

use super::animation::invalid;
use super::particles::{effect_model, effect_slot};
use crate::errors::Error;

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewClothNode {
  pub name: String,
  pub parent: i32,
  pub is_static: bool,
  pub bind_position: [f32; 3],
  pub bind_rotation: [f32; 4],
  pub gravity: f32,
  pub damping: f32,
  pub animation_force_attraction: f32,
  pub animation_vertex_attraction: f32,
  pub collision_radius: f32,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewClothRod {
  pub nodes: [u16; 2],
  pub min_distance: f32,
  pub max_distance: f32,
  pub weight0: f32,
  pub relaxation: f32,
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewClothStrayRadius {
  pub node: u16,
  pub max_distance: f32,
  pub relaxation: f32,
}

/// Two spheres `[x, y, z, radius]` in the local frame of `node`; equal for a sphere.
#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewClothCollider {
  pub node: u16,
  pub spheres: [[f32; 4]; 2],
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewClothNodeBase {
  pub node: u16,
  pub x0: u16,
  pub x1: u16,
  pub y0: u16,
  pub y1: u16,
  pub q_adjust: [f32; 4],
}

#[derive(Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewCloth {
  pub nodes: Vec<PreviewClothNode>,
  pub node_bases: Vec<PreviewClothNodeBase>,
  pub rods: Vec<PreviewClothRod>,
  pub stray_radii: Vec<PreviewClothStrayRadius>,
  pub colliders: Vec<PreviewClothCollider>,
}

impl From<fe_model::ClothModel> for PreviewCloth {
  fn from(cloth: fe_model::ClothModel) -> Self {
    Self {
      node_bases: cloth
        .node_bases
        .into_iter()
        .map(|base| PreviewClothNodeBase {
          node: base.node,
          x0: base.x0,
          x1: base.x1,
          y0: base.y0,
          y1: base.y1,
          q_adjust: base.q_adjust,
        })
        .collect(),
      nodes: cloth
        .nodes
        .into_iter()
        .map(|node| PreviewClothNode {
          name: node.name,
          parent: node.parent,
          is_static: node.is_static,
          bind_position: node.bind_position,
          bind_rotation: node.bind_rotation,
          gravity: node.gravity,
          damping: node.damping,
          animation_force_attraction: node.animation_force_attraction,
          animation_vertex_attraction: node.animation_vertex_attraction,
          collision_radius: node.collision_radius,
        })
        .collect(),
      rods: cloth
        .rods
        .into_iter()
        .map(|rod| PreviewClothRod {
          nodes: rod.nodes,
          min_distance: rod.min_distance,
          max_distance: rod.max_distance,
          weight0: rod.weight0,
          relaxation: rod.relaxation,
        })
        .collect(),
      stray_radii: cloth
        .stray_radii
        .into_iter()
        .map(|stray| PreviewClothStrayRadius {
          node: stray.node,
          max_distance: stray.max_distance,
          relaxation: stray.relaxation,
        })
        .collect(),
      colliders: cloth
        .colliders
        .into_iter()
        .map(|collider| PreviewClothCollider {
          node: collider.node,
          spheres: collider.spheres,
        })
        .collect(),
    }
  }
}

/// The model's cloth setup, or `None` when nothing on it is simulated.
#[tauri::command]
pub async fn foundry_decode_cloth(
  file_path: String,
  entry_path: String,
) -> Result<Option<PreviewCloth>, Error> {
  let permit = effect_slot()
    .clone()
    .acquire_owned()
    .await
    .map_err(invalid)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    let (_, resource) = effect_model(
      &file_path,
      &entry_path,
      "Cloth requires a compiled character model",
    )?;
    Ok(
      fe_model::parse_model_cloth(&resource)
        .map_err(invalid)?
        .map(PreviewCloth::from),
    )
  })
  .await
  .map_err(invalid)?
}
