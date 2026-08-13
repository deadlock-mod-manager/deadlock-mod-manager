//! Surgical, byte-faithful KV3 edits.
//!
//! Re-encoding a model `MDAT` from the decoded [`Value`](super::Value) tree is too
//! lossy for the engine (it drops value flags and auxiliary-buffer typed-array
//! tags; see [`super::rewrap`]). For draw-call removal we therefore do **not**
//! re-encode: we [`rewrap_uncompressed`] the block (preserving every structural
//! byte) and then zero a few scalar fields *in place*. A draw call whose
//! `m_nIndexCount` is 0 submits no primitives, so the part stops rendering while
//! the block stays byte-identical everywhere else.
//!
//! [`neutralize_draw_calls`] walks the KV3 value tree exactly as the reader does
//! (same lane/cursor discipline), but tracking each scalar's absolute byte offset
//! in the block instead of building a tree, so it can locate and zero the
//! `m_nIndexCount` of specific `m_sceneObjects[so].m_drawCalls[dc]` entries. Only
//! the v5 two-buffer layout (what Deadlock models use) is handled.

// The KV3 header stores its counts/sizes as i32; reading them as usize is the
// same intended reinterpretation the reader makes (counts are never negative).
#![allow(clippy::cast_sign_loss)]

use super::node;
use super::rewrap::{
    decompress_v5_working, is_blobbed_lz4_v5, reassemble_blobbed_v5, rewrap_uncompressed,
};
use super::types::Value;
use crate::source2::error::DecodeError;

const B1: usize = 0;
const B2: usize = 1;
const B4: usize = 2;
const B8: usize = 3;

/// Zeroes the `m_nIndexCount` of each `(scene_object, draw_call)` in `targets`,
/// so those draw calls render nothing, returning the edited (uncompressed) block.
/// The input may be compressed; it is re-wrapped uncompressed first. Every byte
/// other than the targeted counts is preserved (flags, typed arrays, structure),
/// which is what the engine's model loader requires.
///
/// Errors if the block is not v5 (the model `MDAT` layout) or if a target's
/// `m_nIndexCount` is stored as a tagless zero/one constant (never the case for a
/// real, non-empty draw call).
pub fn neutralize_draw_calls(
    block: &[u8],
    targets: &[(usize, usize)],
) -> Result<Vec<u8>, DecodeError> {
    let mut out = rewrap_uncompressed(block)?;
    if out.len() < 120 || u32::from_le_bytes([out[0], out[1], out[2], out[3]]) & 0xFF != 5 {
        return Err(DecodeError::Kv3("draw-call neutralize requires KV3 v5"));
    }

    let patches = {
        let mut w = Walk::new(&out, targets)?;
        // The root value's type byte leads the type stream (the reader consumes it
        // before reading the root); consume it too, then walk the root value.
        let root = w.read_type()?;
        w.value(root, Where::Root)?;
        w.patches
    };
    if patches.is_empty() {
        return Err(DecodeError::Model(
            "no targeted draw call had a patchable m_nIndexCount",
        ));
    }
    for (off, width) in patches {
        for b in out.get_mut(off..off + width).ok_or(DecodeError::Kv3(
            "patch offset out of range (walker/layout mismatch)",
        ))? {
            *b = 0;
        }
    }
    Ok(out)
}

/// One step of a KV3 path: an object member key or an array element index.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Seg {
    /// Descend into the object member with this name.
    Key(String),
    /// Descend into this array element.
    Index(usize),
}

/// Sets integer scalar fields located by KV3 path, in place, on a byte-faithful
/// uncompressed re-wrap of `block` (so value flags + typed arrays are preserved,
/// as the engine's model loader requires). Each edit is a `(path, value)`: the
/// path must resolve to exactly one settable integer scalar (`INT32`/`UINT32`/
/// `INT16`/`UINT16`/`INT32_AS_BYTE` and their 64-bit forms), and `value` must fit
/// that field's existing on-disk width.
///
/// This is the additive cousin of [`neutralize_draw_calls`] (which only zeroes):
/// it can rewrite a buffer's element count / stride, a layout field's format /
/// offset, or a draw call's vertex/index counts when replacing a mesh part in
/// place. It does **not** change a field's storage width: if the new value does
/// not fit the original encoding (e.g. a byte-stored value growing past 255),
/// it errors rather than corrupt the block (that needs a structural re-encode).
///
/// Errors if the block is not v4/v5, if any path is missing / not an integer
/// scalar / ambiguous, or if a value does not fit its field's width.
pub fn set_scalars(block: &[u8], edits: &[(Vec<Seg>, i64)]) -> Result<Vec<u8>, DecodeError> {
    // A blobbed LZ4 v5 block (a `.vnmclip_c` with its pose blob, or a blobbed
    // `.vmat_c` with `countBlocks > 0`) cannot ship uncompressed without the engine
    // misreading its blob framing, so it is decompressed to a walkable working copy,
    // patched, then re-emitted still LZ4-compressed (the blob frames carried through
    // verbatim, exactly as [`set_doubles`] does). Everything else rewraps uncompressed.
    let blobbed = is_blobbed_lz4_v5(block);
    let mut out = if blobbed {
        decompress_v5_working(block)?
    } else {
        rewrap_uncompressed(block)?
    };
    // v5 uses a two-buffer layout (120-byte header); v4 a single buffer (72-byte
    // header). Both patch in place once decompressed; only the lane math differs.
    let version = u32_at(&out, 0)? & 0xFF;
    let min_header = if version == 5 { 120 } else { 72 };
    if out.len() < min_header || (version != 4 && version != 5) {
        return Err(DecodeError::Kv3("scalar patch requires KV3 v4 or v5"));
    }

    let targets: Vec<&[Seg]> = edits.iter().map(|(p, _)| p.as_slice()).collect();
    let (hits, int_type_hits) = {
        let mut w = PathWalk::new(&out, &targets)?;
        let root = w.read_type()?;
        w.value(root)?;
        (w.hits, w.int_type_hits)
    };

    // Every edit must resolve to exactly one settable integer: either a real
    // integer scalar (with a data lane) or a tagless INT64_ZERO/INT64_ONE (the
    // value *is* the type byte, e.g. a material `F_*` feature flag stored as 1).
    // Count across both encodings so a field is patchable whichever way it is
    // stored, but reject anything matching more than one field.
    for i in 0..edits.len() {
        let n = hits.iter().filter(|h| h.edit == i).count()
            + int_type_hits.iter().filter(|h| h.edit == i).count();
        match n {
            0 => {
                return Err(DecodeError::Kv3(
                    "scalar patch path not found or not an integer scalar",
                ));
            }
            1 => {}
            _ => {
                return Err(DecodeError::Kv3(
                    "scalar patch path is ambiguous (matched more than one field)",
                ));
            }
        }
    }

    for h in &hits {
        let bytes = fit_scalar(edits[h.edit].1, h.datatype)?;
        out.get_mut(h.offset..h.offset + bytes.len())
            .ok_or(DecodeError::Kv3("scalar patch offset out of range"))?
            .copy_from_slice(&bytes);
    }
    // Tagless ints carry no data lane, so only 0/1 are representable in place:
    // rewrite the type byte between INT64_ZERO/INT64_ONE, keeping the high flag
    // bits (the int sibling of set_bools' BoolKind::TypeByte).
    for h in &int_type_hits {
        let want = match edits[h.edit].1 {
            0 => node::INT64_ZERO,
            1 => node::INT64_ONE,
            _ => {
                return Err(DecodeError::Kv3(
                    "tagless integer field can only be set to 0 or 1 in place",
                ));
            }
        };
        let b = out
            .get_mut(h.offset)
            .ok_or(DecodeError::Kv3("scalar patch offset out of range"))?;
        *b = (*b & 0xC0) | want;
    }
    if blobbed {
        reassemble_blobbed_v5(block, &out)
    } else {
        Ok(out)
    }
}

/// Sets `DOUBLE` (f64) fields located by KV3 path, in place, on a byte-faithful
/// uncompressed re-wrap of `block`. The double sibling of [`set_scalars`]: built to
/// retint a material's `g_vColorTint` vector (an array of f64 RGBA in a `.vmat_c`)
/// without re-encoding, so the rest of the material (textures, flags, shader) stays
/// byte-identical. Each edit's path must resolve to exactly one **real** `DOUBLE`
/// (8 bytes in the b8 lane); a tagless `DOUBLE_ZERO`/`DOUBLE_ONE` (a 0.0/1.0 with no
/// stored bytes) is not patchable in place and counts as "not found".
///
/// Errors if the block is not v4/v5, or if any path is missing / not a real double
/// / ambiguous.
///
/// A v5 block carrying a binary-blob section (a blobbed `.vmat_c`, `countBlocks >
/// 0`) cannot be shipped uncompressed without the engine misreading its blob
/// framing, so it is **not** rewrapped to `compressionMethod = 0`. Instead it is
/// decompressed to a walkable working copy, patched the same way, then re-emitted
/// still LZ4-compressed (recompressing only the buffer that changed, splicing the
/// blob frames through verbatim). The patch contract is identical either way.
pub fn set_doubles(block: &[u8], edits: &[(Vec<Seg>, f64)]) -> Result<Vec<u8>, DecodeError> {
    // A blobbed LZ4 v5 block is decompressed (but stays logically compressed) so
    // its tail blob framing is preserved on re-emit; everything else rewraps to
    // an uncompressed block that is patched and shipped as-is.
    let blobbed = is_blobbed_lz4_v5(block);
    let mut out = if blobbed {
        decompress_v5_working(block)?
    } else {
        rewrap_uncompressed(block)?
    };
    let version = u32_at(&out, 0)? & 0xFF;
    let min_header = if version == 5 { 120 } else { 72 };
    if out.len() < min_header || (version != 4 && version != 5) {
        return Err(DecodeError::Kv3("double patch requires KV3 v4 or v5"));
    }

    let targets: Vec<&[Seg]> = edits.iter().map(|(p, _)| p.as_slice()).collect();
    let hits = {
        let mut w = PathWalk::new(&out, &targets)?;
        let root = w.read_type()?;
        w.value(root)?;
        w.double_hits
    };

    for i in 0..edits.len() {
        match hits.iter().filter(|h| h.edit == i).count() {
            1 => {}
            0 => {
                return Err(DecodeError::Kv3(
                    "double patch path not found or not a real double",
                ));
            }
            _ => {
                return Err(DecodeError::Kv3(
                    "double patch path is ambiguous (matched more than one field)",
                ));
            }
        }
    }

    for h in &hits {
        let bytes = edits[h.edit].1.to_le_bytes();
        out.get_mut(h.offset..h.offset + 8)
            .ok_or(DecodeError::Kv3("double patch offset out of range"))?
            .copy_from_slice(&bytes);
    }

    if blobbed {
        // Re-emit compressed, recompressing only the buffer the edit landed in and
        // carrying the blob frames through byte-for-byte.
        reassemble_blobbed_v5(block, &out)
    } else {
        Ok(out)
    }
}

/// Sets `FLOAT` (f32) fields located by KV3 path, in place, on a byte-faithful
/// uncompressed re-wrap of `block`. This is the particle-friendly scalar patcher
/// for existing brightness/radius/lifetime-style params that are stored as real
/// f32 values. Tagless numeric constants and doubles are not patched here.
///
/// Errors if the block is not v4/v5, or if any path is missing / not a real float
/// / ambiguous.
pub fn set_floats(block: &[u8], edits: &[(Vec<Seg>, f32)]) -> Result<Vec<u8>, DecodeError> {
    let mut out = rewrap_uncompressed(block)?;
    let version = u32_at(&out, 0)? & 0xFF;
    let min_header = if version == 5 { 120 } else { 72 };
    if out.len() < min_header || (version != 4 && version != 5) {
        return Err(DecodeError::Kv3("float patch requires KV3 v4 or v5"));
    }

    let targets: Vec<&[Seg]> = edits.iter().map(|(p, _)| p.as_slice()).collect();
    let hits = {
        let mut w = PathWalk::new(&out, &targets)?;
        let root = w.read_type()?;
        w.value(root)?;
        w.float_hits
    };

    for i in 0..edits.len() {
        match hits.iter().filter(|h| h.edit == i).count() {
            1 => {}
            0 => {
                return Err(DecodeError::Kv3(
                    "float patch path not found or not a float",
                ));
            }
            _ => {
                return Err(DecodeError::Kv3(
                    "float patch path is ambiguous (matched more than one field)",
                ));
            }
        }
    }

    for h in &hits {
        let bytes = edits[h.edit].1.to_le_bytes();
        out.get_mut(h.offset..h.offset + 4)
            .ok_or(DecodeError::Kv3("float patch offset out of range"))?
            .copy_from_slice(&bytes);
    }
    Ok(out)
}

