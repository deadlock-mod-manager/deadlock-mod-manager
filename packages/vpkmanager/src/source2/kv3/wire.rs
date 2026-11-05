// SPDX-FileCopyrightText: 2026 esoc
// SPDX-License-Identifier: MIT
// Adapted from Slush97/vpkmerge d70672e96a433cfcc507eab3b2808cc4d74dc693.
//! Lossless binary KV3 and a **v5** writer.
//!
//! [`Value`] folds the wire detail away (narrow numeric tags widen, typed
//! arrays become plain arrays, value flags drop). That loss is harmless for
//! soundevents but not for model / animation data: an untyped-array re-encode
//! of a hero model loaded as an error model in-game, and a `Value`-built NM clip
//! loaded but never animated. A [`Document`] keeps every node's exact tag,
//! flag, and typed-array framing, and [`encode_v5`] lays it back out
//! lane-for-lane the way the reader consumes it, LZ4-compressed like Valve's
//! own files. Against every KV3 block in pak01 the decompressed buffers and
//! header come out byte-identical to Valve's.
//!
//! [`encode_v5_like`] bridges the two: it encodes an edited `Value` tree while
//! borrowing each node's wire shape from a template document by path, so an
//! editor that works on `Value` still emits the original's typed framing.

use super::Format;
use super::node;
use super::types::Value;
use crate::source2::error::DecodeError;
use std::collections::HashMap;

const MAGIC_V5: u32 = 0x4B56_3305;
const TRAILER: u32 = 0xFFEE_DD00;
const LZ4_FRAME_SIZE: u16 = 16384;
const HEADER_LEN: usize = 120;

/// A decoded KV3 payload with nothing folded away.
#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub format: Format,
    /// The string table in its original order. Re-encoding keeps every existing
    /// id stable and appends new strings.
    pub strings: Vec<String>,
    pub root: Node,
}

/// One node exactly as stored: its wire tag, its value flag (when the type
/// byte carried one), and its payload.
#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub tag: u8,
    pub flag: Option<u8>,
    pub val: Val,
}

/// A node payload. Which variant appears is fixed by the owning tag.
#[derive(Debug, Clone, PartialEq)]
pub enum Val {
    /// The tag carries the value: `NULL`, `BOOLEAN_TRUE/FALSE`,
    /// `INT64_ZERO/ONE`, `UINT32_ZERO/ONE`, `DOUBLE_ZERO/ONE`.
    Implied,
    /// `BOOLEAN`: the raw byte from the 1-byte lane (1 = true).
    Bool(u8),
    /// `INT64`, `INT32`, `INT16`, `INT8`, `INT32_AS_BYTE`.
    Int(i64),
    /// `UINT64`, `UINT32`, `UINT16`.
    UInt(u64),
    F32(f32),
    F64(f64),
    String(String),
    Blob(Vec<u8>),
    /// Generic `ARRAY`: every element carries its own type byte.
    Array(Vec<Node>),
    /// `ARRAY_TYPED` (count on the 4-byte lane), `ARRAY_TYPE_BYTE_LENGTH` (count
    /// on the 1-byte lane), or `ARRAY_TYPE_AUXILIARY_BUFFER` (count on the 1-byte
    /// lane, elements in the other buffer): one shared element type, no
    /// per-element type bytes.
    Typed {
        sub: u8,
        sub_flag: Option<u8>,
        items: Vec<Val>,
    },
    Object(Vec<(String, Node)>),
}

impl Document {
    /// The folded [`Value`] view, identical to what [`super::decode`] returns.
    #[must_use]
    pub fn to_value(&self) -> Value {
        self.root.to_value()
    }
}

impl Node {
    #[must_use]
    pub fn to_value(&self) -> Value {
        val_to_value(self.tag, &self.val)
    }

    /// Member lookup on an object node.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&Node> {
        match &self.val {
            Val::Object(m) => m.iter().find(|(k, _)| k == key).map(|(_, n)| n),
            _ => None,
        }
    }
}

