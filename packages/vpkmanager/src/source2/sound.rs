// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! Mint a Source 2 `.vsnd_c` from an MP3 payload by patching a donor container.
//!
//! A compiled sound resource is laid out as
//! `[header][RED2][empty DATA][CTRL][appended MP3]`. The `CTRL` block is a
//! `CVoiceContainerDefault` KV3 describing the clip (sample rate, channels,
//! sample count, duration, streamed-data size); the raw MP3 stream is appended
//! after the resource structure, starting at the byte offset the header records
//! as its file size.
//!
//! Valve's `resourcecompiler` produces these from a WAV. We don't have it on
//! Linux, but we don't need to *compress* anything: the audio is plain MP3, which
//! `ffmpeg`/`lame` emit. So to forge a new clip we reuse a stock clip as a donor,
//! keep its `RED2`, format GUID, and envelope byte-faithful, rewrite only the five
//! fields that depend on the new audio, and swap the appended MP3 stream. The same
//! "patch a container, don't recompile" approach the model recolor uses for
//! meshopt buffers.

use crate::source2::error::DecodeError;
use crate::source2::kv3::{self, Value};
use crate::source2::resource::Resource;

const BLOCK_CTRL: [u8; 4] = *b"CTRL";

#[derive(Debug, Clone)]
pub enum VsndAudio {
    Mp3(Vec<u8>),
    WavPcm16 {
        wav: Vec<u8>,
        rate: u32,
        channels: u16,
        sample_count: u32,
    },
}

/// The audio parameters of the replacement clip. `streaming_size` is taken from
/// the MP3 byte length, so it is not part of this struct.
#[derive(Debug, Clone, Copy)]
pub struct VsndParams {
    /// Sample rate in Hz (e.g. 44100).
    pub rate: u32,
    /// Channel count (1 = mono, 2 = stereo).
    pub channels: u32,
    /// Total PCM sample count (`duration_seconds * rate`, rounded).
    pub sample_count: u32,
    /// Clip duration in seconds.
    pub duration: f64,
    /// Whether the sound resource itself should loop.
    pub looped: bool,
}

/// Forge a `.vsnd_c` by reusing `donor` as a template and substituting `mp3` as
/// the streamed audio. `donor` must be an MP3 `CVoiceContainerDefault` clip (the
/// common Deadlock VO / ability-cast shape: a `CTRL` block plus an appended MP3).
///
/// The donor's `RED2` dependency info, KV3 format GUID, loop points, and envelope
/// curve are preserved; only `m_nRate`, `m_nChannels`, `m_nSampleCount`,
/// `m_flDuration`, and `m_nStreamingSize` are rewritten. Returns a complete,
/// loadable resource file.
///
/// # Errors
/// Fails if the donor does not parse as a resource, lacks a `CTRL` block, or that
/// block is not the expected `m_vSound` KV3 shape.
pub fn encode_vsnd_c(
    donor: &[u8],
    mp3: &[u8],
    params: &VsndParams,
) -> Result<Vec<u8>, DecodeError> {
    let resource = Resource::parse(donor)?;
    let ctrl_idx = resource
        .blocks()
        .iter()
        .position(|b| b.kind == BLOCK_CTRL)
        .ok_or(DecodeError::BadResource("vsnd_c has no CTRL block"))?;
    let ctrl_bytes = resource
        .find_block(BLOCK_CTRL)
        .ok_or(DecodeError::BadResource("vsnd_c CTRL block out of range"))?;

    let format = kv3::Format::from_payload(ctrl_bytes)?;
    let mut root = kv3::decode(ctrl_bytes)?;

    let sound = root
        .get_mut("m_vSound")
        .ok_or(DecodeError::BadResource("vsnd_c CTRL has no m_vSound"))?;
    set_value(sound, "m_nRate", Value::Int(i64::from(params.rate)));
    set_value(sound, "m_nChannels", Value::Int(i64::from(params.channels)));
    set_value(
        sound,
        "m_nSampleCount",
        Value::UInt(u64::from(params.sample_count)),
    );
    let streaming_size = u64::try_from(mp3.len()).unwrap_or(u64::MAX);
    set_value(sound, "m_nStreamingSize", Value::UInt(streaming_size));
    set_value(sound, "m_flDuration", Value::Double(params.duration));
    set_value(
        sound,
        "m_nLoopStart",
        Value::Int(if params.looped { 0 } else { -1 }),
    );
    set_value(sound, "m_nLoopEnd", Value::Int(0));

    // The envelope analyzer's spline is an amplitude-vs-time curve whose x axis is
    // in seconds, sized to the donor clip. It cannot carry over to a different
    // duration (a 0.8s donor envelope on a 20s clip would describe nothing past
    // the first second), so regenerate a flat full-length curve: constant
    // amplitude across [0, duration]. Harmless if the engine treats the curve as
    // analysis metadata, correct if it applies it to playback.
    regenerate_flat_envelope(&mut root, params.duration);

    let new_ctrl = kv3::encode(&root, &format);
    let mut out = resource.rebuild_with_block(ctrl_idx, &new_ctrl)?;
    out.extend_from_slice(mp3);
    Ok(out)
}