/// Sets `STRING` fields located by KV3 path by redirecting the field's string id
/// to another string already present in the same KV3 string table.
///
/// This deliberately does **not** add new strings or rewrite the string table:
/// changing table length would be a structural edit. The safe first use is enum
/// probing, e.g. changing an existing `m_nInputMode` to a different
/// `PF_INPUT_MODE_*` value that already appears somewhere in the particle.
/// Passing an empty string writes Source 2's `-1` string id.
///
/// Errors if the block is not v4/v5, if any path is missing / not a string /
/// ambiguous, or if a requested target string is not already interned in the
/// block.
pub fn set_strings(block: &[u8], edits: &[(Vec<Seg>, String)]) -> Result<Vec<u8>, DecodeError> {
    // Same blobbed-LZ4-v5 handling as [`set_doubles`]/[`set_scalars`]: a blobbed
    // `.vmat_c` is decompressed-but-kept-compressed so its blob framing survives.
    let blobbed = is_blobbed_lz4_v5(block);
    let mut out = if blobbed {
        decompress_v5_working(block)?
    } else {
        rewrap_uncompressed(block)?
    };
    redirect_interned_strings(&mut out, edits)?;
    if blobbed {
        reassemble_blobbed_v5(block, &out)
    } else {
        Ok(out)
    }
}

/// Redirect the `STRING` fields at `edits`' paths to other strings **already
/// interned** in the table, patching the working block `out` in place (each hit's
/// 4-byte string id is rewritten; no table growth, no size change). Shared by
/// [`set_strings`] and the blobbed branch of [`set_strings_adding`], which first
/// grows the table so the targets become interned, then calls this.
fn redirect_interned_strings(
    out: &mut [u8],
    edits: &[(Vec<Seg>, String)],
) -> Result<(), DecodeError> {
    let version = u32_at(out, 0)? & 0xFF;
    let min_header = if version == 5 { 120 } else { 72 };
    if out.len() < min_header || (version != 4 && version != 5) {
        return Err(DecodeError::Kv3("string patch requires KV3 v4 or v5"));
    }

    let targets: Vec<&[Seg]> = edits.iter().map(|(p, _)| p.as_slice()).collect();
    let (hits, strings) = {
        let mut w = PathWalk::new(out, &targets)?;
        let root = w.read_type()?;
        w.value(root)?;
        (w.string_hits, w.strings)
    };

    for i in 0..edits.len() {
        match hits.iter().filter(|h| h.edit == i).count() {
            1 => {}
            0 => {
                return Err(DecodeError::Kv3(
                    "string patch path not found or not a string",
                ));
            }
            _ => {
                return Err(DecodeError::Kv3(
                    "string patch path is ambiguous (matched more than one field)",
                ));
            }
        }
    }

    for h in &hits {
        let target = &edits[h.edit].1;
        let id = if target.is_empty() {
            u32::MAX
        } else {
            u32::try_from(
                strings
                    .iter()
                    .position(|s| s == target)
                    .ok_or(DecodeError::Kv3(
                        "string patch target is not present in the KV3 string table",
                    ))?,
            )
            .map_err(|_| DecodeError::Kv3("string table id does not fit u32"))?
        };
        out.get_mut(h.offset..h.offset + 4)
            .ok_or(DecodeError::Kv3("string patch offset out of range"))?
            .copy_from_slice(&id.to_le_bytes());
    }
    Ok(())
}

/// Sets `STRING` fields by path, **adding** any target string that is not already
/// interned in the KV3 v5 string table (the structural cousin of [`set_strings`],
/// which can only redirect to an already-present value).
///
/// Each distinct, non-empty target string absent from the table is appended via
/// [`append_strings_v5`] (which rebuilds the aux buffer byte-faithfully and fixes
/// the header sizes); then the field redirect is applied by [`set_strings`] exactly
/// as usual. The decoded tree is unchanged except at the targeted fields, so the
/// engine's particle loader accepts the result just like the existing in-place
/// patches. This is the lever for true animated VFX: pointing a gradient's
/// `m_FloatInterp/m_nType` at `PF_TYPE_COLLECTION_AGE` and `m_nInputMode` at
/// `PF_INPUT_MODE_LOOPED` even when those enum strings were not already present.
///
/// Only v5 supports the append; a v4 block falls back to [`set_strings`] (which
/// succeeds only if every target is already interned, else errors so the caller can
/// skip that entry). Errors if the block is not v4/v5, or for the usual
/// missing/ambiguous/not-a-string path failures from [`set_strings`].
pub fn set_strings_adding(
    block: &[u8],
    edits: &[(Vec<Seg>, String)],
) -> Result<Vec<u8>, DecodeError> {
    let mut wanted: Vec<String> = Vec::new();
    for (_, s) in edits {
        if !s.is_empty() && !wanted.contains(s) {
            wanted.push(s.clone());
        }
    }

    // A blobbed LZ4 v5 block (a blobbed `.vmat_c`, `countBlocks > 0`) cannot be
    // rewrapped to `comp = 0` (the engine misframes the blob and renders the covered
    // mesh as a red error material). Mirror [`insert_array_element_blob_aware`]: grow
    // the string table on a decompressed-but-logically-compressed working copy, redirect
    // the fields to the now-interned strings, then re-emit `comp = 1` with the binary
    // blob frames spliced through byte-for-byte (no new blobs). This is what lets a
    // copied material reference brand-new texture paths in place.
    if is_blobbed_lz4_v5(block) {
        let working = decompress_v5_working(block)?;
        if u32_at(&working, 0)? & 0xFF != 5 {
            return Err(DecodeError::Kv3("blobbed string append requires KV3 v5"));
        }
        let mut grown = append_strings_v5(&working, &wanted)?;
        redirect_interned_strings(&mut grown, edits)?;
        let old_blob_count = usize::try_from(i32_at(block, 56)?)
            .map_err(|_| DecodeError::Kv3("negative blob count"))?;
        // No new blobs; appending an empty slice at the end carries every existing
        // blob frame through verbatim while recompressing the grown buf1.
        return finalize_blob_block(block, &grown, old_blob_count, &[]);
    }

    let out = rewrap_uncompressed(block)?;
    let version = u32_at(&out, 0)? & 0xFF;
    let appended = match version {
        5 => append_strings_v5(&out, &wanted)?,
        4 => append_strings_v4(&out, &wanted)?,
        // Other versions are not patched in place; set_strings reports the error.
        _ => out,
    };
    set_strings(&appended, edits)
}

/// Inserts `value` into the array at `array_path[index]`, adding any keys/string
/// values that are not already interned in the KV3 string table.
///
/// This is the structural sibling of [`set_strings_adding`]. It preserves the
/// existing typed-lane layout by walking to the insertion point, capturing the
/// current b1/b2/b4/b8/type/object-length cursors, serializing only the inserted
/// subtree, then rebuilding the affected buffer with those serialized bytes
/// spliced into each lane at the captured cursor. Existing values and type flags
/// are carried through byte-for-byte; only the target array count, header
/// counts/sizes, string table, and inserted subtree bytes change.
///
/// Supports v4/v5 main-buffer arrays (`ARRAY`, `ARRAY_TYPED`, and
/// `ARRAY_TYPE_BYTE_LENGTH`). Auxiliary-buffer arrays and binary-blob sections are
/// deliberately refused until there is a concrete particle use case.
pub fn insert_array_element_adding(
    block: &[u8],
    array_path: &[Seg],
    index: usize,
    value: &Value,
) -> Result<Vec<u8>, DecodeError> {
    // A block that carries (or will carry, because the inserted value holds a
    // `Value::Binary`) a binary-blob section takes the compressed v5 path: the
    // engine misreads uncompressed blob framing (stale LZ4 frame table; the
    // covered mesh renders as a red wireframe error material), so the result
    // must stay in the native LZ4 form.
    let has_blobs = block.len() >= 60 && i32_at(block, 56)? != 0;
    if has_blobs || value_contains_blob(value) {
        return insert_array_element_blob_aware(block, array_path, index, value);
    }

    let out = rewrap_uncompressed(block)?;
    let version = u32_at(&out, 0)? & 0xFF;
    if version != 4 && version != 5 {
        return Err(DecodeError::Kv3("array insert requires KV3 v4 or v5"));
    }

    let mut wanted = Vec::new();
    collect_value_strings(value, &mut wanted);
    let with_strings = match version {
        5 => append_strings_v5(&out, &wanted)?,
        4 => append_strings_v4(&out, &wanted)?,
        _ => unreachable!(),
    };

    let site = {
        let mut w = InsertWalk::new(&with_strings, array_path, index)?;
        let root = w.read_type()?;
        w.value(root)?;
        w.finish()?
    };

    let strings = lanes(&with_strings, version)?.strings;
    let root_type = value_wire_type(value);
    let include_root_type = site.subtype.is_none();
    if let Some(subtype) = site.subtype {
        if root_type != subtype {
            return Err(DecodeError::Kv3(
                "inserted value type does not match target typed-array subtype",
            ));
        }
    }
    let encoded = encode_insert_value(value, version, &strings, include_root_type)?;

    match version {
        5 => rebuild_v5_with_insert(&with_strings, &site, &encoded),
        4 => rebuild_v4_with_insert(&with_strings, &site, &encoded),
        _ => unreachable!(),
    }
}

fn value_contains_blob(value: &Value) -> bool {
    match value {
        Value::Binary(_) => true,
        Value::Array(items) => items.iter().any(value_contains_blob),
        Value::Object(pairs) => pairs.iter().any(|(_, v)| value_contains_blob(v)),
        _ => false,
    }
}

/// One LZ4 blob frame covers at most this many uncompressed bytes.
const BLOB_FRAME_SIZE: usize = 16384;

/// How many LZ4 frames carry a blob of `len` uncompressed bytes.
fn blob_frame_count(len: usize) -> usize {
    len.div_ceil(BLOB_FRAME_SIZE).max(1)
}

/// Absolute byte range of the v5 main-buffer type stream, mirroring
/// [`rebuild_v5_with_insert`]'s layout math.
fn v5_types_range(block: &[u8]) -> Result<(usize, usize), DecodeError> {
    const HEADER: usize = 120;
    let unc1 = i32_at(block, 72)? as usize;
    let main_b1 = i32_at(block, 88)? as usize;
    let main_b2 = i32_at(block, 92)? as usize;
    let main_b4 = i32_at(block, 96)? as usize;
    let main_b8 = i32_at(block, 100)? as usize;
    let main_obj = i32_at(block, 108)? as usize;
    let count_types = i32_at(block, 40)? as usize;
    let buf2 = HEADER
        .checked_add(unc1)
        .ok_or(DecodeError::Kv3("buf1 extent overflow"))?;
    let mut off = main_obj * 4;
    off += main_b1;
    lane(&mut off, main_b2, 2);
    lane(&mut off, main_b4, 4);
    lane(&mut off, main_b8, 8);
    let start = buf2 + off;
    let end = start
        .checked_add(count_types)
        .ok_or(DecodeError::Kv3("type stream extent overflow"))?;
    Ok((start, end))
}

/// Counts `BINARY_BLOB` nodes in the type stream before the absolute offset
/// `before_abs` (flag bytes are skipped, ids masked the way the v5 reader
/// does). This is the document-order index a blob inserted at that position
/// takes in the blob section.
fn count_blob_nodes_before(block: &[u8], before_abs: usize) -> Result<usize, DecodeError> {
    let (start, end) = v5_types_range(block)?;
    let stop = before_abs.clamp(start, end);
    let mut count = 0usize;
    let mut i = start;
    while i < stop {
        let t = *block
            .get(i)
            .ok_or(DecodeError::Kv3("type stream underrun"))?;
        if t & 0x80 != 0 {
            i += 2;
        } else {
            i += 1;
        }
        if (t & 0x3F) == node::BINARY_BLOB {
            count += 1;
        }
    }
    Ok(count)
}

/// Structural array insert into a v5 block that has (or gains) a binary-blob
/// section. The block is decompressed into a walkable working copy, the
/// regular lane-splice insert runs on it, the blob bookkeeping (per-blob
/// length table, LZ4 per-frame size table, header counts) is updated, and the
/// result is re-emitted `compressionMethod = 1` with the untouched blob
/// frames spliced through byte-for-byte and the new blob's frames inserted at
/// its document-order position.
fn insert_array_element_blob_aware(
    block: &[u8],
    array_path: &[Seg],
    index: usize,
    value: &Value,
) -> Result<Vec<u8>, DecodeError> {
    const HEADER: usize = 120;
    if block.len() < HEADER {
        return Err(DecodeError::Kv3("block too short for a v5 header"));
    }
    let version = u32_at(block, 0)? & 0xFF;
    if version != 5 {
        return Err(DecodeError::Kv3(
            "blob-bearing array insert requires KV3 v5",
        ));
    }
    let compression = u32_at(block, 20)?;
    let old_blob_count =
        usize::try_from(i32_at(block, 56)?).map_err(|_| DecodeError::Kv3("negative blob count"))?;
    if old_blob_count > 0 && compression != 1 {
        return Err(DecodeError::Kv3(
            "only LZ4-compressed blob sections are supported",
        ));
    }

    // Walkable copy: [header][raw buf1][raw buf2]; blob frames omitted (a
    // BINARY_BLOB node consumes no typed-lane bytes).
    let working = decompress_v5_working(block)?;

    let mut wanted = Vec::new();
    collect_value_strings(value, &mut wanted);
    let with_strings = append_strings_v5(&working, &wanted)?;

    let site = {
        let mut w = InsertWalk::new(&with_strings, array_path, index)?;
        let root = w.read_type()?;
        w.value(root)?;
        w.finish()?
    };
    let blob_index = count_blob_nodes_before(&with_strings, site.cursors.types)?;

    let strings = lanes(&with_strings, 5)?.strings;
    let root_type = value_wire_type(value);
    let include_root_type = site.subtype.is_none();
    if let Some(subtype) = site.subtype {
        if root_type != subtype {
            return Err(DecodeError::Kv3(
                "inserted value type does not match target typed-array subtype",
            ));
        }
    }
    let encoded = encode_insert_value(value, 5, &strings, include_root_type)?;
    let rebuilt = rebuild_v5_with_insert(&with_strings, &site, &encoded)?;

    finalize_blob_block(block, &rebuilt, blob_index, &encoded.blobs)
}

