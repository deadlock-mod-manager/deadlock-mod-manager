use crate::error::{Result, Source2Error};
use crate::resource::Resource;

/// Source 2 texture pixel formats (`VTexFormat`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum VtexFormat {
    Unknown = 0,
    Dxt1 = 1,
    Dxt5 = 2,
    I8 = 3,
    Rgba8888 = 4,
    R16 = 5,
    Rg1616 = 6,
    Rgba16161616 = 7,
    R16f = 8,
    Rg1616f = 9,
    Rgba16161616f = 10,
    R32f = 11,
    Rg3232f = 12,
    Rgb323232f = 13,
    Rgba32323232f = 14,
    JpegRgba8888 = 15,
    PngRgba8888 = 16,
    JpegDxt5 = 17,
    PngDxt5 = 18,
    Bc6h = 19,
    Bc7 = 20,
    Ati2n = 21, // BC5
    Ia88 = 22,
    Etc2 = 23,
    Etc2Eac = 24,
    R11Eac = 25,
    Rg11Eac = 26,
    Ati1n = 27, // BC4
    Bgra8888 = 28,
}

impl VtexFormat {
    fn from_u8(v: u8) -> VtexFormat {
        use VtexFormat::*;
        match v {
            1 => Dxt1,
            2 => Dxt5,
            3 => I8,
            4 => Rgba8888,
            5 => R16,
            6 => Rg1616,
            7 => Rgba16161616,
            8 => R16f,
            9 => Rg1616f,
            10 => Rgba16161616f,
            11 => R32f,
            12 => Rg3232f,
            13 => Rgb323232f,
            14 => Rgba32323232f,
            15 => JpegRgba8888,
            16 => PngRgba8888,
            17 => JpegDxt5,
            18 => PngDxt5,
            19 => Bc6h,
            20 => Bc7,
            21 => Ati2n,
            22 => Ia88,
            23 => Etc2,
            24 => Etc2Eac,
            25 => R11Eac,
            26 => Rg11Eac,
            27 => Ati1n,
            28 => Bgra8888,
            _ => Unknown,
        }
    }

    /// Bytes occupied by a single mip level of the given dimensions.
    fn mip_byte_size(self, width: u32, height: u32) -> Result<usize> {
        use VtexFormat::*;
        let blocks = |w: u32, h: u32| ((w as usize + 3) / 4) * ((h as usize + 3) / 4);
        let bytes = match self {
            Dxt1 | Ati1n => blocks(width, height) * 8,
            Dxt5 | Ati2n | Bc6h | Bc7 => blocks(width, height) * 16,
            Rgba8888 | Bgra8888 => (width * height * 4) as usize,
            Ia88 => (width * height * 2) as usize,
            I8 => (width * height) as usize,
            Rgba16161616 | Rgba16161616f => (width * height * 8) as usize,
            other => {
                return Err(Source2Error::UnsupportedFormat(format!("{other:?}")));
            }
        };
        Ok(bytes)
    }
}

#[derive(Debug, Clone)]
pub struct ExtraData {
    pub kind: u32,
    pub offset: usize,
    pub size: usize,
}

#[derive(Debug)]
pub struct VtexHeader {
    pub version: u16,
    pub flags: u16,
    pub width: u16,
    pub height: u16,
    pub depth: u16,
    pub format: VtexFormat,
    pub num_mip_levels: u8,
    pub extra: Vec<ExtraData>,
    /// Absolute offset (into the resource data buffer) where pixel data begins.
    pub data_offset: usize,
    /// Absolute offset of the DATA block start.
    pub block_offset: usize,
}

// VTexExtraData kinds: 1=FALLBACK_BITS, 2=SHEET, 3=FILL_TO_POWER_OF_TWO,
// 4=METADATA, 5=COMPRESSED_MIP_SIZE. Deadlock skin textures are typically stored
// uncompressed (no kind 5), in which case each mip is read at its raw size.
const EXTRA_COMPRESSED_MIP_SIZE: u32 = 5;

/// A fully decoded texture, RGBA8, top mip only.
pub struct DecodedTexture {
    pub width: u32,
    pub height: u32,
    /// RGBA8, row-major, `width * height * 4` bytes.
    pub rgba: Vec<u8>,
}

