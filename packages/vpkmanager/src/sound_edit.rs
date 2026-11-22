use crate::audio::{is_mp3, mp3_params};
use crate::error::{Result, VpkManagerError};
use crate::source2::sound::{encode_vsnd_c, encode_vsnd_pcm16_c, vsnd_looped};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundInput {
    Mp3,
    Wav,
    CompiledVsnd,
}

pub fn classify_sound_input(extension: &str) -> Option<SoundInput> {
    match extension.to_ascii_lowercase().as_str() {
        "mp3" => Some(SoundInput::Mp3),
        "wav" => Some(SoundInput::Wav),
        "vsnd_c" => Some(SoundInput::CompiledVsnd),
        _ => None,
    }
}

pub fn swap_sound(donor: &[u8], replacement: &[u8], input: SoundInput) -> Result<Vec<u8>> {
    match input {
        SoundInput::CompiledVsnd => Ok(replacement.to_vec()),
        SoundInput::Wav => Ok(encode_vsnd_pcm16_c(donor, replacement)?),
        SoundInput::Mp3 => {
            if !is_mp3(replacement) {
                return Err(VpkManagerError::Audio(
                    "that file is not MP3 audio".to_string(),
                ));
            }
            let looped = vsnd_looped(donor).unwrap_or(false);
            let params = mp3_params(replacement, looped)?;
            Ok(encode_vsnd_c(donor, replacement, &params)?)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inputs_are_classified_by_extension() {
        assert_eq!(classify_sound_input("MP3"), Some(SoundInput::Mp3));
        assert_eq!(classify_sound_input("wav"), Some(SoundInput::Wav));
        assert_eq!(
            classify_sound_input("vsnd_c"),
            Some(SoundInput::CompiledVsnd)
        );
        assert_eq!(classify_sound_input("ogg"), None);
    }

    #[test]
    fn a_compiled_sound_is_passed_through_untouched() {
        let compiled = b"already compiled bytes".to_vec();
        let swapped = swap_sound(b"donor", &compiled, SoundInput::CompiledVsnd).unwrap();
        assert_eq!(swapped, compiled);
    }

    #[test]
    fn non_audio_is_refused_before_touching_the_donor() {
        let error = swap_sound(b"donor", b"not audio", SoundInput::Mp3).unwrap_err();
        assert!(matches!(error, VpkManagerError::Audio(_)));
    }
}