/// Re-emits `rebuilt` (an uncompressed `[header][raw1][raw2]` working block
/// whose lanes already carry the inserted subtree) as a `compressionMethod=1`
/// block, inserting `new_blobs` into the blob section at document-order
/// position `blob_index`. `orig` supplies the untouched compressed buffers
/// and blob frames.
#[allow(clippy::too_many_lines)]
fn finalize_blob_block(
    orig: &[u8],
    rebuilt: &[u8],
    blob_index: usize,
    new_blobs: &[Vec<u8>],
) -> Result<Vec<u8>, DecodeError> {
    const HEADER: usize = 120;
    let orig_compression = u32_at(orig, 20)?;
    let old_blob_count =
        usize::try_from(i32_at(orig, 56)?).map_err(|_| DecodeError::Kv3("negative blob count"))?;
    let old_table_bytes = if orig_compression == 1 {
        usize::try_from(i32_at(orig, 68)?).map_err(|_| DecodeError::Kv3("negative table size"))?
    } else {
        0
    };

    let unc1 = i32_at(rebuilt, 72)? as usize;
    let unc2 = i32_at(rebuilt, 80)? as usize;
    let raw1 = rebuilt
        .get(HEADER..HEADER + unc1)
        .ok_or(DecodeError::Kv3("rebuilt buf1 out of range"))?;
    let raw2 = rebuilt
        .get(HEADER + unc1..HEADER + unc1 + unc2)
        .ok_or(DecodeError::Kv3("rebuilt buf2 out of range"))?;

    // Carve buf2's tail: [lengths: old_count*4][trailer][frame table: old_table_bytes]
    let tail_len = old_blob_count * 4 + 4 + old_table_bytes;
    let tail_off = unc2
        .checked_sub(tail_len)
        .ok_or(DecodeError::Kv3("buf2 too short for blob tail"))?;
    let lengths_region = raw2
        .get(tail_off..tail_off + old_blob_count * 4)
        .ok_or(DecodeError::Kv3("blob length table out of range"))?;
    let trailer_off = tail_off + old_blob_count * 4;
    if u32_at(raw2, trailer_off)? != 0xFFEE_DD00 {
        return Err(DecodeError::Kv3("blob tail trailer mismatch"));
    }
    let old_table = raw2
        .get(trailer_off + 4..trailer_off + 4 + old_table_bytes)
        .ok_or(DecodeError::Kv3("blob frame table out of range"))?;

    let old_lengths: Vec<usize> = lengths_region
        .chunks_exact(4)
        .map(|b| i32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
        .collect();
    let old_frame_sizes: Vec<usize> = old_table
        .chunks_exact(2)
        .map(|b| usize::from(u16::from_le_bytes([b[0], b[1]])))
        .collect();
    if blob_index > old_lengths.len() {
        return Err(DecodeError::Kv3("blob insert index out of range"));
    }

    // Frame insertion point: frames of the blobs that precede blob_index.
    let frames_before: usize = old_lengths[..blob_index]
        .iter()
        .map(|&l| blob_frame_count(l))
        .sum();
    if frames_before > old_frame_sizes.len() {
        return Err(DecodeError::Kv3("blob frame table underrun"));
    }
    let frame_bytes_before: usize = old_frame_sizes[..frames_before].iter().sum();

    // Compress the new blobs, chunked per frame.
    let mut new_frame_sizes: Vec<u16> = Vec::new();
    let mut new_frame_bytes: Vec<u8> = Vec::new();
    for blob in new_blobs {
        for chunk in blob.chunks(BLOB_FRAME_SIZE) {
            let frame = lz4_flex::block::compress(chunk);
            let size = u16::try_from(frame.len())
                .map_err(|_| DecodeError::Kv3("blob frame does not fit the size table"))?;
            new_frame_sizes.push(size);
            new_frame_bytes.extend_from_slice(&frame);
        }
    }

    // New buf2 tail.
    let mut new_lengths = old_lengths.clone();
    for (k, blob) in new_blobs.iter().enumerate() {
        new_lengths.insert(blob_index + k, blob.len());
    }
    let mut new_table: Vec<u8> = Vec::with_capacity(old_table.len() + new_frame_sizes.len() * 2);
    new_table.extend_from_slice(&old_table[..frames_before * 2]);
    for s in &new_frame_sizes {
        new_table.extend_from_slice(&s.to_le_bytes());
    }
    new_table.extend_from_slice(&old_table[frames_before * 2..]);

    let mut new_raw2 = raw2[..tail_off].to_vec();
    for len in &new_lengths {
        new_raw2.extend_from_slice(
            &i32::try_from(*len)
                .map_err(|_| DecodeError::Kv3("blob too large"))?
                .to_le_bytes(),
        );
    }
    new_raw2.extend_from_slice(&0xFFEE_DD00u32.to_le_bytes());
    new_raw2.extend_from_slice(&new_table);

    // Blob frames: original region with the new frames spliced in.
    // The frame region of a shipped blob-bearing block ends with a 4-byte
    // 0xFFEEDD00 marker after the frame data; strip it from the original (so
    // splicing stays index-clean) and always re-append it at the end.
    let orig_frames: &[u8] = if orig_compression == 1 && old_blob_count > 0 {
        let comp1 = i32_at(orig, 76)? as usize;
        let comp2 = i32_at(orig, 84)? as usize;
        let start = HEADER + comp1 + comp2;
        let region = orig
            .get(start..)
            .ok_or(DecodeError::Kv3("blob frame region out of range"))?;
        let data_len = region
            .len()
            .checked_sub(4)
            .filter(|&l| u32_at(region, l).is_ok_and(|t| t == 0xFFEE_DD00))
            .ok_or(DecodeError::Kv3("blob frame region missing its trailer"))?;
        &region[..data_len]
    } else {
        &[]
    };
    if frame_bytes_before > orig_frames.len() {
        return Err(DecodeError::Kv3("blob frame region underrun"));
    }
    let mut frames = Vec::with_capacity(orig_frames.len() + new_frame_bytes.len() + 4);
    frames.extend_from_slice(&orig_frames[..frame_bytes_before]);
    frames.extend_from_slice(&new_frame_bytes);
    frames.extend_from_slice(&orig_frames[frame_bytes_before..]);
    frames.extend_from_slice(&0xFFEE_DD00u32.to_le_bytes());

    // Compress the typed buffers (reusing the original compressed bytes when a
    // buffer is unchanged and was already LZ4).
    let compress_buf = |raw: &[u8], orig_unc_off: usize, orig_comp_off: usize| -> Vec<u8> {
        if orig_compression == 1 {
            let ounc = i32_at(orig, orig_unc_off).unwrap_or(0) as usize;
            let ocomp = i32_at(orig, orig_comp_off).unwrap_or(0) as usize;
            let start = if orig_unc_off == 72 {
                HEADER
            } else {
                HEADER + i32_at(orig, 76).unwrap_or(0) as usize
            };
            if let Some(oc) = orig.get(start..start + ocomp) {
                if let Ok(orig_raw) = lz4_flex::block::decompress(oc, ounc) {
                    if orig_raw == raw {
                        return oc.to_vec();
                    }
                }
            }
        }
        lz4_flex::block::compress(raw)
    };
    let comp1_bytes = compress_buf(raw1, 72, 76);
    let comp2_bytes = compress_buf(&new_raw2, 80, 84);

    // Header: start from the rebuilt one (its lane counts/types/object counts
    // are current), then write the compression + blob bookkeeping.
    let mut out = rebuilt[..HEADER].to_vec();
    let total_blob_bytes: usize = new_lengths.iter().sum();
    write_i32_at(&mut out, 20, 1); // compressionMethod = LZ4
    out[26..28].copy_from_slice(
        &u16::try_from(BLOB_FRAME_SIZE)
            .unwrap_or(u16::MAX)
            .to_le_bytes(),
    );
    write_i32_at(&mut out, 48, fit_i32(unc1 + new_raw2.len())?);
    write_i32_at(
        &mut out,
        52,
        fit_i32(comp1_bytes.len() + comp2_bytes.len())?,
    );
    write_i32_at(&mut out, 56, fit_i32(new_lengths.len())?);
    write_i32_at(&mut out, 60, fit_i32(total_blob_bytes)?);
    write_i32_at(&mut out, 68, fit_i32(new_table.len())?);
    write_i32_at(&mut out, 72, fit_i32(unc1)?);
    write_i32_at(&mut out, 76, fit_i32(comp1_bytes.len())?);
    write_i32_at(&mut out, 80, fit_i32(new_raw2.len())?);
    write_i32_at(&mut out, 84, fit_i32(comp2_bytes.len())?);

    out.extend_from_slice(&comp1_bytes);
    out.extend_from_slice(&comp2_bytes);
    out.extend_from_slice(&frames);
    Ok(out)
}

fn collect_value_strings(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(s) => push_unique_string(out, s),
        Value::Array(items) => {
            for item in items {
                collect_value_strings(item, out);
            }
        }
        Value::Object(pairs) => {
            for (key, child) in pairs {
                push_unique_string(out, key);
                collect_value_strings(child, out);
            }
        }
        _ => {}
    }
}

fn push_unique_string(out: &mut Vec<String>, s: &str) {
    if !s.is_empty() && !out.iter().any(|known| known == s) {
        out.push(s.to_string());
    }
}

struct EncodedInsert {
    b1: Vec<u8>,
    b2: Vec<u8>,
    b4: Vec<u8>,
    b8: Vec<u8>,
    types: Vec<u8>,
    obj_lengths: Vec<u8>,
    /// Binary blobs in document order; they consume no typed-lane bytes and
    /// are attached to the block's blob section by [`finalize_blob_block`].
    blobs: Vec<Vec<u8>>,
}

fn encode_insert_value(
    value: &Value,
    version: u32,
    strings: &[String],
    include_root_type: bool,
) -> Result<EncodedInsert, DecodeError> {
    let mut enc = InsertEncoder {
        version,
        strings,
        out: EncodedInsert {
            b1: Vec::new(),
            b2: Vec::new(),
            b4: Vec::new(),
            b8: Vec::new(),
            types: Vec::new(),
            obj_lengths: Vec::new(),
            blobs: Vec::new(),
        },
    };
    enc.value(value, include_root_type)?;
    Ok(enc.out)
}

struct InsertEncoder<'a> {
    version: u32,
    strings: &'a [String],
    out: EncodedInsert,
}

impl InsertEncoder<'_> {
    fn string_id(&self, s: &str) -> Result<u32, DecodeError> {
        if s.is_empty() {
            return Ok(u32::MAX);
        }
        self.strings
            .iter()
            .position(|known| known == s)
            .ok_or(DecodeError::Kv3("insert string was not interned"))?
            .try_into()
            .map_err(|_| DecodeError::Kv3("string table id does not fit u32"))
    }

    #[allow(clippy::wildcard_imports, clippy::cast_possible_truncation)]
    fn value(&mut self, value: &Value, include_type: bool) -> Result<(), DecodeError> {
        use node::*;
        let t = value_wire_type(value);
        if include_type {
            self.out.types.push(t);
        }
        match (t, value) {
            (
                NULL | BOOLEAN_TRUE | BOOLEAN_FALSE | INT64_ZERO | INT64_ONE | DOUBLE_ZERO
                | DOUBLE_ONE,
                _,
            ) => {}
            (BOOLEAN, Value::Bool(b)) => self.out.b1.push(u8::from(*b)),
            (INT32_AS_BYTE, Value::Int(i)) => self.out.b1.push(*i as u8),
            (INT16, Value::Int(i)) => self.out.b2.extend_from_slice(&(*i as i16).to_le_bytes()),
            (UINT16, Value::UInt(u)) => self.out.b2.extend_from_slice(&(*u as u16).to_le_bytes()),
            (INT32, Value::Int(i)) => self.out.b4.extend_from_slice(&(*i as i32).to_le_bytes()),
            (UINT32, Value::UInt(u)) => self.out.b4.extend_from_slice(&(*u as u32).to_le_bytes()),
            (FLOAT, Value::Double(d)) => {
                self.out
                    .b4
                    .extend_from_slice(&(*d as f32).to_bits().to_le_bytes());
            }
            (STRING, Value::String(s)) => {
                self.out
                    .b4
                    .extend_from_slice(&self.string_id(s)?.to_le_bytes());
            }
            (INT64, Value::Int(i)) => self.out.b8.extend_from_slice(&i.to_le_bytes()),
            (UINT64, Value::UInt(u)) => self.out.b8.extend_from_slice(&u.to_le_bytes()),
            (DOUBLE, Value::Double(d)) => {
                self.out.b8.extend_from_slice(&d.to_bits().to_le_bytes());
            }
            (ARRAY, Value::Array(items)) => {
                let n = u32::try_from(items.len())
                    .map_err(|_| DecodeError::Kv3("inserted array too large"))?;
                self.out.b4.extend_from_slice(&n.to_le_bytes());
                for item in items {
                    self.value(item, true)?;
                }
            }
            (OBJECT, Value::Object(pairs)) => {
                let n = u32::try_from(pairs.len())
                    .map_err(|_| DecodeError::Kv3("inserted object too large"))?;
                if self.version >= 5 {
                    self.out.obj_lengths.extend_from_slice(&n.to_le_bytes());
                } else {
                    self.out.b4.extend_from_slice(&n.to_le_bytes());
                }
                for (key, child) in pairs {
                    self.out
                        .b4
                        .extend_from_slice(&self.string_id(key)?.to_le_bytes());
                    self.value(child, true)?;
                }
            }
            (BINARY_BLOB, Value::Binary(bytes)) => {
                // no lane bytes; the blob itself rides the blob section
                self.out.blobs.push(bytes.clone());
            }
            _ => return Err(DecodeError::Kv3("insert value/type mismatch")),
        }
        Ok(())
    }
}