#[allow(clippy::wildcard_imports)]
fn val_to_value(tag: u8, val: &Val) -> Value {
    use node::*;
    match val {
        Val::Implied => match tag {
            BOOLEAN_TRUE => Value::Bool(true),
            BOOLEAN_FALSE => Value::Bool(false),
            INT64_ZERO => Value::Int(0),
            INT64_ONE => Value::Int(1),
            UINT32_ZERO => Value::UInt(0),
            UINT32_ONE => Value::UInt(1),
            DOUBLE_ZERO => Value::Double(0.0),
            DOUBLE_ONE => Value::Double(1.0),
            _ => Value::Null,
        },
        Val::Bool(b) => Value::Bool(*b == 1),
        Val::Int(i) => Value::Int(*i),
        Val::UInt(u) => Value::UInt(*u),
        Val::F32(f) => Value::Double(f64::from(*f)),
        Val::F64(d) => Value::Double(*d),
        Val::String(s) => Value::String(s.clone()),
        Val::Blob(b) => Value::Binary(b.clone()),
        Val::Array(items) => Value::Array(items.iter().map(Node::to_value).collect()),
        Val::Typed { sub, items, .. } => {
            Value::Array(items.iter().map(|v| val_to_value(*sub, v)).collect())
        }
        Val::Object(m) => Value::Object(m.iter().map(|(k, n)| (k.clone(), n.to_value())).collect()),
    }
}

// --- Value -> wire shaping --------------------------------------------------

/// A template node to borrow wire shape from: `(tag, flag, payload)`. Typed
/// array elements carry no tag of their own, so the tag comes from the array.
type Hint<'a> = Option<(u8, Option<u8>, &'a Val)>;

fn hint_of(n: &Node) -> (u8, Option<u8>, &Val) {
    (n.tag, n.flag, &n.val)
}

/// Encode an edited [`Value`] tree as KV3 v5, taking each node's wire shape
/// (numeric width, typed-array framing, value flags, string-table order) from
/// `template` wherever the paths line up. Object members match by key, array
/// elements by index, and elements past the template's end borrow the shape
/// of its last element. Nodes with no template counterpart get Valve-like
/// defaults: empty arrays generic, homogeneous numeric arrays in the auxiliary
/// buffer, homogeneous object/string arrays typed.
///
/// # Errors
/// Fails when a count or size overflows its wire field.
pub fn encode_v5_like(value: &Value, template: &Document) -> Result<Vec<u8>, DecodeError> {
    let root = shape(value, Some(hint_of(&template.root)));
    encode_v5(&Document {
        format: template.format,
        strings: template.strings.clone(),
        root,
    })
}

fn shape(v: &Value, hint: Hint) -> Node {
    if let Some((tag, flag, hval)) = hint {
        if let Some((tag, val)) = shape_as(v, tag, hval) {
            return Node { tag, flag, val };
        }
    }
    let (tag, val) = shape_default(v);
    Node {
        tag,
        flag: None,
        val,
    }
}

#[allow(clippy::wildcard_imports)]
fn shape_as(v: &Value, tag: u8, hval: &Val) -> Option<(u8, Val)> {
    use node::*;
    match v {
        Value::Array(items) => match (tag, hval) {
            // An empty template array says nothing about element shape.
            (ARRAY, Val::Array(hn)) if hn.is_empty() && !items.is_empty() => None,
            (ARRAY, Val::Array(hn)) => Some((
                ARRAY,
                Val::Array(
                    items
                        .iter()
                        .enumerate()
                        .map(|(i, it)| shape(it, hn.get(i).or(hn.last()).map(hint_of)))
                        .collect(),
                ),
            )),
            (
                ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH | ARRAY_TYPE_AUXILIARY_BUFFER,
                Val::Typed {
                    sub,
                    sub_flag,
                    items: hitems,
                },
            ) => {
                let (sub, items) = shape_typed_items(items, *sub, *sub_flag, hitems)?;
                let tag = if tag != ARRAY_TYPED && items.len() > 255 {
                    ARRAY_TYPED
                } else {
                    tag
                };
                Some((
                    tag,
                    Val::Typed {
                        sub,
                        sub_flag: *sub_flag,
                        items,
                    },
                ))
            }
            _ => None,
        },
        Value::Object(members) => match (tag, hval) {
            (OBJECT, Val::Object(hm)) => Some((
                OBJECT,
                Val::Object(
                    members
                        .iter()
                        .map(|(k, mv)| {
                            let h = hm.iter().find(|(hk, _)| hk == k).map(|(_, n)| n);
                            (k.clone(), shape(mv, h.map(hint_of)))
                        })
                        .collect(),
                ),
            )),
            _ => None,
        },
        _ => scalar_node(v, tag),
    }
}

