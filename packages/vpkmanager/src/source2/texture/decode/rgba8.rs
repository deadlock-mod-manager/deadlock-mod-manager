use crate::source2::error::DecodeError;
use crate::source2::texture::{Image, ImageData, TextureInfo};

/// RGBA8888: 4 bytes/pixel, row-major, top-left origin. Pass-through.
pub fn decode_rgba(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    let needed = required(info);
    if pixels.len() < needed {
        return Err(DecodeError::Truncated {
            offset: 0,
            needed,
            had: pixels.len(),
        });
    }
    let buf = pixels[..needed].to_vec();
    Ok(image_from(info, buf))
}

/// BGRA8888: 4 bytes/pixel, swap B and R per pixel.
pub fn decode_bgra(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    let needed = required(info);
    if pixels.len() < needed {
        return Err(DecodeError::Truncated {
            offset: 0,
            needed,
            had: pixels.len(),
        });
    }
    let mut buf = pixels[..needed].to_vec();
    for px in buf.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    Ok(image_from(info, buf))
}

fn required(info: &TextureInfo) -> usize {
    let w = info.width as usize;
    let h = info.height as usize;
    w * h * 4
}

fn image_from(info: &TextureInfo, buf: Vec<u8>) -> Image {
    Image {
        width: u32::from(info.width),
        height: u32::from(info.height),
        data: ImageData::Rgba8(buf),
    }
}