#[allow(
    clippy::wildcard_imports,
    clippy::float_cmp,
    clippy::cast_possible_truncation
)]
fn value_wire_type(value: &Value) -> u8 {
    use node::*;
    match value {
        Value::Null => NULL,
        Value::Bool(b) => {
            if *b {
                BOOLEAN_TRUE
            } else {
                BOOLEAN_FALSE
            }
        }
        Value::Int(i) => match *i {
            0 => INT64_ZERO,
            1 => INT64_ONE,
            2..=255 => INT32_AS_BYTE,
            i if i32::try_from(i).is_ok() => INT32,
            _ => INT64,
        },
        Value::UInt(u) => {
            if u32::try_from(*u).is_ok() {
                UINT32
            } else {
                UINT64
            }
        }
        Value::Double(d) => {
            if *d == 0.0 {
                DOUBLE_ZERO
            } else if *d == 1.0 {
                DOUBLE_ONE
            } else if f64::from(*d as f32).to_bits() == d.to_bits() {
                FLOAT
            } else {
                DOUBLE
            }
        }
        Value::String(_) => STRING,
        Value::Binary(_) => BINARY_BLOB,
        Value::Array(_) => ARRAY,
        Value::Object(_) => OBJECT,
    }
}

#[derive(Clone, Copy)]
struct InsertCursors {
    types: usize,
    obj_lengths: usize,
    lanes: [usize; 4],
}

struct InsertSite {
    count_lane: usize,
    count_offset: usize,
    count_width: usize,
    old_count: usize,
    subtype: Option<u8>,
    cursors: InsertCursors,
}

struct InsertWalk<'a> {
    block: &'a [u8],
    version: u32,
    types: Lane,
    obj_lengths: Lane,
    main: [Lane; 4],
    aux: [Lane; 4],
    aux_active: bool,
    strings: Vec<String>,
    target: &'a [Seg],
    insert_index: usize,
    path: Vec<Seg>,
    site: Option<InsertSite>,
}

impl<'a> InsertWalk<'a> {
    fn new(block: &'a [u8], target: &'a [Seg], insert_index: usize) -> Result<Self, DecodeError> {
        let version = u32_at(block, 0)? & 0xFF;
        let l = lanes(block, version)?;
        Ok(Self {
            block,
            version,
            types: l.types,
            obj_lengths: l.obj_lengths,
            main: l.main,
            aux: l.aux,
            aux_active: false,
            strings: l.strings,
            target,
            insert_index,
            path: Vec::new(),
            site: None,
        })
    }

    fn finish(self) -> Result<InsertSite, DecodeError> {
        self.site
            .ok_or(DecodeError::Kv3("array insert path not found"))
    }

    fn read_type(&mut self) -> Result<u8, DecodeError> {
        let mut t = *self
            .block
            .get(self.types.at())
            .ok_or(DecodeError::Kv3("type stream underrun"))?;
        self.types.pos += 1;
        if t & 0x80 != 0 {
            t &= 0x3F;
            self.types.pos += 1;
        }
        Ok(t)
    }

    fn lane_u32(&mut self, lane: usize) -> Result<u32, DecodeError> {
        let at = self.main[lane].at();
        let v = u32_at(self.block, at)?;
        self.main[lane].pos += 4;
        Ok(v)
    }

    fn lane_u8(&mut self, lane: usize) -> Result<u8, DecodeError> {
        let v = *self
            .block
            .get(self.main[lane].at())
            .ok_or(DecodeError::Kv3("lane underrun"))?;
        self.main[lane].pos += 1;
        Ok(v)
    }

    fn obj_len(&mut self) -> Result<u32, DecodeError> {
        let v = u32_at(self.block, self.obj_lengths.at())?;
        self.obj_lengths.pos += 4;
        Ok(v)
    }

    fn key(&self, id: u32) -> &str {
        if id == u32::MAX {
            ""
        } else {
            self.strings.get(id as usize).map_or("", String::as_str)
        }
    }

    fn at_target(&self) -> bool {
        self.path.as_slice() == self.target
    }

    fn cursors(&self) -> InsertCursors {
        InsertCursors {
            types: self.types.at(),
            obj_lengths: self.obj_lengths.at(),
            lanes: [
                self.main[B1].at(),
                self.main[B2].at(),
                self.main[B4].at(),
                self.main[B8].at(),
            ],
        }
    }

    fn record_site(
        &mut self,
        count_lane: usize,
        count_offset: usize,
        count_width: usize,
        old_count: usize,
        subtype: Option<u8>,
    ) -> Result<(), DecodeError> {
        if self.aux_active {
            return Err(DecodeError::Kv3(
                "array insert does not support auxiliary-buffer arrays",
            ));
        }
        if self.site.is_some() {
            return Err(DecodeError::Kv3("array insert path is ambiguous"));
        }
        self.site = Some(InsertSite {
            count_lane,
            count_offset,
            count_width,
            old_count,
            subtype,
            cursors: self.cursors(),
        });
        Ok(())
    }

    #[allow(clippy::wildcard_imports, clippy::too_many_lines)]
    fn value(&mut self, datatype: u8) -> Result<(), DecodeError> {
        use node::*;
        match datatype {
            INT32 | UINT32 | FLOAT | STRING => self.main[B4].pos += 4,
            INT64 | UINT64 | DOUBLE => self.main[B8].pos += 8,
            INT16 | UINT16 => self.main[B2].pos += 2,
            INT32_AS_BYTE | BOOLEAN => self.main[B1].pos += 1,
            NULL | BOOLEAN_TRUE | BOOLEAN_FALSE | INT64_ZERO | INT64_ONE | DOUBLE_ZERO
            | DOUBLE_ONE | BINARY_BLOB => {}
            ARRAY => {
                let count_offset = self.main[B4].at();
                let n = self.lane_u32(B4)? as usize;
                let target = self.at_target();
                if target && self.insert_index > n {
                    return Err(DecodeError::Kv3("array insert index out of range"));
                }
                for i in 0..n {
                    if target && self.insert_index == i {
                        self.record_site(B4, count_offset, 4, n, None)?;
                    }
                    let t = self.read_type()?;
                    self.path.push(Seg::Index(i));
                    self.value(t)?;
                    self.path.pop();
                }
                if target && self.insert_index == n {
                    self.record_site(B4, count_offset, 4, n, None)?;
                }
            }
            ARRAY_TYPED => {
                let count_offset = self.main[B4].at();
                let n = self.lane_u32(B4)? as usize;
                let sub = self.read_type()?;
                let target = self.at_target();
                if target && self.insert_index > n {
                    return Err(DecodeError::Kv3("array insert index out of range"));
                }
                for i in 0..n {
                    if target && self.insert_index == i {
                        self.record_site(B4, count_offset, 4, n, Some(sub))?;
                    }
                    self.path.push(Seg::Index(i));
                    self.value(sub)?;
                    self.path.pop();
                }
                if target && self.insert_index == n {
                    self.record_site(B4, count_offset, 4, n, Some(sub))?;
                }
            }
            ARRAY_TYPE_BYTE_LENGTH => {
                let count_offset = self.main[B1].at();
                let n = usize::from(self.lane_u8(B1)?);
                let sub = self.read_type()?;
                let target = self.at_target();
                if target && self.insert_index > n {
                    return Err(DecodeError::Kv3("array insert index out of range"));
                }
                for i in 0..n {
                    if target && self.insert_index == i {
                        self.record_site(B1, count_offset, 1, n, Some(sub))?;
                    }
                    self.path.push(Seg::Index(i));
                    self.value(sub)?;
                    self.path.pop();
                }
                if target && self.insert_index == n {
                    self.record_site(B1, count_offset, 1, n, Some(sub))?;
                }
            }
            ARRAY_TYPE_AUXILIARY_BUFFER => {
                if self.at_target() {
                    return Err(DecodeError::Kv3(
                        "array insert does not support auxiliary-buffer arrays",
                    ));
                }
                let n = usize::from(self.lane_u8(B1)?);
                let sub = self.read_type()?;
                std::mem::swap(&mut self.main, &mut self.aux);
                self.aux_active = !self.aux_active;
                for i in 0..n {
                    self.path.push(Seg::Index(i));
                    self.value(sub)?;
                    self.path.pop();
                }
                self.aux_active = !self.aux_active;
                std::mem::swap(&mut self.main, &mut self.aux);
            }
            OBJECT => {
                let n = if self.version >= 5 {
                    self.obj_len()?
                } else {
                    self.lane_u32(B4)?
                };
                for _ in 0..n {
                    let vt = self.read_type()?;
                    let id = self.lane_u32(B4)?;
                    self.path.push(Seg::Key(self.key(id).to_string()));
                    self.value(vt)?;
                    self.path.pop();
                }
            }
            other => return Err(DecodeError::Kv3NodeType(other)),
        }
        Ok(())
    }
}

fn rebuild_v5_with_insert(
    block: &[u8],
    site: &InsertSite,
    encoded: &EncodedInsert,
) -> Result<Vec<u8>, DecodeError> {
    const HEADER: usize = 120;
    let unc_buf1 = i32_at(block, 72)? as usize;
    let unc_buf2 = i32_at(block, 80)? as usize;
    let main_b1 = i32_at(block, 88)? as usize;
    let main_b2 = i32_at(block, 92)? as usize;
    let main_b4 = i32_at(block, 96)? as usize;
    let main_b8 = i32_at(block, 100)? as usize;
    let main_obj = i32_at(block, 108)? as usize;
    let count_types = i32_at(block, 40)? as usize;

    let buf1 = HEADER;
    let buf2 = buf1
        .checked_add(unc_buf1)
        .ok_or(DecodeError::Kv3("buf1 extent overflow"))?;
    let buf2_end = buf2
        .checked_add(unc_buf2)
        .filter(|&e| e <= block.len())
        .ok_or(DecodeError::Kv3("buf2 extent out of range"))?;

    let mut off = 0usize;
    let obj_start = off;
    let obj_len = main_obj * 4;
    off += obj_len;
    let b1_start = off;
    off += main_b1;
    let (b2_start, b2_len) = lane(&mut off, main_b2, 2);
    let (b4_start, b4_len) = lane(&mut off, main_b4, 4);
    let (b8_start, b8_len) = lane(&mut off, main_b8, 8);
    let types_start = off;
    let tail_start = types_start
        .checked_add(count_types)
        .ok_or(DecodeError::Kv3("type stream extent overflow"))?;
    if tail_start > unc_buf2 {
        return Err(DecodeError::Kv3("type stream out of range"));
    }

    let bases = [
        buf2 + b1_start,
        buf2 + b2_start,
        buf2 + b4_start,
        buf2 + b8_start,
    ];
    let mut obj = block[buf2 + obj_start..buf2 + obj_start + obj_len].to_vec();
    let mut b1 = block[bases[B1]..bases[B1] + main_b1].to_vec();
    let mut b2 = block[bases[B2]..bases[B2] + b2_len].to_vec();
    let mut b4 = block[bases[B4]..bases[B4] + b4_len].to_vec();
    let mut b8 = block[bases[B8]..bases[B8] + b8_len].to_vec();
    let mut types = block[buf2 + types_start..buf2 + tail_start].to_vec();
    let tail = &block[buf2 + tail_start..buf2_end];

    match site.count_lane {
        B1 => bump_array_count(&mut b1, site, bases)?,
        B2 => bump_array_count(&mut b2, site, bases)?,
        B4 => bump_array_count(&mut b4, site, bases)?,
        B8 => bump_array_count(&mut b8, site, bases)?,
        _ => return Err(DecodeError::Kv3("unsupported array count lane")),
    }
    let obj_insert = rel(site.cursors.obj_lengths, buf2 + obj_start, obj.len())?;
    let b1_insert = rel(site.cursors.lanes[B1], bases[B1], b1.len())?;
    let b2_insert = rel(site.cursors.lanes[B2], bases[B2], b2.len())?;
    let b4_insert = rel(site.cursors.lanes[B4], bases[B4], b4.len())?;
    let b8_insert = rel(site.cursors.lanes[B8], bases[B8], b8.len())?;
    let types_insert = rel(site.cursors.types, buf2 + types_start, types.len())?;
    splice_at(&mut obj, obj_insert, &encoded.obj_lengths)?;
    splice_at(&mut b1, b1_insert, &encoded.b1)?;
    splice_at(&mut b2, b2_insert, &encoded.b2)?;
    splice_at(&mut b4, b4_insert, &encoded.b4)?;
    splice_at(&mut b8, b8_insert, &encoded.b8)?;
    splice_at(&mut types, types_insert, &encoded.types)?;

    let mut new_buf2 = Vec::new();
    let mut cursor = 0usize;
    new_buf2.extend_from_slice(&obj);
    cursor += obj.len();
    new_buf2.extend_from_slice(&b1);
    cursor += b1.len();
    append_aligned_lane(&mut new_buf2, &mut cursor, &b2, 2, false);
    append_aligned_lane(&mut new_buf2, &mut cursor, &b4, 4, false);
    append_aligned_lane(&mut new_buf2, &mut cursor, &b8, 8, false);
    new_buf2.extend_from_slice(&types);
    cursor += types.len();
    debug_assert_eq!(cursor, new_buf2.len());
    new_buf2.extend_from_slice(tail);

    let mut out = Vec::with_capacity(HEADER + unc_buf1 + new_buf2.len());
    out.extend_from_slice(&block[..HEADER]);
    out.extend_from_slice(&block[buf1..buf2]);
    out.extend_from_slice(&new_buf2);

    let new_unc_buf2 = new_buf2.len();
    let grow = fit_i32(
        new_unc_buf2
            .checked_sub(unc_buf2)
            .ok_or(DecodeError::Kv3("array insert unexpectedly shrank buf2"))?,
    )?;
    write_i32_at(&mut out, 48, checked_add_i32(i32_at(block, 48)?, grow)?);
    write_i32_at(&mut out, 52, checked_add_i32(i32_at(block, 52)?, grow)?);
    write_i32_at(&mut out, 80, fit_i32(new_unc_buf2)?);
    write_i32_at(&mut out, 84, fit_i32(new_unc_buf2)?);
    write_i32_at(&mut out, 88, fit_i32(b1.len())?);
    write_i32_at(&mut out, 92, fit_i32(b2.len() / 2)?);
    write_i32_at(&mut out, 96, fit_i32(b4.len() / 4)?);
    write_i32_at(&mut out, 100, fit_i32(b8.len() / 8)?);
    write_i32_at(&mut out, 108, fit_i32(obj.len() / 4)?);
    write_i32_at(&mut out, 40, fit_i32(types.len())?);
    Ok(out)
}