/// Shape a typed array's elements under one shared sub tag. Scalar subs widen
/// (e.g. `INT16 -> INT32 -> INT64`) until every element fits; container
/// elements shape against the template element at the same index. `None`
/// when the elements cannot share one sub tag.
fn shape_typed_items(
    items: &[Value],
    sub: u8,
    sub_flag: Option<u8>,
    hitems: &[Val],
) -> Option<(u8, Vec<Val>)> {
    if is_container(sub) {
        let mut out = Vec::with_capacity(items.len());
        for (i, it) in items.iter().enumerate() {
            let node = match hitems.get(i).or(hitems.last()) {
                Some(h) => shape(it, Some((sub, sub_flag, h))),
                None => shape(it, None),
            };
            if node.tag != sub {
                return None;
            }
            out.push(node.val);
        }
        return Some((sub, out));
    }
    let mut sub = sub;
    loop {
        if let Some(vals) = items
            .iter()
            .map(|it| scalar_exact(it, sub))
            .collect::<Option<Vec<_>>>()
        {
            return Some((sub, vals));
        }
        sub = widen(sub)?;
    }
}

#[allow(clippy::wildcard_imports)]
fn is_container(tag: u8) -> bool {
    use node::*;
    matches!(
        tag,
        OBJECT | ARRAY | ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH | ARRAY_TYPE_AUXILIARY_BUFFER
    )
}

/// The next wider tag of the same numeric family, keeping int32-as-byte and
/// int16 at 32 bits before going to 64 so a native `int32` vector stays one.
#[allow(clippy::wildcard_imports)]
fn widen(tag: u8) -> Option<u8> {
    use node::*;
    Some(match tag {
        INT8 | INT32_AS_BYTE | INT16 => INT32,
        INT32 | INT64_ZERO | INT64_ONE => INT64,
        UINT16 | UINT32_ZERO | UINT32_ONE => UINT32,
        UINT32 => UINT64,
        DOUBLE_ZERO | DOUBLE_ONE => DOUBLE,
        BOOLEAN_TRUE | BOOLEAN_FALSE => BOOLEAN,
        _ => return None,
    })
}

/// A lone scalar node under the template tag: the tag itself when the value
/// fits exactly, the implied-value tag for 0/1/true/false where the template
/// used one, else the family's widening chain.
#[allow(clippy::wildcard_imports, clippy::float_cmp)]
fn scalar_node(v: &Value, tag: u8) -> Option<(u8, Val)> {
    use node::*;
    match (v, tag) {
        (Value::Bool(b), BOOLEAN_TRUE | BOOLEAN_FALSE) => {
            return Some((if *b { BOOLEAN_TRUE } else { BOOLEAN_FALSE }, Val::Implied));
        }
        (Value::Int(0) | Value::UInt(0), INT64_ZERO | INT64_ONE) => {
            return Some((INT64_ZERO, Val::Implied));
        }
        (Value::Int(1) | Value::UInt(1), INT64_ZERO | INT64_ONE) => {
            return Some((INT64_ONE, Val::Implied));
        }
        (Value::Int(0) | Value::UInt(0), UINT32_ZERO | UINT32_ONE) => {
            return Some((UINT32_ZERO, Val::Implied));
        }
        (Value::Int(1) | Value::UInt(1), UINT32_ZERO | UINT32_ONE) => {
            return Some((UINT32_ONE, Val::Implied));
        }
        (Value::Double(d), DOUBLE_ZERO | DOUBLE_ONE) if *d == 0.0 || *d == 1.0 => {
            let t = if *d == 0.0 { DOUBLE_ZERO } else { DOUBLE_ONE };
            return Some((t, Val::Implied));
        }
        _ => {}
    }
    let mut t = tag;
    loop {
        if let Some(val) = scalar_exact(v, t) {
            return Some((t, val));
        }
        t = widen(t)?;
    }
}

