use std::io::Cursor;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{CODEC_TYPE_NULL, DecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::error::{Result, VpkManagerError};
use crate::source2::sound::{VsndAudio, encode_vsnd_pcm16_c, extract_vsnd_audio};

const NORMALIZE_RMS_DBFS: f32 = -18.0;
const PEAK_CEILING_DBFS: f32 = -1.0;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SoundAdjust {
    pub gain_db: f32,
    pub normalize: bool,
    pub mute: bool,
}

impl SoundAdjust {
    pub fn is_identity(&self) -> bool {
        self.gain_db == 0.0 && !self.normalize && !self.mute
    }
}

pub enum SoundSource<'a> {
    File { bytes: &'a [u8], extension: &'a str },
    Original,
}

struct Pcm {
    rate: u32,
    channels: u16,
    samples: Vec<f32>,
}

pub fn is_decodable_audio(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "mp3" | "wav" | "ogg" | "flac"
    )
}

pub fn rebuild_sound(donor: &[u8], source: SoundSource, adjust: SoundAdjust) -> Result<Vec<u8>> {
    let mut pcm = match source {
        SoundSource::File { bytes, extension } => decode(bytes, Some(extension))?,
        SoundSource::Original => match extract_vsnd_audio(donor).map_err(audio_error)? {
            VsndAudio::Mp3(mp3) => decode(&mp3, Some("mp3"))?,
            VsndAudio::WavPcm16 { wav, .. } => decode(&wav, Some("wav"))?,
        },
    };
    apply(&mut pcm, adjust);
    encode_vsnd_pcm16_c(donor, &to_wav16(&pcm)).map_err(audio_error)
}

fn audio_error(error: impl std::fmt::Display) -> VpkManagerError {
    VpkManagerError::Audio(error.to_string())
}

fn decode(bytes: &[u8], extension: Option<&str>) -> Result<Pcm> {
    let stream = MediaSourceStream::new(Box::new(Cursor::new(bytes.to_vec())), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = extension {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| audio_error(format!("unrecognised audio: {e}")))?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| audio_error("the file has no audio track"))?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| audio_error(format!("unsupported audio codec: {e}")))?;

    let mut samples = Vec::new();
    let mut spec = None;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(e) => return Err(audio_error(e)),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(audio_error(e)),
        };
        let buffer_spec = *decoded.spec();
        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, buffer_spec);
        buffer.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buffer.samples());
        spec.get_or_insert(buffer_spec);
    }
    let spec = spec.ok_or_else(|| audio_error("the file holds no audio"))?;
    Ok(Pcm {
        rate: spec.rate,
        channels: u16::try_from(spec.channels.count()).unwrap_or(2),
        samples,
    })
}

fn db_to_gain(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

fn apply(pcm: &mut Pcm, adjust: SoundAdjust) {
    if adjust.mute {
        pcm.samples.fill(0.0);
        return;
    }
    let mut gain = db_to_gain(adjust.gain_db);
    if adjust.normalize {
        let energy: f64 = pcm
            .samples
            .iter()
            .map(|s| f64::from(*s) * f64::from(*s))
            .sum();
        let rms = (energy / pcm.samples.len().max(1) as f64).sqrt() as f32;
        let peak = pcm.samples.iter().fold(0f32, |peak, s| peak.max(s.abs()));
        if rms > 0.0 && peak > 0.0 {
            let to_target = db_to_gain(NORMALIZE_RMS_DBFS) / rms;
            let to_ceiling = db_to_gain(PEAK_CEILING_DBFS) / peak;
            gain *= to_target.min(to_ceiling);
        }
    }
    for sample in &mut pcm.samples {
        *sample = (*sample * gain).clamp(-1.0, 1.0);
    }
}

fn to_wav16(pcm: &Pcm) -> Vec<u8> {
    let data_len = (pcm.samples.len() * 2) as u32;
    let block_align = pcm.channels * 2;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&pcm.channels.to_le_bytes());
    wav.extend_from_slice(&pcm.rate.to_le_bytes());
    wav.extend_from_slice(&(pcm.rate * u32::from(block_align)).to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in &pcm.samples {
        wav.extend_from_slice(&((sample * f32::from(i16::MAX)) as i16).to_le_bytes());
    }
    wav
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(rate: u32, seconds: f32, amplitude: f32) -> Pcm {
        let count = (rate as f32 * seconds) as usize;
        Pcm {
            rate,
            channels: 1,
            samples: (0..count)
                .map(|i| amplitude * (i as f32 * 440.0 * std::f32::consts::TAU / rate as f32).sin())
                .collect(),
        }
    }

    #[test]
    fn wav_written_here_decodes_back_to_the_same_audio() {
        let pcm = tone(22_050, 0.25, 0.5);
        let decoded = decode(&to_wav16(&pcm), Some("wav")).unwrap();
        assert_eq!((decoded.rate, decoded.channels), (22_050, 1));
        assert_eq!(decoded.samples.len(), pcm.samples.len());
        assert!((decoded.samples[100] - pcm.samples[100]).abs() < 1e-3);
    }

    #[test]
    fn normalize_levels_quiet_audio_without_clipping() {
        let mut quiet = tone(22_050, 0.25, 0.01);
        apply(
            &mut quiet,
            SoundAdjust {
                normalize: true,
                ..Default::default()
            },
        );
        let peak = quiet.samples.iter().fold(0f32, |p, s| p.max(s.abs()));
        let rms =
            (quiet.samples.iter().map(|s| s * s).sum::<f32>() / quiet.samples.len() as f32).sqrt();
        assert!((20.0 * rms.log10() - NORMALIZE_RMS_DBFS).abs() < 0.5);
        assert!(peak <= db_to_gain(PEAK_CEILING_DBFS) + 1e-4);
    }

    #[test]
    fn mute_keeps_the_length_and_silences_it() {
        let mut pcm = tone(22_050, 0.25, 0.5);
        let length = pcm.samples.len();
        apply(
            &mut pcm,
            SoundAdjust {
                mute: true,
                gain_db: 6.0,
                ..Default::default()
            },
        );
        assert_eq!(pcm.samples.len(), length);
        assert!(pcm.samples.iter().all(|s| *s == 0.0));
    }
}