fn rebuild_v4_with_insert(
    block: &[u8],
    site: &InsertSite,
    encoded: &EncodedInsert,
) -> Result<Vec<u8>, DecodeError> {
    const BUF: usize = 72;
    let count_b1 = i32_at(block, 28)? as usize;
    let count_b4 = i32_at(block, 32)? as usize;
    let count_b8 = i32_at(block, 36)? as usize;
    let count_b2 = i32_at(block, 64)? as usize;
    let count_types = i32_at(block, 40)? as usize;
    let size_unc_total = i32_at(block, 48)? as usize;

    let mut off = 0usize;
    let b1_start = off;
    off += count_b1;
    let (b2_start, b2_len) = lane(&mut off, count_b2, 2);
    let (b4_start, b4_len) = lane(&mut off, count_b4, 4);
    let (b8_start, b8_len) = if count_b8 > 0 {
        lane(&mut off, count_b8, 8)
    } else {
        align(&mut off, 8);
        (off, 0)
    };
    let strings_start = off;
    let string_count = u32::try_from(i32_at(block, BUF + b4_start)?)
        .map_err(|_| DecodeError::Kv3("negative string count"))? as usize;
    let mut sp = BUF + strings_start;
    for _ in 0..string_count {
        let _ = read_cstr(block, &mut sp)?;
    }
    let strings_len = sp - (BUF + strings_start);
    let types_len = count_types
        .checked_sub(strings_len)
        .ok_or(DecodeError::Kv3("v4 countTypes smaller than strings"))?;
    let types_start = strings_start + strings_len;
    let tail_start = types_start
        .checked_add(types_len)
        .ok_or(DecodeError::Kv3("v4 type stream extent overflow"))?;
    if tail_start > size_unc_total {
        return Err(DecodeError::Kv3("v4 type stream out of range"));
    }

    let bases = [
        BUF + b1_start,
        BUF + b2_start,
        BUF + b4_start,
        BUF + b8_start,
    ];
    let mut b1 = block[bases[B1]..bases[B1] + count_b1].to_vec();
    let mut b2 = block[bases[B2]..bases[B2] + b2_len].to_vec();
    let mut b4 = block[bases[B4]..bases[B4] + b4_len].to_vec();
    let mut b8 = block[bases[B8]..bases[B8] + b8_len].to_vec();
    let strings = &block[BUF + strings_start..BUF + types_start];
    let mut types = block[BUF + types_start..BUF + tail_start].to_vec();
    let tail = &block[BUF + tail_start..BUF + size_unc_total];

    match site.count_lane {
        B1 => bump_array_count(&mut b1, site, bases)?,
        B2 => bump_array_count(&mut b2, site, bases)?,
        B4 => bump_array_count(&mut b4, site, bases)?,
        B8 => bump_array_count(&mut b8, site, bases)?,
        _ => return Err(DecodeError::Kv3("unsupported array count lane")),
    }
    let b1_insert = rel(site.cursors.lanes[B1], bases[B1], b1.len())?;
    let b2_insert = rel(site.cursors.lanes[B2], bases[B2], b2.len())?;
    let b4_insert = rel(site.cursors.lanes[B4], bases[B4], b4.len())?;
    let b8_insert = rel(site.cursors.lanes[B8], bases[B8], b8.len())?;
    let types_insert = rel(site.cursors.types, BUF + types_start, types.len())?;
    splice_at(&mut b1, b1_insert, &encoded.b1)?;
    splice_at(&mut b2, b2_insert, &encoded.b2)?;
    splice_at(&mut b4, b4_insert, &encoded.b4)?;
    splice_at(&mut b8, b8_insert, &encoded.b8)?;
    splice_at(&mut types, types_insert, &encoded.types)?;

    let mut body = Vec::new();
    let mut cursor = 0usize;
    body.extend_from_slice(&b1);
    cursor += b1.len();
    append_aligned_lane(&mut body, &mut cursor, &b2, 2, false);
    append_aligned_lane(&mut body, &mut cursor, &b4, 4, false);
    append_aligned_lane(&mut body, &mut cursor, &b8, 8, true);
    body.extend_from_slice(strings);
    cursor += strings.len();
    body.extend_from_slice(&types);
    cursor += types.len();
    debug_assert_eq!(cursor, body.len());
    body.extend_from_slice(tail);

    let mut out = Vec::with_capacity(BUF + body.len());
    out.extend_from_slice(&block[..BUF]);
    out.extend_from_slice(&body);

    write_i32_at(&mut out, 28, fit_i32(b1.len())?);
    write_i32_at(&mut out, 32, fit_i32(b4.len() / 4)?);
    write_i32_at(&mut out, 36, fit_i32(b8.len() / 8)?);
    write_i32_at(&mut out, 40, fit_i32(strings.len() + types.len())?);
    write_i32_at(&mut out, 48, fit_i32(body.len())?);
    write_i32_at(&mut out, 52, fit_i32(body.len())?);
    write_i32_at(&mut out, 64, fit_i32(b2.len() / 2)?);
    Ok(out)
}

fn append_aligned_lane(
    body: &mut Vec<u8>,
    cursor: &mut usize,
    lane_bytes: &[u8],
    alignment: usize,
    align_even_when_empty: bool,
) {
    if lane_bytes.is_empty() && !align_even_when_empty {
        return;
    }
    let before = *cursor;
    align(cursor, alignment);
    body.resize(body.len() + (*cursor - before), 0);
    body.extend_from_slice(lane_bytes);
    *cursor += lane_bytes.len();
}

fn rel(abs: usize, base: usize, len: usize) -> Result<usize, DecodeError> {
    let pos = abs
        .checked_sub(base)
        .ok_or(DecodeError::Kv3("insert cursor before lane base"))?;
    if pos > len {
        return Err(DecodeError::Kv3("insert cursor past lane end"));
    }
    Ok(pos)
}

fn splice_at(dst: &mut Vec<u8>, at: usize, bytes: &[u8]) -> Result<(), DecodeError> {
    if at > dst.len() {
        return Err(DecodeError::Kv3("insert splice offset out of range"));
    }
    dst.splice(at..at, bytes.iter().copied());
    Ok(())
}

fn bump_array_count(
    lane_bytes: &mut [u8],
    site: &InsertSite,
    lane_bases: [usize; 4],
) -> Result<(), DecodeError> {
    let rel = rel(
        site.count_offset,
        lane_bases[site.count_lane],
        lane_bytes.len(),
    )?;
    let new_count = site
        .old_count
        .checked_add(1)
        .ok_or(DecodeError::Kv3("array count overflow"))?;
    match site.count_width {
        1 => {
            let count = u8::try_from(new_count)
                .map_err(|_| DecodeError::Kv3("byte-length array count overflow"))?;
            *lane_bytes
                .get_mut(rel)
                .ok_or(DecodeError::Kv3("array count offset out of range"))? = count;
        }
        4 => {
            let count =
                u32::try_from(new_count).map_err(|_| DecodeError::Kv3("array count overflow"))?;
            lane_bytes
                .get_mut(rel..rel + 4)
                .ok_or(DecodeError::Kv3("array count offset out of range"))?
                .copy_from_slice(&count.to_le_bytes());
        }
        _ => return Err(DecodeError::Kv3("unsupported array count width")),
    }
    Ok(())
}

fn fit_i32(v: usize) -> Result<i32, DecodeError> {
    i32::try_from(v).map_err(|_| DecodeError::Kv3("size/count field overflow"))
}

fn checked_add_i32(a: i32, b: i32) -> Result<i32, DecodeError> {
    a.checked_add(b)
        .ok_or(DecodeError::Kv3("size/count field overflow"))
}

/// Appends each of `wanted` that is not already interned to the KV3 v5 string table
/// of an **uncompressed** v5 `block`, returning the rebuilt block (or the input
/// unchanged if nothing needs adding).
///
/// The string table is the null-terminated run at the front of the aux buffer's b1
/// lane, with the string count stored as the first int of aux b4 (see
/// `reader::layout_aux_v5`). Appending rebuilds the aux buffer: the new strings are
/// inserted after the existing table, the b1 value lane and the b2/b4/b8 lanes are
/// carried through verbatim at their re-aligned positions, the count int is bumped,
/// and the header size fields (aux b1 count at 28, buf1 sizes at 72/76, total sizes
/// at 48/52) are corrected. Buffer 2 (the main buffer) is untouched. Because the
/// new strings are not yet referenced by any field, the decoded value tree is
/// identical; a following [`set_strings`] points a field at the new index.
fn append_strings_v5(block: &[u8], wanted: &[String]) -> Result<Vec<u8>, DecodeError> {
    const HEADER: usize = 120;
    if block.len() < HEADER || u32_at(block, 0)? & 0xFF != 5 {
        return Err(DecodeError::Kv3(
            "string append requires an uncompressed KV3 v5 block",
        ));
    }
    let aux_b1 = i32_at(block, 28)? as usize;
    let aux_b4 = i32_at(block, 32)? as usize;
    let aux_b8 = i32_at(block, 36)? as usize;
    let aux_b2 = i32_at(block, 64)? as usize;
    let unc_buf1 = i32_at(block, 72)? as usize;

    let buf1 = HEADER;
    let buf1_end = buf1
        .checked_add(unc_buf1)
        .filter(|&e| e <= block.len())
        .ok_or(DecodeError::Kv3("buf1 out of range"))?;

    // Aux lane layout within buf1 (mirrors reader::layout_aux_v5).
    let mut off = 0usize;
    off += aux_b1;
    let (a_b2_start, a_b2_len) = lane(&mut off, aux_b2, 2);
    let (a_b4_start, a_b4_len) = lane(&mut off, aux_b4, 4);
    let (a_b8_start, a_b8_len) = lane(&mut off, aux_b8, 8);
    let aux_content_end = off;
    if aux_content_end > unc_buf1 || a_b4_len < 4 {
        return Err(DecodeError::Kv3("aux lane layout out of range"));
    }
    // Trailing bytes after the last lane (alignment padding), preserved verbatim.
    let tail = block
        .get(buf1 + aux_content_end..buf1_end)
        .ok_or(DecodeError::Kv3("buf1 tail out of range"))?;

    // String table: `count` null-terminated strings at the front of b1; count is the
    // first int of aux b4.
    let count = u32::try_from(i32_at(block, buf1 + a_b4_start)?)
        .map_err(|_| DecodeError::Kv3("negative string count"))? as usize;
    let mut sp = buf1;
    let mut existing = Vec::with_capacity(count);
    for _ in 0..count {
        existing.push(read_cstr(block, &mut sp)?);
    }
    let strtab = block
        .get(buf1..sp)
        .ok_or(DecodeError::Kv3("string table out of range"))?;
    let b1_lane = block
        .get(sp..buf1 + aux_b1)
        .ok_or(DecodeError::Kv3("b1 value lane out of range"))?;

    // Which wanted strings genuinely need adding.
    let mut to_add: Vec<&str> = Vec::new();
    for s in wanted {
        if !s.is_empty() && !existing.iter().any(|e| e == s) && !to_add.contains(&s.as_str()) {
            to_add.push(s.as_str());
        }
    }
    if to_add.is_empty() {
        return Ok(block.to_vec());
    }

    // New string table, then the new b1 lane (table + carried value lane).
    let mut new_strtab = strtab.to_vec();
    for s in &to_add {
        new_strtab.extend_from_slice(s.as_bytes());
        new_strtab.push(0);
    }
    let new_count = count + to_add.len();
    let new_aux_b1 = new_strtab.len() + b1_lane.len();

    // Re-lay out the aux buffer with the grown b1, mirroring the reader's alignment.
    let mut off = new_aux_b1;
    let (n_b2_start, _) = lane(&mut off, aux_b2, 2);
    let (n_b4_start, _) = lane(&mut off, aux_b4, 4);
    let (n_b8_start, _) = lane(&mut off, aux_b8, 8);
    let new_content_end = off;
    let new_buf1_len = new_content_end + tail.len();

    let mut nb = vec![0u8; new_buf1_len];
    nb[..new_strtab.len()].copy_from_slice(&new_strtab);
    nb[new_strtab.len()..new_aux_b1].copy_from_slice(b1_lane);
    nb[n_b2_start..n_b2_start + a_b2_len]
        .copy_from_slice(&block[buf1 + a_b2_start..buf1 + a_b2_start + a_b2_len]);
    nb[n_b4_start..n_b4_start + 4].copy_from_slice(
        &u32::try_from(new_count)
            .map_err(|_| DecodeError::Kv3("string count overflow"))?
            .to_le_bytes(),
    );
    nb[n_b4_start + 4..n_b4_start + a_b4_len]
        .copy_from_slice(&block[buf1 + a_b4_start + 4..buf1 + a_b4_start + a_b4_len]);
    nb[n_b8_start..n_b8_start + a_b8_len]
        .copy_from_slice(&block[buf1 + a_b8_start..buf1 + a_b8_start + a_b8_len]);
    nb[new_content_end..].copy_from_slice(tail);

    // header + rebuilt buf1 + (unchanged) buf2.
    let mut out = Vec::with_capacity(HEADER + new_buf1_len + (block.len() - buf1_end));
    out.extend_from_slice(&block[..HEADER]);
    out.extend_from_slice(&nb);
    out.extend_from_slice(&block[buf1_end..]);

    // Fix the header size fields the grown buf1 invalidates. buf1 only grows, so
    // the byte delta is a non-negative usize added to each total.
    let fit = |v: usize| i32::try_from(v).map_err(|_| DecodeError::Kv3("size field overflow"));
    let grow = fit(new_buf1_len - unc_buf1)?;
    let grow_total = |o: usize| -> Result<i32, DecodeError> {
        i32_at(block, o)?
            .checked_add(grow)
            .ok_or(DecodeError::Kv3("size field overflow"))
    };
    let new_unc_total = grow_total(48)?;
    let new_comp_total = grow_total(52)?;
    write_i32_at(&mut out, 28, fit(new_aux_b1)?);
    write_i32_at(&mut out, 72, fit(new_buf1_len)?);
    write_i32_at(&mut out, 76, fit(new_buf1_len)?); // comp == unc (uncompressed)
    write_i32_at(&mut out, 48, new_unc_total);
    write_i32_at(&mut out, 52, new_comp_total);
    Ok(out)
}

