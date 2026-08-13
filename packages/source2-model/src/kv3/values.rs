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