/// Forge a PCM16-backed `.vsnd_c` by reusing `donor` as a template and
/// substituting the PCM payload from a standard RIFF/WAVE file.
///
/// This is the PCM sibling of [`encode_vsnd_c`]. It is intended for clips whose
/// original compiled container already uses `m_nFormat = PCM16`; the donor's
/// dependency/envelope structure is preserved while rate/channels/sample count,
/// duration, format, and stream size are rewritten.
pub fn encode_vsnd_pcm16_c(donor: &[u8], wav: &[u8]) -> Result<Vec<u8>, DecodeError> {
    let pcm = parse_wav_pcm16(wav)?;
    let resource = Resource::parse(donor)?;
    let ctrl_idx = resource
        .blocks()
        .iter()
        .position(|b| b.kind == BLOCK_CTRL)
        .ok_or(DecodeError::BadResource("vsnd_c has no CTRL block"))?;
    let ctrl_bytes = resource
        .find_block(BLOCK_CTRL)
        .ok_or(DecodeError::BadResource("vsnd_c CTRL block out of range"))?;

    let format = kv3::Format::from_payload(ctrl_bytes)?;
    let mut root = kv3::decode(ctrl_bytes)?;
    let sound = root
        .get_mut("m_vSound")
        .ok_or(DecodeError::BadResource("vsnd_c CTRL has no m_vSound"))?;
    set_value(sound, "m_nFormat", Value::String("PCM16".to_owned()));
    set_value(sound, "m_nRate", Value::Int(i64::from(pcm.rate)));
    set_value(sound, "m_nChannels", Value::Int(i64::from(pcm.channels)));
    set_value(
        sound,
        "m_nSampleCount",
        Value::UInt(u64::from(pcm.sample_count)),
    );
    set_value(
        sound,
        "m_nStreamingSize",
        Value::UInt(u64::try_from(pcm.data.len()).unwrap_or(u64::MAX)),
    );
    set_value(sound, "m_flDuration", Value::Double(pcm.duration));
    regenerate_flat_envelope(&mut root, pcm.duration);

    let new_ctrl = kv3::encode(&root, &format);
    let mut out = resource.rebuild_with_block(ctrl_idx, &new_ctrl)?;
    out.extend_from_slice(&pcm.data);
    Ok(out)
}