/// v4 sibling of [`append_strings_v5`]. A v4 block is a single buffer laid out
/// `[b1][b2][b4][b8][strings][types][trailer]` (see `reader::layout_single`): the
/// string table is an inline region *after* the typed lanes, so appending is simpler
/// than v5 (no lane realignment). The new strings are spliced in at the end of the
/// table, shifting the type stream and trailer; the count int (first int of b4),
/// `countTypes` (the combined string+type byte count at offset 40), and the total
/// sizes (48/52) are bumped by the inserted byte count. The typed lanes, which sit
/// before the strings, do not move.
fn append_strings_v4(block: &[u8], wanted: &[String]) -> Result<Vec<u8>, DecodeError> {
    const BUF: usize = 72;
    if block.len() < BUF || u32_at(block, 0)? & 0xFF != 4 {
        return Err(DecodeError::Kv3(
            "v4 string append requires an uncompressed KV3 v4 block",
        ));
    }
    let count_b1 = i32_at(block, 28)? as usize;
    let count_b4 = i32_at(block, 32)? as usize;
    let count_b8 = i32_at(block, 36)? as usize;
    let count_b2 = i32_at(block, 64)? as usize;

    // Lane layout within the single buffer (mirrors reader::layout_single), to find
    // where the string table begins (just past b8).
    let mut off = 0usize;
    off += count_b1;
    let _ = lane(&mut off, count_b2, 2);
    let (b4_start, b4_len) = lane(&mut off, count_b4, 4);
    if count_b8 > 0 {
        lane(&mut off, count_b8, 8);
    } else {
        align(&mut off, 8);
    }
    if b4_len < 4 {
        return Err(DecodeError::Kv3("v4 b4 lane missing string count"));
    }
    let strings_start = BUF + off;
    let count = u32::try_from(i32_at(block, BUF + b4_start)?)
        .map_err(|_| DecodeError::Kv3("negative string count"))? as usize;
    let mut sp = strings_start;
    let mut existing = Vec::with_capacity(count);
    for _ in 0..count {
        existing.push(read_cstr(block, &mut sp)?);
    }

    let mut to_add: Vec<&str> = Vec::new();
    for s in wanted {
        if !s.is_empty() && !existing.iter().any(|e| e == s) && !to_add.contains(&s.as_str()) {
            to_add.push(s.as_str());
        }
    }
    if to_add.is_empty() {
        return Ok(block.to_vec());
    }

    let mut added = Vec::new();
    for s in &to_add {
        added.extend_from_slice(s.as_bytes());
        added.push(0);
    }
    let new_count = u32::try_from(count + to_add.len())
        .map_err(|_| DecodeError::Kv3("string count overflow"))?;
    let grow = i32::try_from(added.len()).map_err(|_| DecodeError::Kv3("size field overflow"))?;

    // Splice the new strings in at the end of the existing table.
    let mut out = Vec::with_capacity(block.len() + added.len());
    out.extend_from_slice(&block[..sp]);
    out.extend_from_slice(&added);
    out.extend_from_slice(&block[sp..]);

    // Bump the string-count int (sits in b4, before the splice point) and the size
    // fields the larger string region invalidates.
    out[BUF + b4_start..BUF + b4_start + 4].copy_from_slice(&new_count.to_le_bytes());
    for o in [40usize, 48, 52] {
        let v = i32_at(&out, o)?
            .checked_add(grow)
            .ok_or(DecodeError::Kv3("size field overflow"))?;
        write_i32_at(&mut out, o, v);
    }
    Ok(out)
}

fn write_i32_at(b: &mut [u8], o: usize, v: i32) {
    b[o..o + 4].copy_from_slice(&v.to_le_bytes());
}

/// Sets boolean fields located by KV3 path, in place, on a byte-faithful
/// uncompressed re-wrap of `block` (preserving structure, as the engine's model
/// loader requires). Each edit is a `(path, value)` resolving to exactly one bool.
///
/// The bool's storage form is preserved: a type-encoded bool (`BOOLEAN_TRUE`/
/// `BOOLEAN_FALSE`, the value is the type byte) has its type byte flipped (keeping
/// the high flag bits); a value-encoded bool (`BOOLEAN` + a 0/1 b1 byte) has that
/// byte set. Built to flip `m_bMeshoptCompressed` in a model's `CTRL` buffer
/// registry when converting a meshopt vertex buffer to an uncompressed one.
///
/// Errors if the block is not v5, or if a path is missing / not a bool / ambiguous.
pub fn set_bools(block: &[u8], edits: &[(Vec<Seg>, bool)]) -> Result<Vec<u8>, DecodeError> {
    // Blobbed-LZ4 v5 (a `.vnmclip_c` with its pose blob) decompresses to a walkable
    // working copy and re-emits still compressed, like [`set_doubles`]; otherwise
    // rewrap uncompressed. The in-place flip is identical either way.
    let blobbed = is_blobbed_lz4_v5(block);
    let mut out = if blobbed {
        decompress_v5_working(block)?
    } else {
        rewrap_uncompressed(block)?
    };
    if out.len() < 120 || u32::from_le_bytes([out[0], out[1], out[2], out[3]]) & 0xFF != 5 {
        return Err(DecodeError::Kv3("bool patch requires KV3 v5"));
    }

    let targets: Vec<&[Seg]> = edits.iter().map(|(p, _)| p.as_slice()).collect();
    let hits = {
        let mut w = PathWalk::new(&out, &targets)?;
        let root = w.read_type()?;
        w.value(root)?;
        w.bool_hits
    };

    for i in 0..edits.len() {
        match hits.iter().filter(|h| h.edit == i).count() {
            1 => {}
            0 => return Err(DecodeError::Kv3("bool patch path not found or not a bool")),
            _ => {
                return Err(DecodeError::Kv3(
                    "bool patch path is ambiguous (matched more than one field)",
                ));
            }
        }
    }

    for h in &hits {
        let want = edits[h.edit].1;
        let b = out
            .get_mut(h.offset)
            .ok_or(DecodeError::Kv3("bool patch offset out of range"))?;
        match h.kind {
            // Keep the high flag bits (0x80 = has-flags, 0x40), set the type id.
            BoolKind::TypeByte => {
                *b = (*b & 0xC0)
                    | if want {
                        node::BOOLEAN_TRUE
                    } else {
                        node::BOOLEAN_FALSE
                    };
            }
            BoolKind::ValueByte => *b = u8::from(want),
        }
    }
    if blobbed {
        reassemble_blobbed_v5(block, &out)
    } else {
        Ok(out)
    }
}

/// Encodes `value` to the little-endian bytes of an integer scalar of node type
/// `datatype`, erroring if it does not fit (so the field's storage width is never
/// changed). `INT32_AS_BYTE` reads as an unsigned `u8` (see `reader::read_value`).
#[allow(clippy::wildcard_imports)] // node constants, mirroring reader::read_value
fn fit_scalar(value: i64, datatype: u8) -> Result<Vec<u8>, DecodeError> {
    use node::*;
    let too_big = || DecodeError::Kv3("scalar value does not fit the field's on-disk width");
    Ok(match datatype {
        INT32_AS_BYTE => vec![u8::try_from(value).map_err(|_| too_big())?],
        INT16 => i16::try_from(value)
            .map_err(|_| too_big())?
            .to_le_bytes()
            .to_vec(),
        UINT16 => u16::try_from(value)
            .map_err(|_| too_big())?
            .to_le_bytes()
            .to_vec(),
        INT32 => i32::try_from(value)
            .map_err(|_| too_big())?
            .to_le_bytes()
            .to_vec(),
        UINT32 => u32::try_from(value)
            .map_err(|_| too_big())?
            .to_le_bytes()
            .to_vec(),
        INT64 => value.to_le_bytes().to_vec(),
        UINT64 => u64::try_from(value)
            .map_err(|_| too_big())?
            .to_le_bytes()
            .to_vec(),
        _ => {
            return Err(DecodeError::Kv3(
                "target field is not a settable integer scalar",
            ));
        }
    })
}

/// A located scalar field: which edit it satisfies, its absolute byte offset, and
/// its node type (so the value is fitted to the right width).
struct Hit {
    edit: usize,
    offset: usize,
    datatype: u8,
}

/// A located boolean field, for [`set_bools`]. A KV3 bool is stored either as its
/// own type byte (`BOOLEAN_TRUE` / `BOOLEAN_FALSE`, the value *is* the type) or as
/// a `BOOLEAN` type with a 0/1 value byte in the b1 lane; `kind` says which byte
/// to patch.
struct BoolHit {
    edit: usize,
    offset: usize,
    kind: BoolKind,
}

#[derive(Clone, Copy)]
enum BoolKind {
    /// The byte at `offset` is the type byte: set its low 6 bits to
    /// `BOOLEAN_TRUE`/`BOOLEAN_FALSE`, preserving the high flag bits.
    TypeByte,
    /// The byte at `offset` is a b1 value byte: set it to 0/1.
    ValueByte,
}

/// A located tagless integer field (`INT64_ZERO` / `INT64_ONE`), for
/// [`set_scalars`]. Like a type-byte bool, the value *is* the type id and carries
/// no data lane, so only 0 and 1 are representable in place: `offset` is the type
/// byte, flipped between `INT64_ZERO`/`INT64_ONE` (the int sibling of
/// [`BoolKind::TypeByte`]). This is what makes a material `F_*` feature flag stored
/// as a tagless `1` patchable.
struct IntTypeHit {
    edit: usize,
    offset: usize,
}

/// Path-tracking sibling of [`Walk`]: walks the value tree (sharing [`lanes`]),
/// maintaining the current KV3 path, and records each integer scalar whose path
/// equals one of `targets`. Used by [`set_scalars`].
struct PathWalk<'a> {
    block: &'a [u8],
    /// KV3 version (4 or 5): selects the OBJECT member-count source (b4 lane for
    /// v4, the object-length lane for v5).
    version: u32,
    types: Lane,
    obj_lengths: Lane,
    main: [Lane; 4],
    aux: [Lane; 4],
    strings: Vec<String>,
    targets: &'a [&'a [Seg]],
    path: Vec<Seg>,
    hits: Vec<Hit>,
    int_type_hits: Vec<IntTypeHit>,
    bool_hits: Vec<BoolHit>,
    double_hits: Vec<Hit>,
    float_hits: Vec<Hit>,
    string_hits: Vec<Hit>,
}