fn rd_u16(d: &[u8], p: usize) -> Result<u16> {
    d.get(p..p + 2)
        .map(|b| u16::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource("vtex u16 oob".into()))
}
fn rd_u32(d: &[u8], p: usize) -> Result<u32> {
    d.get(p..p + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource("vtex u32 oob".into()))
}

impl VtexHeader {
    /// Parse the DATA block of a `.vtex_c` resource.
    pub fn parse(res: &Resource) -> Result<VtexHeader> {
        let block = res
            .block("DATA")
            .ok_or_else(|| Source2Error::Resource("no DATA block".into()))?;
        let d = &res.data;
        let base = block.offset;

        let version = rd_u16(d, base)?;
        let flags = rd_u16(d, base + 2)?;
        // reflectivity: 4 x f32 at base+4 .. base+20
        let width = rd_u16(d, base + 20)?;
        let height = rd_u16(d, base + 22)?;
        let depth = rd_u16(d, base + 24)?;
        let format = VtexFormat::from_u8(d[base + 26]);
        let num_mip_levels = d[base + 27];
        // picmip0res u32 at base+28
        let extra_data_offset = rd_u32(d, base + 32)? as usize;
        let extra_data_count = rd_u32(d, base + 36)? as usize;
        // position now conceptually at base+40 (after both u32 fields)

        let mut extra = Vec::with_capacity(extra_data_count);
        // The extra-data table starts relative to the extra_data_offset field
        // (base+32): table_start = (base+32) + extra_data_offset.
        let table_start = base + 32 + extra_data_offset;
        let mut entry_pos = table_start;
        for _ in 0..extra_data_count {
            let kind = rd_u32(d, entry_pos)?;
            let off_field = entry_pos + 4;
            let rel = rd_u32(d, off_field)? as usize;
            let size = rd_u32(d, entry_pos + 8)? as usize;
            extra.push(ExtraData {
                kind,
                offset: off_field + rel,
                size,
            });
            entry_pos += 12;
        }

        // Pixel data begins after the fixed header (40 bytes) plus the extra-data
        // table and any inline extra-data payloads.
        let header_end = base + 40;
        let extra_end = extra
            .iter()
            .map(|e| e.offset + e.size)
            .max()
            .unwrap_or(header_end)
            .max(entry_pos);
        let data_offset = extra_end.max(header_end);

        Ok(VtexHeader {
            version,
            flags,
            width,
            height,
            depth,
            format,
            num_mip_levels,
            extra,
            data_offset,
            block_offset: base,
        })
    }

    /// Compressed mip sizes if the COMPRESSED_MIP_SIZE extra-data block is present.
    fn compressed_mip_sizes(&self, data: &[u8]) -> Option<Vec<usize>> {
        let e = self
            .extra
            .iter()
            .find(|e| e.kind == EXTRA_COMPRESSED_MIP_SIZE)?;
        // layout: u32 compressionMethod, u32 mipCount, then mipCount * u32 sizes
        let count = rd_u32(data, e.offset + 4).ok()? as usize;
        let mut sizes = Vec::with_capacity(count);
        for i in 0..count {
            sizes.push(rd_u32(data, e.offset + 8 + i * 4).ok()? as usize);
        }
        Some(sizes)
    }