/// `v` stored under exactly `tag`, or `None` when the tag cannot hold it.
/// Integers may land in a float tag (the field is a float); floats never
/// truncate into an integer tag.
#[allow(
    clippy::wildcard_imports,
    clippy::float_cmp,
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss
)]
fn scalar_exact(v: &Value, tag: u8) -> Option<Val> {
    use node::*;
    let int = match v {
        Value::Int(i) => Some(i128::from(*i)),
        Value::UInt(u) => Some(i128::from(*u)),
        _ => None,
    };
    let in_range = |lo: i128, hi: i128| int.filter(|i| (lo..=hi).contains(i));
    Some(match (tag, v) {
        (NULL, Value::Null)
        | (BOOLEAN_TRUE, Value::Bool(true))
        | (BOOLEAN_FALSE, Value::Bool(false)) => Val::Implied,
        (BOOLEAN, Value::Bool(b)) => Val::Bool(u8::from(*b)),
        (INT64_ZERO | UINT32_ZERO, _) if int == Some(0) => Val::Implied,
        (INT64_ONE | UINT32_ONE, _) if int == Some(1) => Val::Implied,
        (INT8, _) => Val::Int(in_range(i128::from(i8::MIN), i128::from(i8::MAX))? as i64),
        (INT32_AS_BYTE, _) => Val::Int(in_range(0, 255)? as i64),
        (INT16, _) => Val::Int(in_range(i128::from(i16::MIN), i128::from(i16::MAX))? as i64),
        (INT32, _) => Val::Int(in_range(i128::from(i32::MIN), i128::from(i32::MAX))? as i64),
        (INT64, _) => Val::Int(in_range(i128::from(i64::MIN), i128::from(i64::MAX))? as i64),
        (UINT16, _) => Val::UInt(in_range(0, i128::from(u16::MAX))? as u64),
        (UINT32, _) => Val::UInt(in_range(0, i128::from(u32::MAX))? as u64),
        (UINT64, _) => Val::UInt(in_range(0, i128::from(u64::MAX))? as u64),
        (FLOAT, Value::Double(d)) => Val::F32(*d as f32),
        (FLOAT, _) => Val::F32(int? as f32),
        (DOUBLE, Value::Double(d)) => Val::F64(*d),
        (DOUBLE, _) => Val::F64(int? as f64),
        (DOUBLE_ZERO, Value::Double(d)) if *d == 0.0 => Val::Implied,
        (DOUBLE_ONE, Value::Double(d)) if *d == 1.0 => Val::Implied,
        (STRING, Value::String(s)) => Val::String(s.clone()),
        (BINARY_BLOB, Value::Binary(b)) => Val::Blob(b.clone()),
        _ => return None,
    })
}

/// Shape for a node the template has no counterpart for.
#[allow(clippy::wildcard_imports, clippy::float_cmp)]
fn shape_default(v: &Value) -> (u8, Val) {
    use node::*;
    match v {
        Value::Null => (NULL, Val::Implied),
        Value::Bool(true) => (BOOLEAN_TRUE, Val::Implied),
        Value::Bool(false) => (BOOLEAN_FALSE, Val::Implied),
        Value::Int(0) => (INT64_ZERO, Val::Implied),
        Value::Int(1) => (INT64_ONE, Val::Implied),
        Value::Int(i) => (INT64, Val::Int(*i)),
        Value::UInt(u) => (UINT64, Val::UInt(*u)),
        Value::Double(d) if *d == 0.0 => (DOUBLE_ZERO, Val::Implied),
        Value::Double(d) if *d == 1.0 => (DOUBLE_ONE, Val::Implied),
        Value::Double(d) => (DOUBLE, Val::F64(*d)),
        Value::String(s) => (STRING, Val::String(s.clone())),
        Value::Binary(b) => (BINARY_BLOB, Val::Blob(b.clone())),
        Value::Object(m) => (
            OBJECT,
            Val::Object(m.iter().map(|(k, v)| (k.clone(), shape(v, None))).collect()),
        ),
        Value::Array(items) => shape_default_array(items),
    }
}

