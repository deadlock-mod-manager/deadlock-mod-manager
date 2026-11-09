use super::*;

pub(super) struct EncodedSkin {
    pub bones: [u16; 4],
    pub weights: [u8; 4],
}

pub(super) fn encode(
    patch: &AttachedPatch<'_>,
    mesh: &Value,
    model: &Value,
    mesh_index: usize,
    rigid: Option<usize>,
) -> Result<Option<Vec<EncodedSkin>>> {
    let Some(skin) = patch.skin else {
        return rigid
            .map(|bone| {
                let bone = u16::try_from(bone)
                    .map_err(|_| invalid("Attachment palette exceeds 16-bit indices"))?;
                Ok((0..patch.vertices.len())
                    .map(|_| EncodedSkin {
                        bones: [bone, 0, 0, 0],
                        weights: [255, 0, 0, 0],
                    })
                    .collect())
            })
            .transpose();
    };
    if skin.len() != patch.vertices.len() || rigid.is_none() {
        return Err(invalid(
            "Surface skinning must cover every vertex of a skinned host",
        ));
    }
    let names = array(
        model
            .get("m_modelSkeleton")
            .ok_or_else(|| invalid("Missing model skeleton"))?,
        "m_boneName",
    )?;
    let bones = array(
        mesh.get("m_skeleton")
            .ok_or_else(|| invalid("Missing mesh skeleton"))?,
        "m_bones",
    )?;
    // CSDK may sanitize mesh bone names (for example '$' to '_'); the remap is authoritative.
    let palette: BTreeMap<_, _> = attachment::palette(model, mesh_index)?
        .iter()
        .enumerate()
        .take(bones.len())
        .map(|(local, global)| {
            global
                .as_f64()
                .map(|global| (global as usize, local))
                .ok_or_else(|| invalid("Invalid surface bone remap"))
        })
        .collect::<Result<_>>()?;
    skin.iter()
        .map(|vertex| {
            if vertex.weights.iter().any(|w| !w.is_finite() || *w < 0.) {
                return Err(invalid(
                    "Surface bone weights must be finite and nonnegative",
                ));
            }
            let total: f64 = vertex.weights.iter().map(|w| f64::from(*w)).sum();
            if total <= 0. {
                return Err(invalid("Surface bone weights must have positive coverage"));
            }
            let mut indices = [0; 4];
            let scaled: [f64; 4] =
                std::array::from_fn(|i| f64::from(vertex.weights[i]) / total * 255.);
            let mut weights = scaled.map(|w| w.floor() as u8);
            let mut order = [0, 1, 2, 3];
            order.sort_by(|a, b| scaled[*b].fract().total_cmp(&scaled[*a].fract()));
            // Largest remainders keep every quantized vertex's total exactly 255.
            let remaining = 255 - weights.iter().map(|w| usize::from(*w)).sum::<usize>();
            for slot in order.into_iter().take(remaining) {
                weights[slot] += 1;
            }
            for (slot, weight) in vertex.weights.iter().enumerate() {
                if *weight == 0. {
                    continue;
                }
                let global = usize::from(vertex.bones[slot]);
                if global >= names.len() {
                    return Err(invalid("Surface bone is absent from the model skeleton"));
                }
                let local = palette
                    .get(&global)
                    .copied()
                    .filter(|local| *local < bones.len())
                    .ok_or_else(|| invalid("Surface bone is absent from the host palette"))?;
                indices[slot] = u16::try_from(local)
                    .ok()
                    .filter(|i| *i <= i16::MAX as u16)
                    .ok_or_else(|| invalid("Surface palette exceeds signed 16-bit indices"))?;
            }
            Ok(EncodedSkin {
                bones: indices,
                weights,
            })
        })
        .collect::<Result<Vec<_>>>()
        .map(Some)
}
