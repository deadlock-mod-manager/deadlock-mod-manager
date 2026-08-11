//! MPEG audio header parsing, only as far as minting a `.vsnd_c` needs it.
//!
//! Substituting a user's MP3 into a compiled Source 2 sound means rewriting the
//! container's rate, channel count, sample count and duration to match the new
//! payload. None of that requires decoding audio — it all falls out of walking
//! the MPEG frame headers — so there is no decoder here.
//!
//! Frame layout adapted from the MIT-licensed vpkmerge (`vpkmerge-core/src/mp3.rs`).

use crate::error::{Result, VpkManagerError};
use crate::source2::sound::VsndParams;

// Sample-rate tables, indexed by the header's rate index, per MPEG version.
const RATES_V1: [u32; 3] = [44100, 48000, 32000];
const RATES_V2: [u32; 3] = [22050, 24000, 16000];
const RATES_V25: [u32; 3] = [11025, 12000, 8000];

// Bitrate (kbps) tables indexed by the header's bitrate index. The Layer III
// tables are the Deadlock case and are exact; Layer I/II reuse the V1-L1 / V2
// tables, which is close enough to size a frame.
const BR_V1_L3: [u32; 15] = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BR_V1_L1: [u32; 15] = [
    0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448,
];
const BR_V2_L3: [u32; 15] = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const BR_V2_L1: [u32; 15] = [
    0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256,
];

/// Byte length of a leading ID3v2 tag, or 0 when there isn't one.
fn skip_id3v2(data: &[u8]) -> usize {
    if data.len() < 10 || &data[0..3] != b"ID3" {
        return 0;
    }
    // Bytes 6..10 are a syncsafe size (7 bits per byte) of the tag body.
    let size = (u32::from(data[6]) << 21)
        | (u32::from(data[7]) << 14)
        | (u32::from(data[8]) << 7)
        | u32::from(data[9]);
    10 + size as usize
}

/// Offset of the first valid MPEG audio frame at or after `from`.
fn find_first_frame(data: &[u8], from: usize) -> Option<usize> {
    let mut index = from;
    while index + 4 <= data.len() {
        if data[index] == 0xFF && FrameHeader::parse(&data[index..]).is_some() {
            return Some(index);
        }
        index += 1;
    }
    None
}

struct FrameHeader {
    sample_rate: u32,
    channels: u32,
    samples_per_frame: u32,
    bitrate_bps: u32,
    padding: u32,
    /// 144 for MPEG1, 72 for MPEG2 / 2.5 Layer III, 12 for Layer I.
    coef: u32,
    layer1: bool,
}

impl FrameHeader {
    fn parse(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 4 {
            return None;
        }
        // Sync: 11 set bits.
        if bytes[0] != 0xFF || (bytes[1] & 0xE0) != 0xE0 {
            return None;
        }
        let version = (bytes[1] >> 3) & 0x03; // 00 = 2.5, 10 = 2, 11 = 1 (01 reserved)
        let layer = (bytes[1] >> 1) & 0x03; // 01 = III, 10 = II, 11 = I (00 reserved)
        if version == 0b01 || layer == 0b00 {
            return None;
        }
        let bitrate_idx = ((bytes[2] >> 4) & 0x0F) as usize;
        let rate_idx = ((bytes[2] >> 2) & 0x03) as usize;
        let padding = u32::from((bytes[2] >> 1) & 0x01);
        let chan_mode = (bytes[3] >> 6) & 0x03;
        if bitrate_idx == 0 || bitrate_idx == 0x0F || rate_idx == 0x03 {
            return None; // free-format / reserved
        }

        let is_v1 = version == 0b11;
        let layer3 = layer == 0b01;
        let layer1 = layer == 0b11;

        let sample_rate = match version {
            0b11 => RATES_V1[rate_idx],
            0b10 => RATES_V2[rate_idx],
            _ => RATES_V25[rate_idx],
        };

        let bitrate_kbps = match (is_v1, layer1) {
            (true, true) => BR_V1_L1[bitrate_idx],
            (true, false) => BR_V1_L3[bitrate_idx],
            (false, true) => BR_V2_L1[bitrate_idx],
            (false, false) => BR_V2_L3[bitrate_idx],
        };
        if bitrate_kbps == 0 {
            return None;
        }

        // Samples per frame plus the byte-length coefficient (samples / 8 for
        // Layers II and III).
        let (samples_per_frame, coef) = if layer1 {
            (384, 12)
        } else if layer3 && !is_v1 {
            (576, 72)
        } else {
            (1152, 144)
        };

        Some(FrameHeader {
            sample_rate,
            channels: if chan_mode == 0b11 { 1 } else { 2 },
            samples_per_frame,
            bitrate_bps: bitrate_kbps * 1000,
            padding,
            coef,
            layer1,
        })
    }