/// Extract the appended MP3 stream from a `.vsnd_c` container, ready to hand to
/// an `<audio>` element (no decode needed). Deadlock VO / ability clips store
/// their audio as a plain MP3 appended after the resource structure, its length
/// recorded as `m_nStreamingSize` in the CTRL block, so the stream is the final
/// `m_nStreamingSize` bytes of the file (the exact inverse of [`encode_vsnd_c`]).
///
/// This is the audition backbone for the Foundry Sound tab: browse the voice-line
/// index, pull a clip's bytes, play them.
///
/// # Errors
/// Fails if the input does not parse as a resource, lacks a `CTRL` block / the
/// expected `m_vSound` shape, declares a zero or oversized streaming size, or the
/// appended stream is not MP3 (the only container shape Deadlock VO uses; a
/// different codec is reported rather than handed back as bogus `.mp3`).
pub fn extract_vsnd_mp3(data: &[u8]) -> Result<Vec<u8>, DecodeError> {
    match extract_vsnd_audio(data)? {
        VsndAudio::Mp3(mp3) => Ok(mp3),
        VsndAudio::WavPcm16 { .. } => Err(DecodeError::BadResource(
            "vsnd_c streamed audio is PCM16, not MP3",
        )),
    }
}

pub fn extract_vsnd_audio(data: &[u8]) -> Result<VsndAudio, DecodeError> {
    let resource = Resource::parse(data)?;
    let ctrl_bytes = resource
        .find_block(BLOCK_CTRL)
        .ok_or(DecodeError::BadResource("vsnd_c has no CTRL block"))?;
    let root = kv3::decode(ctrl_bytes)?;
    let sound = root
        .get("m_vSound")
        .ok_or(DecodeError::BadResource("vsnd_c CTRL has no m_vSound"))?;
    let streaming_size = usize::try_from(
        sound
            .get("m_nStreamingSize")
            .and_then(Value::as_uint)
            .ok_or(DecodeError::BadResource("vsnd_c m_nStreamingSize missing"))?,
    )
    .map_err(|_| DecodeError::BadResource("vsnd_c streaming size too large"))?;
    if streaming_size == 0 || streaming_size > data.len() {
        return Err(DecodeError::BadResource(
            "vsnd_c streaming size out of range",
        ));
    }
    let stream = &data[data.len() - streaming_size..];
    if looks_like_mp3(stream) {
        return Ok(VsndAudio::Mp3(stream.to_vec()));
    }

    let format = sound.get("m_nFormat").and_then(Value::as_str).unwrap_or("");
    if format.eq_ignore_ascii_case("PCM16") {
        let rate = u32::try_from(
            sound
                .get("m_nRate")
                .and_then(Value::as_uint)
                .ok_or(DecodeError::BadResource("vsnd_c PCM16 m_nRate missing"))?,
        )
        .map_err(|_| DecodeError::BadResource("vsnd_c PCM16 rate too large"))?;
        let channels = u16::try_from(
            sound
                .get("m_nChannels")
                .and_then(Value::as_uint)
                .ok_or(DecodeError::BadResource("vsnd_c PCM16 m_nChannels missing"))?,
        )
        .map_err(|_| DecodeError::BadResource("vsnd_c PCM16 channels too large"))?;
        let sample_count =
            u32::try_from(sound.get("m_nSampleCount").and_then(Value::as_uint).ok_or(
                DecodeError::BadResource("vsnd_c PCM16 m_nSampleCount missing"),
            )?)
            .map_err(|_| DecodeError::BadResource("vsnd_c PCM16 sample count too large"))?;
        if rate == 0 || channels == 0 {
            return Err(DecodeError::BadResource(
                "vsnd_c PCM16 invalid rate/channels",
            ));
        }

        let expected = usize::try_from(sample_count)
            .ok()
            .and_then(|samples| samples.checked_mul(usize::from(channels)))
            .and_then(|sample_channels| sample_channels.checked_mul(2))
            .ok_or(DecodeError::BadResource(
                "vsnd_c PCM16 expected byte count overflow",
            ))?;
        if expected != stream.len() {
            return Err(DecodeError::BadResource(
                "vsnd_c PCM16 stream size does not match sample metadata",
            ));
        }

        return Ok(VsndAudio::WavPcm16 {
            wav: wav_pcm16(stream, rate, channels)?,
            rate,
            channels,
            sample_count,
        });
    }

    Err(DecodeError::BadResource(
        "vsnd_c streamed audio is not MP3 or supported PCM16",
    ))
}