#[allow(clippy::wildcard_imports)]
fn shape_default_array(items: &[Value]) -> (u8, Val) {
    use node::*;
    let generic = || {
        (
            ARRAY,
            Val::Array(items.iter().map(|v| shape(v, None)).collect()),
        )
    };
    let Some(first) = items.first() else {
        return generic();
    };
    let same = |f: fn(&Value) -> bool| items.iter().all(f);
    let (tag, sub) = if same(|v| matches!(v, Value::Double(_))) {
        (ARRAY_TYPE_AUXILIARY_BUFFER, DOUBLE)
    } else if same(|v| matches!(v, Value::Int(_))) {
        (ARRAY_TYPE_AUXILIARY_BUFFER, INT64)
    } else if same(|v| matches!(v, Value::String(_))) {
        (ARRAY_TYPE_BYTE_LENGTH, STRING)
    } else if same(|v| matches!(v, Value::Object(_))) {
        (ARRAY_TYPE_BYTE_LENGTH, OBJECT)
    } else {
        return generic();
    };
    let tag = if items.len() > 255 { ARRAY_TYPED } else { tag };
    let vals = if sub == OBJECT {
        items.iter().map(|v| shape_default(v).1).collect()
    } else {
        match items
            .iter()
            .map(|v| scalar_exact(v, sub))
            .collect::<Option<Vec<_>>>()
        {
            Some(vals) => vals,
            None => return generic(),
        }
    };
    let _ = first;
    (
        tag,
        Val::Typed {
            sub,
            sub_flag: None,
            items: vals,
        },
    )
}

// --- v5 encoder -----------------------------------------------------------

#[derive(Default)]
struct Lanes {
    b1: Vec<u8>,
    b2: Vec<u8>,
    b4: Vec<u8>,
    b8: Vec<u8>,
}

struct Enc {
    main: Lanes,
    aux: Lanes,
    object_lengths: Vec<u8>,
    types: Vec<u8>,
    blobs: Vec<Vec<u8>>,
    strings: Vec<String>,
    ids: HashMap<String, i32>,
    /// True while writing the elements of an auxiliary-buffer typed array.
    in_aux: bool,
    // Structural totals the v5 header carries (derived from Valve's files:
    // every one matches across all of pak01).
    nodes: usize,
    arrays: usize,
    main_arrays: usize,
    main_array_slots: usize,
}

impl Enc {
    fn new(strings: &[String]) -> Self {
        let mut ids = HashMap::new();
        for (i, s) in strings.iter().enumerate() {
            ids.entry(s.clone())
                .or_insert(i32::try_from(i).expect("string table overflow"));
        }
        Self {
            main: Lanes::default(),
            aux: Lanes::default(),
            object_lengths: Vec::new(),
            types: Vec::new(),
            blobs: Vec::new(),
            strings: strings.to_vec(),
            ids,
            in_aux: false,
            nodes: 0,
            arrays: 0,
            main_arrays: 0,
            main_array_slots: 0,
        }
    }

    fn string_id(&mut self, s: &str) -> Result<i32, DecodeError> {
        if s.is_empty() && !self.ids.contains_key(s) {
            return Ok(-1);
        }
        if let Some(&id) = self.ids.get(s) {
            return Ok(id);
        }
        let id = fit_i32(self.strings.len())?;
        self.strings.push(s.to_owned());
        self.ids.insert(s.to_owned(), id);
        Ok(id)
    }

    fn write_type(&mut self, tag: u8, flag: Option<u8>) {
        match flag {
            Some(f) => {
                self.types.push(tag | 0x80);
                self.types.push(f);
            }
            None => self.types.push(tag),
        }
    }

    /// Header totals for one array. Every array outside an auxiliary buffer
    /// counts toward the main-buffer totals except an auxiliary-buffer array of
    /// fewer than 32 elements; an empty array still takes one slot. (Fitted to
    /// Valve's output: exact on every v5 block in pak01.)
    fn count_array(&mut self, aux_array: bool, len: usize) {
        self.arrays += 1;
        if (!aux_array || len >= 32) && !self.in_aux {
            self.main_arrays += 1;
            self.main_array_slots += len.max(1);
        }
    }

    fn write_node(&mut self, n: &Node) -> Result<(), DecodeError> {
        self.nodes += 1;
        self.write_type(n.tag, n.flag);
        self.write_val(n.tag, &n.val)
    }

