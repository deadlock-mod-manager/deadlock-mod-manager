//! Checks a server's answer to a Range request before any of its bytes are
//! written, so a resume or a segment never lands at the wrong offset.

use reqwest::StatusCode;
use reqwest::header::{CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, HeaderMap};

/// The span a 206 says it carries. `end` is inclusive, as in the header.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ContentRange {
  pub start: u64,
  pub end: u64,
  pub total: u64,
}

impl ContentRange {
  pub fn byte_count(&self) -> u64 {
    self.end - self.start + 1
  }
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum RangeError {
  #[error("expected 206 Partial Content, got {0}")]
  NotPartial(StatusCode),
  #[error("missing Content-Range")]
  MissingContentRange,
  #[error("malformed Content-Range {0:?}")]
  Malformed(String),
  #[error("asked for bytes {requested_start}-{requested_end:?}, got {actual:?}")]
  WrongSpan {
    requested_start: u64,
    requested_end: Option<u64>,
    actual: ContentRange,
  },
  #[error("expected a {expected}-byte file, server says {actual}")]
  WrongTotal { expected: u64, actual: u64 },
  #[error("Content-Length {content_length} does not match a {range_length}-byte range")]
  WrongLength {
    content_length: u64,
    range_length: u64,
  },
  #[error("unexpected Content-Encoding {0:?}")]
  Encoded(String),
  #[error("multipart range responses are not supported")]
  Multipart,
}

/// Exactly one `bytes <start>-<end>/<total>` with a known total; anything
/// looser can't tell where the bytes belong.
pub fn parse_content_range(headers: &HeaderMap) -> Result<ContentRange, RangeError> {
  let mut values = headers.get_all(CONTENT_RANGE).iter();
  let value = values.next().ok_or(RangeError::MissingContentRange)?;
  let text = value
    .to_str()
    .map_err(|_| RangeError::Malformed(String::from_utf8_lossy(value.as_bytes()).into_owned()))?;
  let malformed = || RangeError::Malformed(text.to_string());
  if values.next().is_some() {
    return Err(malformed());
  }
  let (unit, spec) = text.trim().split_once(' ').ok_or_else(malformed)?;
  if !unit.eq_ignore_ascii_case("bytes") {
    return Err(malformed());
  }
  let (span, total) = spec.trim_start().split_once('/').ok_or_else(malformed)?;
  let (start, end) = span.split_once('-').ok_or_else(malformed)?;
  let number = |digits: &str| {
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
      return Err(malformed());
    }
    digits.parse::<u64>().map_err(|_| malformed())
  };
  let range = ContentRange {
    start: number(start)?,
    end: number(end)?,
    total: number(total)?,
  };
  if range.start > range.end || range.end >= range.total {
    return Err(malformed());
  }
  Ok(range)
}

