//! The decoded `KeyValues3` value tree.
//!
//! Objects keep insertion order (a `Vec` of pairs, not a map) because Source 2
//! soundevents rely on key order for `base` template inheritance, and because a
//! faithful decode -> encode round-trip must not reshuffle keys. Lookups are a
//! linear scan, which is fine for the small trees these files hold.
//!
//! Numeric values are folded to three kinds (`Int`/`UInt`/`Double`). The binary
//! KV3 reader emits narrower tags (`INT32`, `FLOAT`, `INT16`, ...) but widening
//! to i64/u64/f64 is value-preserving, and the encoder re-emits the wide tags;
//! KV3 consumers coerce numbers by key, so the game reads them identically.

/// A decoded KV3 value tree.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Int(i64),
    UInt(u64),
    Double(f64),
    String(String),
    /// A binary blob (KV3 `BINARY_BLOB`). Not produced by soundevents, but
    /// modelled so the codec stays format-generic.
    Binary(Vec<u8>),
    Array(Vec<Value>),
    /// Insertion-ordered key/value pairs.
    Object(Vec<(String, Value)>),
}

impl Value {
    /// Look up a child by key. Returns the first match (KV3 objects do not
    /// normally repeat keys).
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Self::Object(pairs) => pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Mutable sibling of [`get`](Self::get), for in-place edits.
    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        match self {
            Self::Object(pairs) => pairs.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_int(&self) -> Option<i64> {
        match self {
            Self::Int(i) => Some(*i),
            Self::UInt(u) => i64::try_from(*u).ok(),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_uint(&self) -> Option<u64> {
        match self {
            Self::UInt(u) => Some(*u),
            Self::Int(i) => u64::try_from(*i).ok(),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(b) => Some(*b),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Double(d) => Some(*d),
            #[allow(clippy::cast_precision_loss)]
            Self::Int(i) => Some(*i as f64),
            #[allow(clippy::cast_precision_loss)]
            Self::UInt(u) => Some(*u as f64),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_array(&self) -> Option<&[Value]> {
        match self {
            Self::Array(a) => Some(a.as_slice()),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_object(&self) -> Option<&[(String, Value)]> {
        match self {
            Self::Object(o) => Some(o.as_slice()),
            _ => None,
        }
    }

    /// Visit every string in the tree (depth-first), letting `f` rewrite it in
    /// place. Used to swap `.vsnd` paths across a whole soundevents file
    /// without caring where in the tree they sit.
    pub fn for_each_string_mut(&mut self, f: &mut impl FnMut(&mut String)) {
        match self {
            Self::String(s) => f(s),
            Self::Array(items) => {
                for v in items {
                    v.for_each_string_mut(f);
                }
            }
            Self::Object(pairs) => {
                for (_, v) in pairs {
                    v.for_each_string_mut(f);
                }
            }
            _ => {}
        }
    }
}
