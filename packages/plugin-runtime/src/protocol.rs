//! Supervisor <-> worker framing over the worker's stdin/stdout.
//!
//! The worker writes [`MAGIC`] first. Every frame after that is a
//! little-endian `u32` length followed by that many bytes. The first frame
//! the supervisor sends is the raw backend module; all later frames are JSON
//! [`ToWorker`] / [`FromWorker`] messages.

use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

pub const MAGIC: &[u8] = b"\0DMM-PLUGIN-WORKER/1\n";
/// Largest JSON frame: a 6 MiB hostcall escaped inside a JSON string. Larger
/// hostcalls are answered with `request_too_large` / `response_too_large`
/// instead of being framed.
pub const MAX_MESSAGE_FRAME_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_LOAD_FRAME_BYTES: usize = super::abi::MAX_BACKEND_BYTES;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ToWorker {
  Call { id: u64, input: String },
  HostResult { id: u64, output: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FromWorker {
  Loaded,
  LoadFailed {
    message: String,
  },
  HostCall {
    id: u64,
    request: String,
  },
  Result {
    id: u64,
    output: String,
  },
  Failed {
    id: u64,
    code: String,
    message: String,
  },
}

pub fn write_frame(writer: &mut impl Write, bytes: &[u8]) -> io::Result<()> {
  let len = u32::try_from(bytes.len()).map_err(|_| io::Error::other("frame too large"))?;
  writer.write_all(&len.to_le_bytes())?;
  writer.write_all(bytes)?;
  writer.flush()
}

/// Serializes a message, or `None` when it would exceed the frame limit.
pub fn encode_message<T: Serialize>(message: &T) -> io::Result<Option<Vec<u8>>> {
  let bytes = serde_json::to_vec(message).map_err(io::Error::other)?;
  Ok((bytes.len() <= MAX_MESSAGE_FRAME_BYTES).then_some(bytes))
}

pub fn write_message<T: Serialize>(writer: &mut impl Write, message: &T) -> io::Result<()> {
  let bytes =
    encode_message(message)?.ok_or_else(|| io::Error::other("message frame too large"))?;
  write_frame(writer, &bytes)
}

/// Reads one frame; `Ok(None)` is a clean end of stream between frames.
pub fn read_frame(reader: &mut impl Read, max: usize) -> io::Result<Option<Vec<u8>>> {
  let mut len = [0u8; 4];
  let mut filled = 0;
  while filled < len.len() {
    match reader.read(&mut len[filled..])? {
      0 if filled == 0 => return Ok(None),
      0 => return Err(io::ErrorKind::UnexpectedEof.into()),
      n => filled += n,
    }
  }
  let len = u32::from_le_bytes(len) as usize;
  if len > max {
    return Err(io::Error::other(format!(
      "frame of {len} bytes exceeds {max}"
    )));
  }
  let mut bytes = vec![0; len];
  reader.read_exact(&mut bytes)?;
  Ok(Some(bytes))
}

pub fn read_message<T: for<'de> Deserialize<'de>>(reader: &mut impl Read) -> io::Result<Option<T>> {
  read_frame(reader, MAX_MESSAGE_FRAME_BYTES)?
    .map(|bytes| serde_json::from_slice(&bytes).map_err(io::Error::other))
    .transpose()
}

/// Skips anything before the worker's magic. Only the test harness prints
/// before it; production workers write the magic first. Bounded so a worker
/// that never sends it cannot make the supervisor read forever.
pub fn expect_magic(reader: &mut impl Read) -> io::Result<()> {
  let mut window = Vec::with_capacity(MAGIC.len());
  let mut byte = [0u8; 1];
  for _ in 0..4096 + MAGIC.len() {
    if reader.read(&mut byte)? == 0 {
      return Err(io::ErrorKind::UnexpectedEof.into());
    }
    window.push(byte[0]);
    if window.len() > MAGIC.len() {
      window.remove(0);
    }
    if window == MAGIC {
      return Ok(());
    }
  }
  Err(io::Error::other("worker did not identify itself"))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn round_trips_frames_and_rejects_oversized_ones() {
    let mut buffer = Vec::new();
    write_message(
      &mut buffer,
      &ToWorker::Call {
        id: 7,
        input: "{}".into(),
      },
    )
    .unwrap();
    let mut cursor = io::Cursor::new(buffer);
    let message: Option<ToWorker> = read_message(&mut cursor).unwrap();
    assert!(matches!(message, Some(ToWorker::Call { id: 7, .. })));
    assert!(read_frame(&mut cursor, 16).unwrap().is_none());

    let mut oversized = io::Cursor::new(1024u32.to_le_bytes().to_vec());
    assert!(read_frame(&mut oversized, 16).is_err());
    let mut truncated = io::Cursor::new(vec![8, 0, 0, 0, 1]);
    assert!(read_frame(&mut truncated, 16).is_err());
  }

  #[test]
  fn finds_magic_after_bounded_noise() {
    let mut stream = b"\nrunning 1 test\n".to_vec();
    stream.extend_from_slice(MAGIC);
    expect_magic(&mut io::Cursor::new(stream)).unwrap();
    assert!(expect_magic(&mut io::Cursor::new(vec![b'x'; 8192])).is_err());
  }
}
