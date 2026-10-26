use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub enum KvValue {
    Null,
    Bool(bool),
    Int(i64),
    UInt(u64),
    Float(f64),
    String(String),
    Binary(Vec<u8>),
    Array(Vec<KvValue>),
    Object(BTreeMap<String, KvValue>),
}

impl KvValue {
    /// The value as JSON. Binary blobs, which particle and model data never
    /// need to read, become their byte count.
    pub fn to_json(&self) -> serde_json::Value {
        use serde_json::Value;
        match self {
            KvValue::Null => Value::Null,
            KvValue::Bool(value) => Value::Bool(*value),
            KvValue::Int(value) => Value::from(*value),
            KvValue::UInt(value) => Value::from(*value),
            KvValue::Float(value) => Value::from(*value),
            KvValue::String(value) => Value::String(value.clone()),
            KvValue::Binary(bytes) => Value::from(bytes.len()),
            KvValue::Array(values) => Value::Array(values.iter().map(KvValue::to_json).collect()),
            KvValue::Object(values) => Value::Object(
                values
                    .iter()
                    .map(|(key, value)| (key.clone(), value.to_json()))
                    .collect(),
            ),
        }
    }

    pub fn get(&self, key: &str) -> Option<&KvValue> {
        match self {
            KvValue::Object(values) => values.get(key),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[KvValue]> {
        match self {
            KvValue::Array(values) => Some(values),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            KvValue::Int(value) => Some(*value),
            KvValue::UInt(value) => i64::try_from(*value).ok(),
            _ => None,
        }
    }

    pub fn as_u32(&self) -> Option<u32> {
        self.as_i64().and_then(|value| u32::try_from(value).ok())
    }

    /// The value as a 64-bit bit set. Signed values keep their bit pattern, so
    /// a mask stored as `-1` reads as all bits set.
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            KvValue::Int(value) => Some(*value as u64),
            KvValue::UInt(value) => Some(*value),
            _ => None,
        }
    }

    pub fn as_f32(&self) -> Option<f32> {
        match self {
            KvValue::Float(value) => Some(*value as f32),
            KvValue::Int(value) => Some(*value as f32),
            KvValue::UInt(value) => Some(*value as f32),
            _ => None,
        }
    }

    /// The first `N` items of a numeric array.
    pub fn as_f32_array<const N: usize>(&self) -> Option<[f32; N]> {
        let items = self.as_array()?;
        let mut out = [0.0; N];
        for (slot, item) in out.iter_mut().zip(items) {
            *slot = item.as_f32()?;
        }
        (items.len() >= N).then_some(out)
    }

    pub fn as_string(&self) -> Option<&str> {
        match self {
            KvValue::String(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            KvValue::Bool(value) => Some(*value),
            KvValue::Int(value) => Some(*value != 0),
            KvValue::UInt(value) => Some(*value != 0),
            _ => None,
        }
    }
}