/// Accepts only a 206 covering exactly the bytes asked for. `requested_end` is
/// inclusive; `None` is an open-ended `bytes=<start>-` request, which must run to
/// the end of the file.
pub fn validate_range_response(
  status: StatusCode,
  headers: &HeaderMap,
  requested_start: u64,
  requested_end: Option<u64>,
  expected_total: Option<u64>,
) -> Result<ContentRange, RangeError> {
  if status != StatusCode::PARTIAL_CONTENT {
    return Err(RangeError::NotPartial(status));
  }
  if headers
    .get(CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .is_some_and(|value| {
      value
        .trim_start()
        .to_ascii_lowercase()
        .starts_with("multipart/byteranges")
    })
  {
    return Err(RangeError::Multipart);
  }
  if let Some(encoding) = headers.get(CONTENT_ENCODING) {
    let encoding = String::from_utf8_lossy(encoding.as_bytes()).into_owned();
    if !encoding.trim().eq_ignore_ascii_case("identity") {
      return Err(RangeError::Encoded(encoding));
    }
  }
  let range = parse_content_range(headers)?;
  if let Some(expected) = expected_total
    && range.total != expected
  {
    return Err(RangeError::WrongTotal {
      expected,
      actual: range.total,
    });
  }
  let expected_end = requested_end.unwrap_or(range.total - 1);
  if range.start != requested_start || range.end != expected_end {
    return Err(RangeError::WrongSpan {
      requested_start,
      requested_end,
      actual: range,
    });
  }
  if let Some(content_length) = headers
    .get(CONTENT_LENGTH)
    .and_then(|value| value.to_str().ok())
    .and_then(|value| value.trim().parse::<u64>().ok())
    && content_length != range.byte_count()
  {
    return Err(RangeError::WrongLength {
      content_length,
      range_length: range.byte_count(),
    });
  }
  Ok(range)
}

#[cfg(test)]
mod tests {
  use super::*;
  use reqwest::header::HeaderValue;

  fn headers(pairs: &[(reqwest::header::HeaderName, &'static str)]) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in pairs {
      headers.append(name.clone(), HeaderValue::from_static(value));
    }
    headers
  }

  fn content_range(value: &'static str) -> HeaderMap {
    headers(&[(CONTENT_RANGE, value)])
  }

  #[test]
  fn reads_a_complete_content_range() {
    assert_eq!(
      parse_content_range(&content_range("bytes 0-1023/9360840")),
      Ok(ContentRange {
        start: 0,
        end: 1023,
        total: 9_360_840
      })
    );
    assert_eq!(
      parse_content_range(&content_range("Bytes 5-5/6")).map(|range| range.byte_count()),
      Ok(1)
    );
  }

  #[test]
  fn rejects_content_ranges_that_cannot_place_the_bytes() {
    for value in [
      "bytes 600000-1648575/*",
      "bytes */1648576",
      "bytes 10-5/100",
      "bytes 0-100/100",
      "bytes 0-99/0",
      "bytes -1-99/100",
      "bytes +0-99/100",
      "bytes 0 -99/100",
      "bytes 0-99/100 extra",
      "items 0-99/100",
      "bytes 0-99",
      "bytes 0-18446744073709551616/18446744073709551617",
      "",
    ] {
      assert!(
        parse_content_range(&content_range(value)).is_err(),
        "{value:?} was accepted, so its bytes could be written somewhere the server never meant"
      );
    }
    assert_eq!(
      parse_content_range(&HeaderMap::new()),
      Err(RangeError::MissingContentRange)
    );
    let duplicated = headers(&[
      (CONTENT_RANGE, "bytes 0-99/100"),
      (CONTENT_RANGE, "bytes 100-199/200"),
    ]);
    assert!(
      parse_content_range(&duplicated).is_err(),
      "two Content-Range headers disagree about where the body goes"
    );
  }

  #[test]
  fn a_resume_must_start_where_the_partial_file_ends() {
    let ok = validate_range_response(
      StatusCode::PARTIAL_CONTENT,
      &content_range("bytes 65536-99999/100000"),
      65_536,
      None,
      Some(100_000),
    );
    assert_eq!(ok.map(|range| range.byte_count()), Ok(34_464));

    let from_zero = validate_range_response(
      StatusCode::PARTIAL_CONTENT,
      &content_range("bytes 0-99999/100000"),
      65_536,
      None,
      Some(100_000),
    );
    assert!(
      matches!(from_zero, Err(RangeError::WrongSpan { .. })),
      "a server restarting from byte 0 would be appended after the partial file: {from_zero:?}"
    );

    let short = validate_range_response(
      StatusCode::PARTIAL_CONTENT,
      &content_range("bytes 65536-70000/100000"),
      65_536,
      None,
      Some(100_000),
    );
    assert!(
      matches!(short, Err(RangeError::WrongSpan { .. })),
      "an open-ended resume must run to the end of the file: {short:?}"
    );
  }

  #[test]
  fn a_segment_must_cover_exactly_the_bytes_asked_for() {
    let segment = |value: &'static str| {
      validate_range_response(
        StatusCode::PARTIAL_CONTENT,
        &content_range(value),
        25,
        Some(49),
        Some(100),
      )
    };
    assert!(segment("bytes 25-49/100").is_ok());
    assert!(matches!(
      segment("bytes 25-99/100"),
      Err(RangeError::WrongSpan { .. })
    ));
    assert!(matches!(
      segment("bytes 26-49/100"),
      Err(RangeError::WrongSpan { .. })
    ));
    assert_eq!(
      segment("bytes 25-49/101"),
      Err(RangeError::WrongTotal {
        expected: 100,
        actual: 101
      }),
      "a different total means a different file"
    );
  }

  #[test]
  fn a_full_response_is_never_a_range() {
    assert_eq!(
      validate_range_response(
        StatusCode::OK,
        &content_range("bytes 0-99/100"),
        0,
        Some(99),
        Some(100)
      ),
      Err(RangeError::NotPartial(StatusCode::OK)),
      "a 200 carries the whole file from byte 0, whatever the request asked for"
    );
  }

  #[test]
  fn rejects_bodies_that_are_not_the_raw_range() {
    let check = |extra: (reqwest::header::HeaderName, &'static str)| {
      validate_range_response(
        StatusCode::PARTIAL_CONTENT,
        &headers(&[(CONTENT_RANGE, "bytes 0-99/100"), extra]),
        0,
        Some(99),
        Some(100),
      )
    };
    assert_eq!(
      check((CONTENT_LENGTH, "99")),
      Err(RangeError::WrongLength {
        content_length: 99,
        range_length: 100
      })
    );
    assert!(check((CONTENT_LENGTH, "100")).is_ok());
    assert_eq!(
      check((CONTENT_ENCODING, "gzip")),
      Err(RangeError::Encoded("gzip".to_string())),
      "byte offsets of an encoded body don't match the file's"
    );
    assert!(check((CONTENT_ENCODING, "identity")).is_ok());
    assert_eq!(
      check((CONTENT_TYPE, "multipart/byteranges; boundary=x")),
      Err(RangeError::Multipart)
    );
  }
}