    #[allow(clippy::wildcard_imports, clippy::cast_sign_loss)]
    fn write_val(&mut self, tag: u8, val: &Val) -> Result<(), DecodeError> {
        use node::*;
        match (tag, val) {
            (
                NULL | BOOLEAN_TRUE | BOOLEAN_FALSE | INT64_ZERO | INT64_ONE | DOUBLE_ZERO
                | DOUBLE_ONE | UINT32_ZERO | UINT32_ONE,
                Val::Implied,
            ) => {}
            (BOOLEAN, Val::Bool(b)) => self.main.b1.push(*b),
            (INT8, Val::Int(i)) => self
                .main
                .b1
                .extend_from_slice(&fit::<i8, _>(*i)?.to_le_bytes()),
            (INT32_AS_BYTE, Val::Int(i)) => self.main.b1.push(fit(*i)?),
            (INT16, Val::Int(i)) => self
                .main
                .b2
                .extend_from_slice(&fit::<i16, _>(*i)?.to_le_bytes()),
            (UINT16, Val::UInt(u)) => self
                .main
                .b2
                .extend_from_slice(&fit::<u16, _>(*u)?.to_le_bytes()),
            (INT32, Val::Int(i)) => self
                .main
                .b4
                .extend_from_slice(&fit::<i32, _>(*i)?.to_le_bytes()),
            (UINT32, Val::UInt(u)) => self
                .main
                .b4
                .extend_from_slice(&fit::<u32, _>(*u)?.to_le_bytes()),
            (FLOAT, Val::F32(f)) => self.main.b4.extend_from_slice(&f.to_bits().to_le_bytes()),
            (INT64, Val::Int(i)) => self.main.b8.extend_from_slice(&i.to_le_bytes()),
            (UINT64, Val::UInt(u)) => self.main.b8.extend_from_slice(&u.to_le_bytes()),
            (DOUBLE, Val::F64(d)) => self.main.b8.extend_from_slice(&d.to_bits().to_le_bytes()),
            (STRING, Val::String(s)) => {
                let id = self.string_id(s)?;
                self.main.b4.extend_from_slice(&id.to_le_bytes());
            }
            (BINARY_BLOB, Val::Blob(b)) => self.blobs.push(b.clone()),
            (ARRAY, Val::Array(items)) => {
                self.count_array(false, items.len());
                self.main
                    .b4
                    .extend_from_slice(&fit::<u32, _>(items.len())?.to_le_bytes());
                for n in items {
                    self.write_node(n)?;
                }
            }
            (
                ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH | ARRAY_TYPE_AUXILIARY_BUFFER,
                Val::Typed {
                    sub,
                    sub_flag,
                    items,
                },
            ) => {
                self.count_array(tag == ARRAY_TYPE_AUXILIARY_BUFFER, items.len());
                if tag == ARRAY_TYPED {
                    self.main
                        .b4
                        .extend_from_slice(&fit::<u32, _>(items.len())?.to_le_bytes());
                } else {
                    self.main.b1.push(fit::<u8, _>(items.len())?);
                }
                self.write_type(*sub, *sub_flag);
                let aux = tag == ARRAY_TYPE_AUXILIARY_BUFFER;
                if aux {
                    std::mem::swap(&mut self.main, &mut self.aux);
                    self.in_aux = !self.in_aux;
                }
                let mut res = Ok(());
                for v in items {
                    res = self.write_val(*sub, v);
                    if res.is_err() {
                        break;
                    }
                }
                if aux {
                    std::mem::swap(&mut self.main, &mut self.aux);
                    self.in_aux = !self.in_aux;
                }
                res?;
            }
            (OBJECT, Val::Object(members)) => {
                self.object_lengths
                    .extend_from_slice(&fit::<u32, _>(members.len())?.to_le_bytes());
                for (key, n) in members {
                    self.nodes += 1;
                    self.write_type(n.tag, n.flag);
                    let id = self.string_id(key)?;
                    self.main.b4.extend_from_slice(&id.to_le_bytes());
                    self.write_val(n.tag, &n.val)?;
                }
            }
            _ => return Err(DecodeError::Kv3("wire node payload does not match its tag")),
        }
        Ok(())
    }
}

