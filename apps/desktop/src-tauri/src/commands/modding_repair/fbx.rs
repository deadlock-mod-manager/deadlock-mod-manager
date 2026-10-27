use crate::errors::Error;

fn invalid() -> Error {
  Error::InvalidInput(
    "Unsupported or malformed FBX structure; texture references were not fully inspected".into(),
  )
}

fn integer(bytes: &[u8], position: usize, wide: bool) -> Result<usize, Error> {
  let width = if wide { 8 } else { 4 };
  let slice = bytes
    .get(position..position.checked_add(width).ok_or_else(invalid)?)
    .ok_or_else(invalid)?;
  let value = if wide {
    u64::from_le_bytes(slice.try_into().map_err(|_| invalid())?)
  } else {
    u32::from_le_bytes(slice.try_into().map_err(|_| invalid())?) as u64
  };
  usize::try_from(value).map_err(|_| invalid())
}

fn nodes(
  bytes: &[u8],
  mut position: usize,
  end: usize,
  wide: bool,
  depth: usize,
  result: &mut Vec<String>,
) -> Result<(), Error> {
  if depth > 64 {
    return Err(invalid());
  }
  let width = if wide { 8 } else { 4 };
  let header = width * 3 + 1;
  while position.checked_add(header).is_some_and(|next| next <= end) {
    let next = integer(bytes, position, wide)?;
    if next == 0 {
      break;
    }
    if next > end || next <= position + header {
      return Err(invalid());
    }
    let count = integer(bytes, position + width, wide)?;
    let length = integer(bytes, position + width * 2, wide)?;
    let name_length = bytes[position + width * 3] as usize;
    let name_start = position + header;
    let property_start = name_start.checked_add(name_length).ok_or_else(invalid)?;
    let property_end = property_start.checked_add(length).ok_or_else(invalid)?;
    if property_end > next || count > 1_000_000 {
      return Err(invalid());
    }
    let name = bytes.get(name_start..property_start).ok_or_else(invalid)?;
    if [b"FileName".as_slice(), b"Filename", b"RelativeFilename"].contains(&name) && count == 1 {
      if bytes.get(property_start) != Some(&b'S') {
        return Err(invalid());
      }
      let len = integer(bytes, property_start + 1, false)?;
      let start = property_start + 5;
      let end = start.checked_add(len).ok_or_else(invalid)?;
      if end > property_end {
        return Err(invalid());
      }
      result.push(
        std::str::from_utf8(&bytes[start..end])
          .map_err(|_| invalid())?
          .to_owned(),
      );
      if result.len() > 16_384 {
        return Err(invalid());
      }
    }
    if property_end < next {
      nodes(bytes, property_end, next, wide, depth + 1, result)?;
    }
    position = next;
  }
  Ok(())
}

pub(super) fn textures(bytes: &[u8]) -> Result<Vec<String>, Error> {
  let mut result = Vec::new();
  if bytes.starts_with(b"Kaydara FBX Binary  \0\x1a\0") {
    let version = integer(bytes, 23, false)?;
    nodes(bytes, 27, bytes.len(), version >= 7500, 0, &mut result)?;
  } else {
    let text = std::str::from_utf8(bytes).map_err(|_| invalid())?;
    for line in text.lines() {
      let Some((key, value)) = line.trim().split_once(':') else {
        continue;
      };
      if ["FileName", "Filename", "RelativeFilename"].contains(&key) {
        result.push(value.trim().trim_matches('"').to_owned());
      }
    }
  }
  result.retain(|value| super::scan::asset_reference(value));
  result.sort();
  result.dedup();
  Ok(result)
}