/// Whether a `.vsnd_c` clip is authored to loop, read from its `CTRL` block's
/// `m_vSound.m_nLoopStart`. Source 2's convention (the same one [`encode_vsnd_c`]
/// writes) is `-1` for a one-shot clip and `>= 0` for a looping one, so a caller
/// swapping a clip can preserve the original's loop behavior instead of guessing
/// (a `..._loop` / music clip stays looping; a VO line stays one-shot).
///
/// # Errors
/// Fails if the input does not parse as a resource, lacks a `CTRL` block, or that
/// block is not the expected `m_vSound` shape. A missing `m_nLoopStart` is treated
/// as one-shot (`false`) rather than an error.
pub fn vsnd_looped(data: &[u8]) -> Result<bool, DecodeError> {
    let resource = Resource::parse(data)?;
    let ctrl_bytes = resource
        .find_block(BLOCK_CTRL)
        .ok_or(DecodeError::BadResource("vsnd_c has no CTRL block"))?;
    let root = kv3::decode(ctrl_bytes)?;
    let sound = root
        .get("m_vSound")
        .ok_or(DecodeError::BadResource("vsnd_c CTRL has no m_vSound"))?;
    let loop_start = sound.get("m_nLoopStart").and_then(Value::as_int);
    Ok(matches!(loop_start, Some(s) if s >= 0))
}

/// Whether `data` starts like an MP3 stream. This accepts an optional `ID3v2` tag,
/// then requires a structurally valid MPEG audio frame, confirmed either by a
/// second valid frame back-to-back or, for a genuinely short clip, by that lone
/// frame accounting for the rest of the stream (bar an optional `ID3v1` tag). A
/// loose sync-word check is too weak here: raw little-endian PCM commonly starts
/// with bytes such as `FF FF 00 00`, which has the sync bits but is not MP3 (its
/// bitrate nibble is invalid, so the first frame already fails to parse).
fn looks_like_mp3(data: &[u8]) -> bool {
    let Some(first) = first_mpeg_frame_offset(data) else {
        return false;
    };
    let Some(first_len) = mpeg_frame_len(data, first) else {
        return false;
    };
    let second = first.saturating_add(first_len);
    // Strong signal: a second structurally valid frame immediately follows.
    if second < data.len() && mpeg_frame_len(data, second).is_some() {
        return true;
    }
    // A single complete frame is still MP3 when it is the whole payload (a short,
    // one-frame clip), allowing only a trailing ID3v1 tag. Random data is already
    // rejected above, since its first frame fails to parse.
    let rest = &data[second..];
    rest.is_empty() || rest.starts_with(b"TAG")
}

fn first_mpeg_frame_offset(data: &[u8]) -> Option<usize> {
    if data.len() >= 10 && &data[..3] == b"ID3" {
        let tag_size = id3v2_tag_size(data)?;
        if tag_size <= data.len() {
            return Some(tag_size);
        }
    }
    Some(0)
}

fn id3v2_tag_size(data: &[u8]) -> Option<usize> {
    if data.len() < 10 {
        return None;
    }
    if data[6..10].iter().any(|b| (b & 0x80) != 0) {
        return None;
    }
    let body_size = (usize::from(data[6]) << 21)
        | (usize::from(data[7]) << 14)
        | (usize::from(data[8]) << 7)
        | usize::from(data[9]);
    let footer_size = if (data[5] & 0x10) != 0 { 10 } else { 0 };
    10usize.checked_add(body_size)?.checked_add(footer_size)
}