/// Encode a [`Document`] as a KV3 **v5** payload, LZ4-compressed (the only
/// shape the engine accepts for blob-bearing blocks, and what Valve ships).
///
/// # Errors
/// Fails when a node's payload does not match its tag, or a count or size
/// overflows its wire field.
pub fn encode_v5(doc: &Document) -> Result<Vec<u8>, DecodeError> {
    let mut enc = Enc::new(&doc.strings);
    enc.write_node(&doc.root)?;

    // buf1 (auxiliary): [strings + aux b1][b2][string count + aux b4][b8].
    let mut buf1 = Vec::new();
    for s in &enc.strings {
        buf1.extend_from_slice(s.as_bytes());
        buf1.push(0);
    }
    buf1.extend_from_slice(&enc.aux.b1);
    let aux_b1 = buf1.len();
    let mut aux_b4 = fit::<u32, _>(enc.strings.len())?.to_le_bytes().to_vec();
    aux_b4.extend_from_slice(&enc.aux.b4);
    push_lane(&mut buf1, &enc.aux.b2, 2);
    push_lane(&mut buf1, &aux_b4, 4);
    push_lane(&mut buf1, &enc.aux.b8, 8);

    // buf2 (main): [object lengths][b1][b2][b4][b8][types][tail].
    let mut buf2 = enc.object_lengths.clone();
    buf2.extend_from_slice(&enc.main.b1);
    push_lane(&mut buf2, &enc.main.b2, 2);
    push_lane(&mut buf2, &enc.main.b4, 4);
    push_lane(&mut buf2, &enc.main.b8, 8);
    buf2.extend_from_slice(&enc.types);

    // Blobs are framed one LZ4 frame per blob (a blob over the frame size splits
    // into frame-size pieces); Valve never packs two blobs into one frame, and the
    // engine rejects a block that does.
    let mut frames = Vec::new();
    let mut frame_table = Vec::new();
    let mut size_blobs = 0usize;
    if enc.blobs.is_empty() {
        buf2.extend_from_slice(&TRAILER.to_le_bytes());
    } else {
        for b in &enc.blobs {
            buf2.extend_from_slice(&fit::<i32, _>(b.len())?.to_le_bytes());
        }
        buf2.extend_from_slice(&TRAILER.to_le_bytes());
        for b in &enc.blobs {
            size_blobs += b.len();
            for chunk in b.chunks(usize::from(LZ4_FRAME_SIZE)) {
                let c = lz4_flex::block::compress(chunk);
                frame_table.extend_from_slice(
                    &u16::try_from(c.len())
                        .map_err(|_| DecodeError::Kv3("blob frame exceeds 64 KB"))?
                        .to_le_bytes(),
                );
                frames.extend_from_slice(&c);
            }
        }
        buf2.extend_from_slice(&frame_table);
    }

    let comp1 = lz4_flex::block::compress(&buf1);
    let comp2 = lz4_flex::block::compress(&buf2);

    let mut out = Vec::with_capacity(HEADER_LEN + comp1.len() + comp2.len() + frames.len() + 4);
    let mut w32 = |v: u32| out.extend_from_slice(&v.to_le_bytes());
    w32(MAGIC_V5);
    out.extend_from_slice(&doc.format.0);
    out.extend_from_slice(&1u32.to_le_bytes()); // LZ4
    out.extend_from_slice(&0u16.to_le_bytes()); // dictionary id
    out.extend_from_slice(&LZ4_FRAME_SIZE.to_le_bytes());
    let mut w = |v: usize| -> Result<(), DecodeError> {
        out.extend_from_slice(&fit::<i32, _>(v)?.to_le_bytes());
        Ok(())
    };
    w(aux_b1)?; // 28 aux countBytes1 (string bytes included)
    w(aux_b4.len() / 4)?; // 32 aux countBytes4 (string count included)
    w(enc.aux.b8.len() / 8)?; // 36 aux countBytes8
    w(enc.types.len())?; // 40 countTypes
    let objects = enc.object_lengths.len() / 4;
    // 44/46: object and array totals, saturated to u16 (the i32 object count
    // at 108 carries the exact figure).
    out.extend_from_slice(&sat_u16(objects).to_le_bytes()); // 44 countObjects
    out.extend_from_slice(&sat_u16(enc.arrays).to_le_bytes()); // 46 countArrays
    let mut w = |v: usize| -> Result<(), DecodeError> {
        out.extend_from_slice(&fit::<i32, _>(v)?.to_le_bytes());
        Ok(())
    };
    w(buf1.len() + buf2.len())?; // 48 sizeUncompressedTotal
    w(comp1.len() + comp2.len())?; // 52 sizeCompressedTotal
    w(enc.blobs.len())?; // 56 countBlocks
    w(size_blobs)?; // 60 sizeBinaryBlobsBytes
    w(enc.aux.b2.len() / 2)?; // 64 aux countBytes2
    w(frame_table.len())?; // 68 sizeBlockCompressedSizesBytes
    w(buf1.len())?; // 72
    w(comp1.len())?; // 76
    w(buf2.len())?; // 80
    w(comp2.len())?; // 84
    w(enc.main.b1.len())?; // 88
    w(enc.main.b2.len() / 2)?; // 92
    w(enc.main.b4.len() / 4)?; // 96
    w(enc.main.b8.len() / 8)?; // 100
    w(enc.nodes)?; // 104 typed nodes (every node with its own type byte)
    w(objects)?; // 108 object count
    w(enc.main_arrays)?; // 112 main-buffer arrays
    w(enc.main_array_slots)?; // 116 main-buffer array slots
    debug_assert_eq!(out.len(), HEADER_LEN);

    out.extend_from_slice(&comp1);
    out.extend_from_slice(&comp2);
    if !enc.blobs.is_empty() {
        out.extend_from_slice(&frames);
        out.extend_from_slice(&TRAILER.to_le_bytes());
    }
    Ok(out)
}

