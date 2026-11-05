//! Native source DMX geometry, with optional material resolution for ModelDoc previews.
mod binary;
pub mod geometry;
mod mesh;
#[cfg(test)]
mod tests;
mod text;

use crate::{
    PreviewTexture, Result,
    vmesh::{DecodedPrimitive, ModelGlb},
};

pub struct DmxModel {
    primitives: Vec<DecodedPrimitive>,
    materials: Vec<String>,
    skeleton_only: bool,
    bindings: Vec<(usize, Vec<u32>)>,
}

/// Retain all binary payload bytes except random exporter-generated element IDs.
pub fn canonical_binary_export(bytes: &[u8]) -> Result<Vec<u8>> {
    binary::canonical_export(bytes)
}

impl DmxModel {
    pub fn decode(bytes: &[u8]) -> Result<Self> {
        if bytes.len() > 256 * 1024 * 1024 {
            return Err(binary::invalid("source exceeds 256 MB"));
        }
        let header = &bytes[..bytes.len().min(512)];
        let text_encoding = header
            .windows(3)
            .position(|value| value == b"-->")
            .and_then(|end| std::str::from_utf8(&header[..end]).ok())
            .is_some_and(|value| value.split_whitespace().nth(3) == Some("keyvalues2"));
        let elements = if text_encoding {
            text::parse(bytes)?
        } else {
            binary::parse(bytes)?
        };
        let (primitives, materials, bindings) = mesh::decode_with_bindings(&elements)?;
        Ok(Self {
            primitives,
            bindings,
            materials,
            skeleton_only: !elements.iter().any(|element| element.kind == "DmeMesh"),
        })
    }

    pub fn is_skeleton_only(&self) -> bool {
        self.skeleton_only
    }

    pub fn materials(&self) -> &[String] {
        &self.materials
    }

    /// Apply a saved material-group visibility recipe to source faces.
    pub fn hide_materials(&mut self, hidden: &[String], remaps: &[(String, String)]) -> bool {
        let mut retained = Vec::new();
        let mut index = 0;
        self.primitives.retain(|primitive| {
            let material = primitive
                .material
                .checked_sub(1)
                .and_then(|index| self.materials.get(index));
            let material = material.map(|path| {
                remaps
                    .iter()
                    .find(|(from, _)| from.eq_ignore_ascii_case(path))
                    .map_or(path.as_str(), |(_, to)| to.as_str())
            });
            let keep = !material.is_some_and(|path| {
                hidden
                    .iter()
                    .any(|hidden| hidden.eq_ignore_ascii_case(path.trim_end_matches("_c")))
            });
            if keep && let Some(binding) = self.bindings.get(index) {
                retained.push(binding.clone());
            }
            index += 1;
            keep
        });
        self.bindings = retained;
        !self.primitives.is_empty()
    }

    /// Resolve face materials exactly; missing resources keep the untextured fallback.
    pub fn into_glb(
        mut self,
        textures: &[PreviewTexture],
        remaps: &[(String, String)],
    ) -> Result<ModelGlb> {
        let mut used = Vec::new();
        let indices = self
            .materials
            .iter()
            .map(|path| {
                let path = remaps
                    .iter()
                    .find(|(from, _)| from.eq_ignore_ascii_case(path))
                    .map_or(path.as_str(), |(_, to)| to.as_str());
                let path = path.replace('\\', "/").to_ascii_lowercase();
                let path = if path.ends_with(".vmat") {
                    format!("{path}_c")
                } else {
                    path
                };
                let Some(texture) = textures.iter().find(|texture| {
                    texture
                        .material
                        .as_deref()
                        .is_some_and(|material| material.eq_ignore_ascii_case(&path))
                }) else {
                    return 0;
                };
                let index = used
                    .iter()
                    .position(|existing: &PreviewTexture| existing.material == texture.material)
                    .unwrap_or_else(|| {
                        used.push(texture.clone());
                        used.len() - 1
                    });
                index + 1
            })
            .collect::<Vec<_>>();
        for primitive in &mut self.primitives {
            primitive.material = primitive
                .material
                .checked_sub(1)
                .and_then(|index| indices.get(index))
                .copied()
                .unwrap_or(0);
        }
        let mut model =
            crate::vmesh::model_from_decoded_primitives(&self.primitives, &used, None, None)?;
        if !self.bindings.is_empty() {
            model.glb = geometry::attach_bindings(&model.glb, &self.bindings)?;
        }
        Ok(model)
    }
}

/// Decode binary DMX model geometry without a compiler or external application.
pub fn decode_dmx_glb(bytes: &[u8]) -> Result<ModelGlb> {
    DmxModel::decode(bytes)?.into_glb(&[], &[])
}