fn mpeg_frame_len(data: &[u8], offset: usize) -> Option<usize> {
    let header = data.get(offset..offset + 4)?;
    let header = u32::from_be_bytes(header.try_into().ok()?);
    if (header >> 21) != 0x7ff {
        return None;
    }

    let version = ((header >> 19) & 0b11) as u8;
    let layer = ((header >> 17) & 0b11) as u8;
    let bitrate_index = ((header >> 12) & 0b1111) as usize;
    let sample_rate_index = ((header >> 10) & 0b11) as usize;
    let padding = ((header >> 9) & 1) as usize;

    if version == 0b01
        || layer == 0
        || bitrate_index == 0
        || bitrate_index == 15
        || sample_rate_index == 3
    {
        return None;
    }

    let bitrate_kbps = bitrate_kbps(version, layer, bitrate_index)?;
    let sample_rate = sample_rate(version, sample_rate_index)?;
    let bitrate = bitrate_kbps.checked_mul(1000)?;
    let frame_len = if layer == 0b11 {
        // Layer I.
        ((12 * bitrate / sample_rate) + padding) * 4
    } else if layer == 0b01 && version != 0b11 {
        // MPEG-2/2.5 Layer III.
        (72 * bitrate / sample_rate) + padding
    } else {
        // MPEG-1 Layer II/III and MPEG-2 Layer II.
        (144 * bitrate / sample_rate) + padding
    };

    (frame_len >= 4 && offset.checked_add(frame_len)? <= data.len()).then_some(frame_len)
}

fn bitrate_kbps(version: u8, layer: u8, index: usize) -> Option<usize> {
    const MPEG1_LAYER1: [usize; 16] = [
        0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0,
    ];
    const MPEG1_LAYER2: [usize; 16] = [
        0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0,
    ];
    const MPEG1_LAYER3: [usize; 16] = [
        0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
    ];
    const MPEG2_LAYER1: [usize; 16] = [
        0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0,
    ];
    const MPEG2_LAYER23: [usize; 16] = [
        0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
    ];

    let table = match (version == 0b11, layer) {
        (true, 0b11) => &MPEG1_LAYER1,
        (true, 0b10) => &MPEG1_LAYER2,
        (true, 0b01) => &MPEG1_LAYER3,
        (false, 0b11) => &MPEG2_LAYER1,
        (false, 0b10 | 0b01) => &MPEG2_LAYER23,
        _ => return None,
    };
    table.get(index).copied().filter(|v| *v != 0)
}

fn sample_rate(version: u8, index: usize) -> Option<usize> {
    const MPEG1: [usize; 3] = [44_100, 48_000, 32_000];
    const MPEG2: [usize; 3] = [22_050, 24_000, 16_000];
    const MPEG25: [usize; 3] = [11_025, 12_000, 8_000];
    let table = match version {
        0b11 => &MPEG1,
        0b10 => &MPEG2,
        0b00 => &MPEG25,
        _ => return None,
    };
    table.get(index).copied()
}