/// Append `lane` to `buf` at its natural alignment. An empty lane adds no
/// padding, matching the reader's `lane()` which only aligns a non-empty lane.
fn push_lane(buf: &mut Vec<u8>, lane: &[u8], align: usize) {
    if lane.is_empty() {
        return;
    }
    let pad = (align - buf.len() % align) % align;
    buf.resize(buf.len() + pad, 0);
    buf.extend_from_slice(lane);
}

fn sat_u16(v: usize) -> u16 {
    u16::try_from(v).unwrap_or(u16::MAX)
}

fn fit_i32(v: usize) -> Result<i32, DecodeError> {
    fit(v)
}

fn fit<T: TryFrom<U>, U>(v: U) -> Result<T, DecodeError> {
    T::try_from(v).map_err(|_| DecodeError::Kv3("value exceeds its KV3 wire field"))
}

/// Write native compressed v5 while preserving the existing codec's wire metadata.
pub fn encode_preserving_v5(
    value: &Value,
    encoding: &super::Encoding,
    format: &Format,
) -> Result<Vec<u8>, DecodeError> {
    fn from_encoding(v: &Value, e: Option<&super::Encoding>) -> Node {
        let Some(e) = e else { return shape(v, None) };
        let flag = (e.flag() != 0).then_some(e.flag());
        match v {
            Value::Object(members) => Node {
                tag: node::OBJECT,
                flag,
                val: Val::Object(
                    members
                        .iter()
                        .map(|(k, v)| (k.clone(), from_encoding(v, e.get(k))))
                        .collect(),
                ),
            },
            Value::Array(values) => {
                let children = e.as_array().unwrap_or(&[]);
                let nodes = values
                    .iter()
                    .enumerate()
                    .map(|(i, v)| from_encoding(v, children.get(i)))
                    .collect::<Vec<_>>();
                if matches!(
                    e.datatype,
                    node::ARRAY_TYPED
                        | node::ARRAY_TYPE_BYTE_LENGTH
                        | node::ARRAY_TYPE_AUXILIARY_BUFFER
                ) && !nodes.is_empty()
                {
                    let sub = nodes[0].tag;
                    let sub_flag = nodes[0].flag;
                    if nodes.iter().all(|n| n.tag == sub && n.flag == sub_flag) {
                        return Node {
                            tag: e.datatype,
                            flag,
                            val: Val::Typed {
                                sub,
                                sub_flag,
                                items: nodes.into_iter().map(|n| n.val).collect(),
                            },
                        };
                    }
                }
                Node {
                    tag: node::ARRAY,
                    flag,
                    val: Val::Array(nodes),
                }
            }
            _ => {
                let (tag, val) = scalar_node(v, e.datatype).unwrap_or_else(|| shape_default(v));
                Node { tag, flag, val }
            }
        }
    }
    encode_v5(&Document {
        format: *format,
        strings: Vec::new(),
        root: from_encoding(value, Some(encoding)),
    })
}