impl<'a> PathWalk<'a> {
    fn new(block: &'a [u8], targets: &'a [&'a [Seg]]) -> Result<Self, DecodeError> {
        let version = u32_at(block, 0)? & 0xFF;
        let l = lanes(block, version)?;
        Ok(PathWalk {
            block,
            version,
            types: l.types,
            obj_lengths: l.obj_lengths,
            main: l.main,
            aux: l.aux,
            strings: l.strings,
            targets,
            path: Vec::new(),
            hits: Vec::new(),
            int_type_hits: Vec::new(),
            bool_hits: Vec::new(),
            double_hits: Vec::new(),
            float_hits: Vec::new(),
            string_hits: Vec::new(),
        })
    }

    fn read_type(&mut self) -> Result<u8, DecodeError> {
        let mut t = *self
            .block
            .get(self.types.at())
            .ok_or(DecodeError::Kv3("type stream underrun"))?;
        self.types.pos += 1;
        if t & 0x80 != 0 {
            t &= 0x3F;
            self.types.pos += 1;
        }
        Ok(t)
    }

    fn lane_u32(&mut self, lane: usize) -> Result<u32, DecodeError> {
        let v = u32_at(self.block, self.main[lane].at())?;
        self.main[lane].pos += 4;
        Ok(v)
    }

    fn lane_u8(&mut self, lane: usize) -> Result<u8, DecodeError> {
        let v = *self
            .block
            .get(self.main[lane].at())
            .ok_or(DecodeError::Kv3("lane underrun"))?;
        self.main[lane].pos += 1;
        Ok(v)
    }

    fn obj_len(&mut self) -> Result<u32, DecodeError> {
        let v = u32_at(self.block, self.obj_lengths.at())?;
        self.obj_lengths.pos += 4;
        Ok(v)
    }

    fn key(&self, id: u32) -> &str {
        if id == u32::MAX {
            ""
        } else {
            self.strings.get(id as usize).map_or("", String::as_str)
        }
    }

    /// Records a type-encoded bool (`BOOLEAN_TRUE`/`BOOLEAN_FALSE`) as a hit if its
    /// path matches a target. `type_off` is the absolute offset of its type byte.
    fn record_bool_type(&mut self, datatype: u8, type_off: usize) {
        if datatype != node::BOOLEAN_TRUE && datatype != node::BOOLEAN_FALSE {
            return;
        }
        if let Some(edit) = self.targets.iter().position(|t| self.path.as_slice() == *t) {
            self.bool_hits.push(BoolHit {
                edit,
                offset: type_off,
                kind: BoolKind::TypeByte,
            });
        }
    }

    /// Records a tagless integer (`INT64_ZERO`/`INT64_ONE`) as a hit if its path
    /// matches a target. `type_off` is the absolute offset of its type byte (the
    /// value lives in the type id, no data lane), the int sibling of
    /// [`Self::record_bool_type`].
    fn record_int_type(&mut self, datatype: u8, type_off: usize) {
        if datatype != node::INT64_ZERO && datatype != node::INT64_ONE {
            return;
        }
        if let Some(edit) = self.targets.iter().position(|t| self.path.as_slice() == *t) {
            self.int_type_hits.push(IntTypeHit {
                edit,
                offset: type_off,
            });
        }
    }

    /// Records a value-encoded bool (`BOOLEAN` + a 0/1 b1 byte) as a hit if its
    /// path matches a target. `value_off` is the absolute offset of the b1 byte.
    fn record_bool_value(&mut self, value_off: usize) {
        if let Some(edit) = self.targets.iter().position(|t| self.path.as_slice() == *t) {
            self.bool_hits.push(BoolHit {
                edit,
                offset: value_off,
                kind: BoolKind::ValueByte,
            });
        }
    }

    /// Records the current real `DOUBLE` (b8, 8 bytes) as a hit if its path
    /// matches a target. Tagless `DOUBLE_ZERO`/`DOUBLE_ONE` carry no bytes and so
    /// are never recorded (they cannot be patched in place).
    fn record_double(&mut self) {
        let offset = self.main[B8].at();
        if let Some(edit) = self.targets.iter().position(|t| self.path.as_slice() == *t) {
            self.double_hits.push(Hit {
                edit,
                offset,
                datatype: node::DOUBLE,
            });
        }
    }

    /// Records the current real `FLOAT` (b4, 4 bytes) as a hit if its path
    /// matches a target.
    fn record_float(&mut self) {
        let offset = self.main[B4].at();
        if let Some(edit) = self.targets.iter().position(|t| self.path.as_slice() == *t) {
            self.float_hits.push(Hit {
                edit,
                offset,
                datatype: node::FLOAT,
            });
        }
    }

    /// Records the current `STRING` id (b4, 4 bytes) as a hit if its path matches
    /// a target.
    fn record_string(&mut self) {
        let offset = self.main[B4].at();
        if let Some(edit) = self.targets.iter().position(|t| self.path.as_slice() == *t) {
            self.string_hits.push(Hit {
                edit,
                offset,
                datatype: node::STRING,
            });
        }
    }

    /// Records the current scalar as a hit if its path matches a target.
    fn record(&mut self, lane: usize, datatype: u8) {
        let offset = self.main[lane].at();
        let matched = self.targets.iter().position(|t| self.path.as_slice() == *t);
        if let Some(edit) = matched {
            self.hits.push(Hit {
                edit,
                offset,
                datatype,
            });
        }
    }

    /// Walks one value, advancing every cursor exactly as the reader does and
    /// pushing/popping `path` on each descent, recording matching scalars.
    #[allow(clippy::wildcard_imports)] // node constants, mirroring reader::read_value
    fn value(&mut self, datatype: u8) -> Result<(), DecodeError> {
        use node::*;
        match datatype {
            INT32 | UINT32 => {
                self.record(B4, datatype);
                self.main[B4].pos += 4;
            }
            FLOAT => {
                self.record_float();
                self.main[B4].pos += 4;
            }
            STRING => {
                self.record_string();
                self.main[B4].pos += 4;
            }
            INT64 | UINT64 => {
                self.record(B8, datatype);
                self.main[B8].pos += 8;
            }
            DOUBLE => {
                self.record_double();
                self.main[B8].pos += 8;
            }
            INT16 | UINT16 => {
                self.record(B2, datatype);
                self.main[B2].pos += 2;
            }
            INT32_AS_BYTE => {
                self.record(B1, datatype);
                self.main[B1].pos += 1;
            }
            BOOLEAN => {
                self.record_bool_value(self.main[B1].at());
                self.main[B1].pos += 1;
            }
            // BINARY_BLOB consumes nothing from the typed lanes (its bytes live in
            // the separate blob region the reader pulls from), so it advances no
            // cursor here, like the tagless constants.
            NULL | BOOLEAN_TRUE | BOOLEAN_FALSE | INT64_ZERO | INT64_ONE | DOUBLE_ZERO
            | DOUBLE_ONE | BINARY_BLOB => {}
            ARRAY => {
                let n = self.lane_u32(B4)?;
                for i in 0..n {
                    let type_off = self.types.at();
                    let t = self.read_type()?;
                    self.path.push(Seg::Index(i as usize));
                    self.record_bool_type(t, type_off);
                    self.record_int_type(t, type_off);
                    self.value(t)?;
                    self.path.pop();
                }
            }
            ARRAY_TYPED => {
                let n = self.lane_u32(B4)?;
                let sub = self.read_type()?;
                for i in 0..n {
                    self.path.push(Seg::Index(i as usize));
                    self.value(sub)?;
                    self.path.pop();
                }
            }
            ARRAY_TYPE_BYTE_LENGTH => {
                let n = u32::from(self.lane_u8(B1)?);
                let sub = self.read_type()?;
                for i in 0..n {
                    self.path.push(Seg::Index(i as usize));
                    self.value(sub)?;
                    self.path.pop();
                }
            }
            ARRAY_TYPE_AUXILIARY_BUFFER => {
                let n = u32::from(self.lane_u8(B1)?);
                let sub = self.read_type()?;
                std::mem::swap(&mut self.main, &mut self.aux);
                for i in 0..n {
                    self.path.push(Seg::Index(i as usize));
                    self.value(sub)?;
                    self.path.pop();
                }
                std::mem::swap(&mut self.main, &mut self.aux);
            }
            OBJECT => {
                // v5 reads the member count from the object-length lane; v4 reads
                // it from the b4 lane inline (it has no object-length lane).
                let n = if self.version >= 5 {
                    self.obj_len()?
                } else {
                    self.lane_u32(B4)?
                };
                for _ in 0..n {
                    let type_off = self.types.at();
                    let vt = self.read_type()?;
                    let id = self.lane_u32(B4)?;
                    self.path.push(Seg::Key(self.key(id).to_string()));
                    self.record_bool_type(vt, type_off);
                    self.record_int_type(vt, type_off);
                    self.value(vt)?;
                    self.path.pop();
                }
            }
            other => return Err(DecodeError::Kv3NodeType(other)),
        }
        Ok(())
    }
}

/// Where in the target path the walker currently is. Only the path to
/// `m_sceneObjects[*].m_drawCalls[*].m_nIndexCount` is tracked; everything else is
/// [`Where::Other`] and merely skipped (advancing cursors correctly).
#[derive(Clone, Copy)]
enum Where {
    Root,
    InSceneObjects,
    InSceneObject(usize),
    InDrawCalls(usize),
    InDrawCall(usize, usize),
    /// This scalar is a targeted `m_nIndexCount`; record its byte offset.
    Record,
    Other,
}

/// One typed lane (b1/b2/b4/b8): an absolute base in the block plus a moving
/// cursor. `at()` is the absolute offset of the next unread byte.
#[derive(Clone, Copy)]
struct Lane {
    base: usize,
    pos: usize,
}

impl Lane {
    fn at(&self) -> usize {
        self.base + self.pos
    }
}

struct Walk<'a> {
    block: &'a [u8],
    types: Lane,
    obj_lengths: Lane,
    main: [Lane; 4],
    aux: [Lane; 4],
    strings: Vec<String>,
    targets: &'a [(usize, usize)],
    patches: Vec<(usize, usize)>,
}

/// The lane/cursor layout of a rewrapped, uncompressed v5 KV3 block: where each
/// typed lane (b1/b2/b4/b8) of the aux and main buffers begins, the type stream
/// and object-length cursors, and the decoded strings. Shared by every walker so
/// the (fragile) layout math is computed in exactly one place.
struct Lanes {
    types: Lane,
    obj_lengths: Lane,
    main: [Lane; 4],
    aux: [Lane; 4],
    strings: Vec<String>,
}

/// Computes the [`Lanes`] of an uncompressed block, dispatching on KV3 version:
/// v5's two-buffer layout or v4's single buffer. (v1..=3 are not patched in place.)
fn lanes(block: &[u8], version: u32) -> Result<Lanes, DecodeError> {
    match version {
        5 => lanes_v5(block),
        4 => lanes_v4(block),
        _ => Err(DecodeError::Kv3("KV3 in-place patch supports only v4/v5")),
    }
}

/// Computes the [`Lanes`] of an uncompressed **v4** block. Mirrors `reader`'s
/// `layout_single`: one buffer at offset 72 laid out as
/// `[b1][align2 b2][align4 b4][align8 b8][strings][types][trailer]`. The string
/// count is the first int of b4 (so the b4 value lane starts 4 bytes in); strings
/// and types are inline regions, not sub-buffers. There is no object-length lane
/// (OBJECT member counts come from b4 at walk time) and no auxiliary buffer.
fn lanes_v4(block: &[u8]) -> Result<Lanes, DecodeError> {
    const BUF: usize = 72; // single buffer base in an uncompressed v4 block

    // v4 header counts (see reader::decode).
    let count_b1 = i32_at(block, 28)? as usize;
    let count_b4 = i32_at(block, 32)? as usize;
    let count_b8 = i32_at(block, 36)? as usize;
    let count_b2 = i32_at(block, 64)? as usize;

    let mut off = 0usize;
    let b1_start = off;
    off += count_b1;
    let (b2_start, _) = lane(&mut off, count_b2, 2);
    let (b4_start, _) = lane(&mut off, count_b4, 4);
    // b8 is 8-aligned whether or not it is present (mirrors `layout_single`); the
    // string region begins immediately after it.
    let b8_start = if count_b8 > 0 {
        lane(&mut off, count_b8, 8).0
    } else {
        align(&mut off, 8);
        off
    };

    // String count is the first int of b4; the strings themselves are the
    // null-terminated run at `off`, and the type stream follows them.
    let string_count = u32::try_from(i32_at(block, BUF + b4_start)?)
        .map_err(|_| DecodeError::Kv3("negative string count"))? as usize;
    let mut sp = BUF + off;
    let mut strings = Vec::with_capacity(string_count);
    for _ in 0..string_count {
        strings.push(read_cstr(block, &mut sp)?);
    }
    let types = Lane { base: sp, pos: 0 };

    let main = [
        Lane {
            base: BUF + b1_start,
            pos: 0,
        },
        Lane {
            base: BUF + b2_start,
            pos: 0,
        },
        Lane {
            base: BUF + b4_start + 4, // skip the leading string count
            pos: 0,
        },
        Lane {
            base: BUF + b8_start,
            pos: 0,
        },
    ];
    // v4 has no object-length lane and no auxiliary buffer; those lanes are never
    // read while walking a v4 block, so an empty placeholder is correct.
    let empty = Lane { base: 0, pos: 0 };
    Ok(Lanes {
        types,
        obj_lengths: empty,
        main,
        aux: [empty, empty, empty, empty],
        strings,
    })
}