fn wav_pcm16(pcm: &[u8], rate: u32, channels: u16) -> Result<Vec<u8>, DecodeError> {
    let data_len = u32::try_from(pcm.len())
        .map_err(|_| DecodeError::BadResource("PCM16 WAV data too large"))?;
    let byte_rate = rate
        .checked_mul(u32::from(channels))
        .and_then(|v| v.checked_mul(2))
        .ok_or(DecodeError::BadResource("PCM16 WAV byte rate overflow"))?;
    let block_align = channels
        .checked_mul(2)
        .ok_or(DecodeError::BadResource("PCM16 WAV block align overflow"))?;
    let riff_len = 36u32
        .checked_add(data_len)
        .ok_or(DecodeError::BadResource("PCM16 WAV RIFF size overflow"))?;

    let mut out = Vec::with_capacity(44 + pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_len.to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(pcm);
    Ok(out)
}

struct Pcm16Wav {
    data: Vec<u8>,
    rate: u32,
    channels: u16,
    sample_count: u32,
    duration: f64,
}

fn parse_wav_pcm16(wav: &[u8]) -> Result<Pcm16Wav, DecodeError> {
    if wav.len() < 12 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" {
        return Err(DecodeError::BadResource("WAV is not RIFF/WAVE"));
    }

    let mut cursor = 12usize;
    let mut fmt: Option<(u16, u32, u16, u16)> = None;
    let mut data: Option<&[u8]> = None;
    while cursor.checked_add(8).is_some_and(|end| end <= wav.len()) {
        let id = wav
            .get(cursor..cursor + 4)
            .ok_or(DecodeError::BadResource("WAV chunk id out of range"))?;
        let size = u32::from_le_bytes(
            wav.get(cursor + 4..cursor + 8)
                .ok_or(DecodeError::BadResource("WAV chunk size out of range"))?
                .try_into()
                .map_err(|_| DecodeError::BadResource("WAV chunk size malformed"))?,
        ) as usize;
        cursor += 8;
        let end = cursor
            .checked_add(size)
            .ok_or(DecodeError::BadResource("WAV chunk size overflow"))?;
        let chunk = wav
            .get(cursor..end)
            .ok_or(DecodeError::BadResource("WAV chunk extends past EOF"))?;
        match id {
            b"fmt " => {
                if chunk.len() < 16 {
                    return Err(DecodeError::BadResource("WAV fmt chunk too short"));
                }
                let audio_format = u16::from_le_bytes([chunk[0], chunk[1]]);
                let channels = u16::from_le_bytes([chunk[2], chunk[3]]);
                let rate = u32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]);
                let block_align = u16::from_le_bytes([chunk[12], chunk[13]]);
                let bits_per_sample = u16::from_le_bytes([chunk[14], chunk[15]]);
                fmt = Some((audio_format, rate, channels, block_align.max(1)));
                if audio_format != 1 || bits_per_sample != 16 {
                    return Err(DecodeError::BadResource("WAV is not PCM16"));
                }
            }
            b"data" => data = Some(chunk),
            _ => {}
        }
        cursor = end + (size & 1);
    }

    let (audio_format, rate, channels, block_align) =
        fmt.ok_or(DecodeError::BadResource("WAV missing fmt chunk"))?;
    if audio_format != 1 || rate == 0 || channels == 0 {
        return Err(DecodeError::BadResource("WAV has invalid PCM16 metadata"));
    }
    let data = data.ok_or(DecodeError::BadResource("WAV missing data chunk"))?;
    if data.len() % usize::from(block_align) != 0 {
        return Err(DecodeError::BadResource(
            "WAV data size is not aligned to PCM16 frames",
        ));
    }
    let sample_count = u32::try_from(data.len() / usize::from(block_align))
        .map_err(|_| DecodeError::BadResource("WAV sample count too large"))?;
    Ok(Pcm16Wav {
        data: data.to_vec(),
        rate,
        channels,
        sample_count,
        duration: f64::from(sample_count) / f64::from(rate),
    })
}

/// Overwrite `key` on an object if present, leaving its absence to surface later
/// as a shape error rather than silently inserting a field the engine ignores.
fn set_value(obj: &mut Value, key: &str, value: Value) {
    if let Some(slot) = obj.get_mut(key) {
        *slot = value;
    }
}

/// Replace the envelope analyzer curve with a flat two-point curve (`y = 1` at
/// `x = 0` and `x = duration`). No-op if the analyzer/curve is absent.
fn regenerate_flat_envelope(root: &mut Value, duration: f64) {
    let Some(curve) = root
        .get_mut("m_pEnvelopeAnalyzer")
        .and_then(|a| a.get_mut("m_curve"))
    else {
        return;
    };
    let Some(spline) = curve.get_mut("m_spline") else {
        return;
    };
    *spline = Value::Array(vec![spline_point(0.0, 1.0), spline_point(duration, 1.0)]);
    if let Some(tangents) = curve.get_mut("m_tangents") {
        *tangents = Value::Array(vec![linear_tangent(), linear_tangent()]);
    }
    if let Some(domain_maxs) = curve.get_mut("m_vDomainMaxs") {
        *domain_maxs = Value::Array(vec![Value::Double(duration), Value::Double(1.0)]);
    }
}