    /// Frame length in bytes (Layer I rounds in 4-byte slots; II/III in bytes).
    fn frame_len(&self) -> usize {
        let n = self.coef * self.bitrate_bps / self.sample_rate;
        let len = if self.layer1 {
            (n + self.padding) * 4
        } else {
            n + self.padding
        };
        len as usize
    }
}

/// Whether these bytes look like MPEG audio at all.
pub fn is_mp3(bytes: &[u8]) -> bool {
    find_first_frame(bytes, skip_id3v2(bytes)).is_some()
}

/// Read an MP3's rate, channel count and length by walking its frame headers.
///
/// `looped` is not derivable from the audio; the caller takes it from the clip
/// being replaced so a music loop stays looping and a one-shot stays one-shot.
pub fn mp3_params(mp3: &[u8], looped: bool) -> Result<VsndParams> {
    let start = skip_id3v2(mp3);
    let mut cursor = find_first_frame(mp3, start).ok_or_else(|| {
        VpkManagerError::Audio("not an MP3: no MPEG audio frame sync found".to_string())
    })?;

    // Rate and channel count are constant across a stream, so the first frame
    // carries both; the sample count needs every frame walked.
    let first = FrameHeader::parse(&mp3[cursor..])
        .ok_or_else(|| VpkManagerError::Audio("not an MP3: invalid first frame".to_string()))?;
    let rate = first.sample_rate;
    let channels = first.channels;

    let mut total_samples: u64 = 0;
    while let Some(frame) = mp3.get(cursor..).and_then(FrameHeader::parse) {
        total_samples += u64::from(frame.samples_per_frame);
        let len = frame.frame_len();
        if len == 0 {
            break;
        }
        cursor += len;
    }

    if total_samples == 0 {
        return Err(VpkManagerError::Audio(
            "not an MP3: no audio frames decoded".to_string(),
        ));
    }

    let sample_count = u32::try_from(total_samples).unwrap_or(u32::MAX);
    Ok(VsndParams {
        rate,
        channels,
        sample_count,
        duration: f64::from(sample_count) / f64::from(rate),
        looped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A CBR MPEG1 Layer III frame: 128 kbps, 44100 Hz, stereo, no CRC. Header
    /// `FF FB 90 00`, computed length 417 bytes.
    fn frame() -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xFB, 0x90, 0x00];
        bytes.resize(417, 0);
        bytes
    }

    fn stream(frames: usize) -> Vec<u8> {
        (0..frames).flat_map(|_| frame()).collect()
    }

    #[test]
    fn frame_headers_give_rate_channels_and_duration() {
        let params = mp3_params(&stream(43), false).unwrap();
        assert_eq!(params.rate, 44100);
        assert_eq!(params.channels, 2);
        assert_eq!(params.sample_count, 43 * 1152);
        assert!((params.duration - (43.0 * 1152.0 / 44100.0)).abs() < 1e-9);
        assert!(!params.looped);
    }

    #[test]
    fn an_id3v2_tag_is_skipped() {
        let mut bytes = vec![b'I', b'D', b'3', 4, 0, 0, 0, 0, 0, 10];
        bytes.extend(std::iter::repeat_n(0u8, 10));
        bytes.extend(stream(2));
        assert!(is_mp3(&bytes));
        assert_eq!(mp3_params(&bytes, true).unwrap().sample_count, 2 * 1152);
    }

    #[test]
    fn non_audio_is_rejected_rather_than_guessed() {
        assert!(!is_mp3(b"this is not audio at all"));
        assert!(mp3_params(b"this is not audio at all", false).is_err());
    }
}