/// Computes the [`Lanes`] of an uncompressed v5 block. Mirrors `reader::decode`'s
/// field offsets and buffer layout.
fn lanes_v5(block: &[u8]) -> Result<Lanes, DecodeError> {
    // Header counts (v5). Aux counts are the "first" count block; main counts
    // sit in the v5-specific tail.
    let aux_b1 = i32_at(block, 28)? as usize;
    let aux_b4 = i32_at(block, 32)? as usize;
    let aux_b8 = i32_at(block, 36)? as usize;
    let aux_b2 = i32_at(block, 64)? as usize;
    let unc_buf1 = i32_at(block, 72)? as usize;
    let main_b1 = i32_at(block, 88)? as usize;
    let main_b2 = i32_at(block, 92)? as usize;
    let main_b4 = i32_at(block, 96)? as usize;
    let main_b8 = i32_at(block, 100)? as usize;
    let main_obj = i32_at(block, 108)? as usize;

    let buf1 = 120usize;
    let buf2 = buf1 + unc_buf1;

    // Aux buffer: [strings... in b1][b2][b4][b8]; string count is the first
    // int of aux b4, and aux b4's value region begins after it.
    let mut off = 0usize;
    let a_b1_start = off;
    off += aux_b1;
    let (a_b2_start, _) = lane(&mut off, aux_b2, 2);
    let (a_b4_start, _) = lane(&mut off, aux_b4, 4);
    let (a_b8_start, _) = lane(&mut off, aux_b8, 8);
    let string_count = u32::try_from(i32_at(block, buf1 + a_b4_start)?)
        .map_err(|_| DecodeError::Kv3("negative string count"))? as usize;
    let mut sp = buf1 + a_b1_start;
    let mut strings = Vec::with_capacity(string_count);
    for _ in 0..string_count {
        strings.push(read_cstr(block, &mut sp)?);
    }
    let aux = [
        Lane { base: sp, pos: 0 },
        Lane {
            base: buf1 + a_b2_start,
            pos: 0,
        },
        Lane {
            base: buf1 + a_b4_start + 4,
            pos: 0,
        },
        Lane {
            base: buf1 + a_b8_start,
            pos: 0,
        },
    ];

    // Main buffer: [object_lengths][b1][b2][b4][b8][types].
    let mut off = 0usize;
    let ol_start = off;
    off += main_obj * 4;
    let m_b1_start = off;
    off += main_b1;
    let (m_b2_start, _) = lane(&mut off, main_b2, 2);
    let (m_b4_start, _) = lane(&mut off, main_b4, 4);
    let (m_b8_start, _) = lane(&mut off, main_b8, 8);
    let types_start = off;

    let main = [
        Lane {
            base: buf2 + m_b1_start,
            pos: 0,
        },
        Lane {
            base: buf2 + m_b2_start,
            pos: 0,
        },
        Lane {
            base: buf2 + m_b4_start,
            pos: 0,
        },
        Lane {
            base: buf2 + m_b8_start,
            pos: 0,
        },
    ];

    Ok(Lanes {
        types: Lane {
            base: buf2 + types_start,
            pos: 0,
        },
        obj_lengths: Lane {
            base: buf2 + ol_start,
            pos: 0,
        },
        main,
        aux,
        strings,
    })
}

impl<'a> Walk<'a> {
    fn new(block: &'a [u8], targets: &'a [(usize, usize)]) -> Result<Self, DecodeError> {
        // `neutralize_draw_calls` (the only Walk caller) is v5-only and has already
        // verified the block is v5 before constructing the walker.
        let l = lanes(block, 5)?;
        Ok(Walk {
            block,
            types: l.types,
            obj_lengths: l.obj_lengths,
            main: l.main,
            aux: l.aux,
            strings: l.strings,
            targets,
            patches: Vec::new(),
        })
    }

    fn read_type(&mut self) -> Result<u8, DecodeError> {
        let mut t = *self
            .block
            .get(self.types.at())
            .ok_or(DecodeError::Kv3("type stream underrun"))?;
        self.types.pos += 1;
        if t & 0x80 != 0 {
            t &= 0x3F; // v5 masks 0x3F; the flag byte follows and is skipped.
            self.types.pos += 1;
        }
        Ok(t)
    }

    fn lane_u32(&mut self, lane: usize) -> Result<u32, DecodeError> {
        let at = self.main[lane].at();
        let v = u32_at(self.block, at)?;
        self.main[lane].pos += 4;
        Ok(v)
    }

    fn lane_u8(&mut self, lane: usize) -> Result<u8, DecodeError> {
        let v = *self
            .block
            .get(self.main[lane].at())
            .ok_or(DecodeError::Kv3("lane underrun"))?;
        self.main[lane].pos += 1;
        Ok(v)
    }

    fn obj_len(&mut self) -> Result<u32, DecodeError> {
        let v = u32_at(self.block, self.obj_lengths.at())?;
        self.obj_lengths.pos += 4;
        Ok(v)
    }

    fn key(&self, id: u32) -> &str {
        if id == u32::MAX {
            ""
        } else {
            self.strings.get(id as usize).map_or("", String::as_str)
        }
    }

    /// Walks one value of type `datatype`, advancing every cursor exactly as the
    /// reader would, and recording the byte offset when `where_` is [`Where::Record`].
    #[allow(clippy::wildcard_imports)] // node constants, mirroring reader::read_value
    fn value(&mut self, datatype: u8, where_: Where) -> Result<(), DecodeError> {
        use node::*;
        let record = matches!(where_, Where::Record);
        match datatype {
            // Lane-backed scalars: record before advancing if this is a target.
            INT32 | UINT32 | FLOAT => {
                if record && datatype != FLOAT {
                    self.patches.push((self.main[B4].at(), 4));
                }
                self.main[B4].pos += 4;
            }
            INT64 | UINT64 | DOUBLE => {
                if record && datatype != DOUBLE {
                    self.patches.push((self.main[B8].at(), 8));
                }
                self.main[B8].pos += 8;
            }
            INT16 | UINT16 => {
                if record {
                    self.patches.push((self.main[B2].at(), 2));
                }
                self.main[B2].pos += 2;
            }
            INT32_AS_BYTE | BOOLEAN => {
                if record && datatype == INT32_AS_BYTE {
                    self.patches.push((self.main[B1].at(), 1));
                }
                self.main[B1].pos += 1;
            }
            STRING => {
                self.main[B4].pos += 4;
            }
            NULL | BOOLEAN_TRUE | BOOLEAN_FALSE | INT64_ZERO | INT64_ONE | DOUBLE_ZERO
            | DOUBLE_ONE => {}
            ARRAY => {
                let n = self.lane_u32(B4)?;
                for i in 0..n {
                    let t = self.read_type()?;
                    self.value(t, child_index(where_, i as usize))?;
                }
            }
            ARRAY_TYPED => {
                let n = self.lane_u32(B4)?;
                let sub = self.read_type()?;
                for i in 0..n {
                    self.value(sub, child_index(where_, i as usize))?;
                }
            }
            ARRAY_TYPE_BYTE_LENGTH => {
                let n = u32::from(self.lane_u8(B1)?);
                let sub = self.read_type()?;
                for i in 0..n {
                    self.value(sub, child_index(where_, i as usize))?;
                }
            }
            ARRAY_TYPE_AUXILIARY_BUFFER => {
                let n = u32::from(self.lane_u8(B1)?);
                let sub = self.read_type()?;
                std::mem::swap(&mut self.main, &mut self.aux);
                for i in 0..n {
                    self.value(sub, child_index(where_, i as usize))?;
                }
                std::mem::swap(&mut self.main, &mut self.aux);
            }
            OBJECT => {
                let n = self.obj_len()?;
                for _ in 0..n {
                    let vt = self.read_type()?;
                    let id = self.lane_u32(B4)?;
                    let child = child_key(where_, self.key(id), self.targets);
                    self.value(vt, child)?;
                }
            }
            other => return Err(DecodeError::Kv3NodeType(other)),
        }
        Ok(())
    }
}

/// Refines the path state when descending into object member `key`.
fn child_key(where_: Where, key: &str, targets: &[(usize, usize)]) -> Where {
    match where_ {
        Where::Root if key == "m_sceneObjects" => Where::InSceneObjects,
        Where::InSceneObject(so) if key == "m_drawCalls" => Where::InDrawCalls(so),
        Where::InDrawCall(so, dc) if key == "m_nIndexCount" && targets.contains(&(so, dc)) => {
            Where::Record
        }
        _ => Where::Other,
    }
}

/// Refines the path state when descending into array element `i`.
fn child_index(where_: Where, i: usize) -> Where {
    match where_ {
        Where::InSceneObjects => Where::InSceneObject(i),
        Where::InDrawCalls(so) => Where::InDrawCall(so, i),
        _ => Where::Other,
    }
}

fn align(off: &mut usize, a: usize) {
    *off = (*off + (a - 1)) & !(a - 1);
}

fn lane(off: &mut usize, count: usize, elem: usize) -> (usize, usize) {
    if count == 0 {
        return (*off, 0);
    }
    align(off, elem);
    let start = *off;
    let len = count * elem;
    *off += len;
    (start, len)
}

fn i32_at(b: &[u8], o: usize) -> Result<i32, DecodeError> {
    let s = b
        .get(o..o + 4)
        .ok_or(DecodeError::Kv3("header field out of range"))?;
    Ok(i32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

fn u32_at(b: &[u8], o: usize) -> Result<u32, DecodeError> {
    let s = b
        .get(o..o + 4)
        .ok_or(DecodeError::Kv3("lane read out of range"))?;
    Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

fn read_cstr(buf: &[u8], pos: &mut usize) -> Result<String, DecodeError> {
    let start = *pos;
    while *pos < buf.len() && buf[*pos] != 0 {
        *pos += 1;
    }
    if *pos >= buf.len() {
        return Err(DecodeError::Kv3("unterminated string"));
    }
    let s = String::from_utf8_lossy(&buf[start..*pos]).into_owned();
    *pos += 1;
    Ok(s)
}

/// Replaces a binary-blob value's bytes in place, on a byte-faithful uncompressed
/// re-wrap of `block`. `old` must appear exactly once in the (uncompressed) block
/// and `new` must be the same length, so every other byte (including the blob's
/// recorded length, which lives elsewhere in the structure) is preserved.
///
/// Unlike the path-keyed setters, this locates the blob by its (unique) content
/// rather than by KV3 path: a blob is the only large opaque byte run in these
/// resources, so an exact-content match is unambiguous and avoids walking the
/// v5 blob-buffer layout. Built to write a re-encoded `m_compressedPoseData`
/// stream back into a `.vnmclip_c` (the new stream is the same length as the old
/// whenever the set of animated channels is unchanged).
///
/// Errors if lengths differ, if `old` is empty, or if `old` is absent or occurs
/// more than once in the block.
pub fn set_blob(block: &[u8], old: &[u8], new: &[u8]) -> Result<Vec<u8>, DecodeError> {
    if old.is_empty() {
        return Err(DecodeError::Kv3("blob replace: empty blob"));
    }

    // The common case (Deadlock `.vnmclip_c` pose stream, `.vmat_c` dynamic
    // expression): a blobbed-LZ4 v5 block whose blob lives in a compressed frame.
    // `replace_blob_v5` content-keys the target by `old` and re-chunks the region,
    // so `new` may be any length and a multi-blob block (several `m_dynamicParams`
    // expressions) is fine. Keep the block compressed (the engine misreads a
    // blobbed block flipped to raw).
    if super::rewrap::is_blobbed_lz4_v5(block) {
        return super::rewrap::replace_blob_v5(block, new, Some(old));
    }

    // Otherwise the block has no compressed blob frames: re-wrap it uncompressed
    // (a no-op if already raw) and overwrite the blob bytes where they sit. The
    // raw-overwrite path can only swap equal-length bytes in place.
    if old.len() != new.len() {
        return Err(DecodeError::Kv3(
            "blob replace requires equal length for a non-frame-compressed blob",
        ));
    }
    let mut out = rewrap_uncompressed(block)?;
    let mut found = None;
    for start in 0..=out.len().saturating_sub(old.len()) {
        if &out[start..start + old.len()] == old {
            if found.is_some() {
                return Err(DecodeError::Kv3("blob occurs more than once; ambiguous"));
            }
            found = Some(start);
        }
    }
    let start = found.ok_or(DecodeError::Kv3("blob not found in block"))?;
    out[start..start + new.len()].copy_from_slice(new);
    Ok(out)
}

/// Replace the sole binary blob of a blobbed-LZ4 v5 block (a `.vnmclip_c`'s
/// `m_compressedPoseData`) with `new` of **any** length up to one LZ4 frame
/// (16 KB), unlike [`set_blob`] which is content-keyed and equal-length. Built for
/// re-encoding a clip whose animated-channel set changed (so the pose stream grew
/// or shrank). Errors on a non-blobbed block or a `new` larger than one frame; see
/// [`super::rewrap::replace_blob_v5`].
pub fn set_sole_blob(block: &[u8], new: &[u8]) -> Result<Vec<u8>, DecodeError> {
    if !super::rewrap::is_blobbed_lz4_v5(block) {
        return Err(DecodeError::Kv3(
            "set_sole_blob: not a blobbed LZ4 v5 block",
        ));
    }
    super::rewrap::replace_blob_v5(block, new, None)
}