/// One envelope spline knot: position `x` (seconds), amplitude `y`, flat slopes.
fn spline_point(x: f64, y: f64) -> Value {
    Value::Object(vec![
        ("x".to_owned(), Value::Double(x)),
        ("y".to_owned(), Value::Double(y)),
        ("m_flSlopeIncoming".to_owned(), Value::Double(0.0)),
        ("m_flSlopeOutgoing".to_owned(), Value::Double(0.0)),
    ])
}

fn linear_tangent() -> Value {
    Value::Object(vec![
        (
            "m_nIncomingTangent".to_owned(),
            Value::String("CURVE_TANGENT_LINEAR".to_owned()),
        ),
        (
            "m_nOutgoingTangent".to_owned(),
            Value::String("CURVE_TANGENT_LINEAR".to_owned()),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mp3_guard_rejects_pcm_like_sync_prefix() {
        let mut pcm = vec![0xFF, 0xFF, 0x00, 0x00];
        pcm.extend(std::iter::repeat_n(0, 1024));
        assert!(!looks_like_mp3(&pcm));
    }

    #[test]
    fn mp3_guard_accepts_two_valid_mpeg_frames() {
        let mut frame = vec![0xFF, 0xFB, 0x90, 0x64];
        frame.resize(417, 0);
        let mut mp3 = frame.clone();
        mp3.extend_from_slice(&frame);
        assert!(looks_like_mp3(&mp3));
    }

    #[test]
    fn mp3_guard_skips_id3v2_tag() {
        let mut frame = vec![0xFF, 0xFB, 0x90, 0x64];
        frame.resize(417, 0);
        let mut mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x05hello".to_vec();
        mp3.extend_from_slice(&frame);
        mp3.extend_from_slice(&frame);
        assert!(looks_like_mp3(&mp3));
    }

    #[test]
    fn mp3_guard_accepts_a_single_complete_frame() {
        // A genuinely short clip is one frame with nothing trailing.
        let mut frame = vec![0xFF, 0xFB, 0x90, 0x64];
        frame.resize(417, 0);
        assert!(looks_like_mp3(&frame));
    }

    #[test]
    fn mp3_guard_accepts_single_frame_with_id3v1_tag() {
        let mut data = vec![0xFF, 0xFB, 0x90, 0x64];
        data.resize(417, 0);
        let mut tag = b"TAG".to_vec();
        tag.resize(128, 0);
        data.extend_from_slice(&tag);
        assert!(looks_like_mp3(&data));
    }

    #[test]
    fn mp3_guard_rejects_a_lone_header_followed_by_garbage() {
        // One plausible frame header but trailing bytes that are neither a second
        // frame nor an ID3v1 tag: too weak to call MP3.
        let mut data = vec![0xFF, 0xFB, 0x90, 0x64];
        data.resize(417, 0);
        data.extend_from_slice(&[0x12, 0x34, 0x56, 0x78, 0x9a]);
        assert!(!looks_like_mp3(&data));
    }

    #[test]
    fn pcm16_wav_has_riff_header_and_payload() {
        let wav = wav_pcm16(&[0, 0, 1, 0], 22_050, 1).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(&wav[44..], &[0, 0, 1, 0]);
    }

    #[test]
    fn parses_pcm16_wav_payload() {
        let wav = wav_pcm16(&[0, 0, 1, 0], 22_050, 1).unwrap();
        let parsed = parse_wav_pcm16(&wav).unwrap();
        assert_eq!(parsed.data, [0, 0, 1, 0]);
        assert_eq!(parsed.rate, 22_050);
        assert_eq!(parsed.channels, 1);
        assert_eq!(parsed.sample_count, 2);
    }
}