    /// Extract and (if needed) LZ4-decompress one mip level.
    fn mip_bytes(&self, data: &[u8], target_level: u32) -> Result<Vec<u8>> {
        let mips = self.num_mip_levels.max(1) as u32;
        let target_level = target_level.min(mips - 1);
        let target_width = (self.width as u32 >> target_level).max(1);
        let target_height = (self.height as u32 >> target_level).max(1);
        let uncompressed_target = self.format.mip_byte_size(target_width, target_height)?;
        let compressed_sizes = self.compressed_mip_sizes(data);

        // Mips are stored smallest first. Compute the on-disk size of every mip,
        // then seek to the requested level.
        let mut on_disk: Vec<(usize /*uncompressed*/, usize /*stored*/)> =
            Vec::with_capacity(mips as usize);
        for level in 0..mips {
            let w = (self.width as u32 >> level).max(1);
            let h = (self.height as u32 >> level).max(1);
            let unc = self.format.mip_byte_size(w, h)?;
            let stored = compressed_sizes
                .as_ref()
                .and_then(|s| s.get(level as usize).copied())
                .unwrap_or(unc);
            on_disk.push((unc, stored));
        }

        // Stored order: level = mips-1 (smallest) .. 0 (largest).
        let mut cursor = self.data_offset;
        let mut target: Option<Vec<u8>> = None;
        for level in (0..mips).rev() {
            let (unc, stored) = on_disk[level as usize];
            let slice = data
                .get(cursor..cursor + stored)
                .ok_or_else(|| Source2Error::Resource("mip data oob".into()))?;
            if level == target_level {
                let bytes = if stored != unc {
                    lz4_flex::block::decompress(slice, unc)
                        .map_err(|e| Source2Error::Decode(format!("lz4: {e}")))?
                } else {
                    slice.to_vec()
                };
                target = Some(bytes);
                break;
            }
            cursor += stored;
        }

        let bytes = target.ok_or_else(|| Source2Error::Resource("no requested mip".into()))?;
        if bytes.len() < uncompressed_target {
            return Err(Source2Error::Decode(format!(
                "mip short: {} < {}",
                bytes.len(),
                uncompressed_target
            )));
        }
        Ok(bytes)
    }

    /// Decode the top mip to RGBA8.
    pub fn decode(&self, data: &[u8]) -> Result<DecodedTexture> {
        self.decode_mip(data, 0)
    }

    /// Decode a mip no larger than `max_side` to RGBA8.
    pub fn decode_preview(&self, data: &[u8], max_side: u32) -> Result<DecodedTexture> {
        let mut level = 0;
        let mut width = self.width as u32;
        let mut height = self.height as u32;
        while level + 1 < self.num_mip_levels as u32 && width.max(height) > max_side {
            level += 1;
            width = (width >> 1).max(1);
            height = (height >> 1).max(1);
        }
        self.decode_mip(data, level)
    }

    fn decode_mip(&self, data: &[u8], level: u32) -> Result<DecodedTexture> {
        use VtexFormat::*;
        let w = (self.width as u32 >> level).max(1) as usize;
        let h = (self.height as u32 >> level).max(1) as usize;
        let raw = self.mip_bytes(data, level)?;
        let mut out = vec![0u32; w * h];

        let ok = match self.format {
            Dxt1 => texture2ddecoder::decode_bc1(&raw, w, h, &mut out),
            Dxt5 => texture2ddecoder::decode_bc3(&raw, w, h, &mut out),
            Bc7 => texture2ddecoder::decode_bc7(&raw, w, h, &mut out),
            Ati1n => texture2ddecoder::decode_bc4(&raw, w, h, &mut out),
            Ati2n => texture2ddecoder::decode_bc5(&raw, w, h, &mut out),
            Bc6h => texture2ddecoder::decode_bc6_unsigned(&raw, w, h, &mut out),
            Rgba8888 => {
                return Ok(DecodedTexture {
                    width: w as u32,
                    height: h as u32,
                    rgba: raw[..w * h * 4].to_vec(),
                });
            }
            Bgra8888 => {
                let mut rgba = raw[..w * h * 4].to_vec();
                for px in rgba.chunks_exact_mut(4) {
                    px.swap(0, 2);
                }
                return Ok(DecodedTexture {
                    width: w as u32,
                    height: h as u32,
                    rgba,
                });
            }
            other => return Err(Source2Error::UnsupportedFormat(format!("{other:?}"))),
        };
        ok.map_err(|e| Source2Error::Decode(format!("{e:?}")))?;

        // texture2ddecoder emits ARGB packed as u32 (0xAARRGGBB). Convert to RGBA8.
        let mut rgba = vec![0u8; w * h * 4];
        for (i, &argb) in out.iter().enumerate() {
            let a = (argb >> 24) & 0xff;
            let r = (argb >> 16) & 0xff;
            let g = (argb >> 8) & 0xff;
            let b = argb & 0xff;
            rgba[i * 4] = r as u8;
            rgba[i * 4 + 1] = g as u8;
            rgba[i * 4 + 2] = b as u8;
            rgba[i * 4 + 3] = a as u8;
        }
        Ok(DecodedTexture {
            width: w as u32,
            height: h as u32,
            rgba,
        })
    }
}
