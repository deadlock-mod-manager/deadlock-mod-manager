//! The colors a skin already wears, offered as swatches in the paint tab.
//!
//! Read from the color maps' RGB with alpha ignored: Source 2 color maps keep
//! masks in alpha, not opacity, and most of a coat can sit under alpha 0.
//!
//! Color maps hold albedo, which the game's lighting brightens: a white coat is
//! stored near 50% grey. The swatches are lifted by one shared exposure so they
//! read like the hero on screen. Painting only takes a swatch's hue, so the
//! lift changes how a swatch looks, not what it paints.

use std::collections::HashMap;

use source2_model::{Resource, VtexHeader};

/// The most swatches offered.
const PALETTE_SIZE: usize = 6;
/// Color maps are decoded at most this large; plenty to rank their colors.
const SAMPLE_SIDE: u32 = 128;
/// Texels darker than this (summed RGB) are crevices and empty UV space.
const DARK_SUM: u16 = 60;
/// Picks closer than this, as RGB distance, read as the same color.
const MIN_DISTANCE: f32 = 56.0;
/// The exposure lift brings the lightest swatch's brightest channel here...
const LIFT_TARGET: f32 = 230.0;
/// ...but never brightens by more than this, so a dark skin stays dark.
const MAX_LIFT: f32 = 2.0;

/// Decode a `.vtex_c` to small RGBA for sampling.
pub(crate) fn sample_color_map(bytes: Vec<u8>) -> Option<Vec<u8>> {
  let resource = Resource::parse(bytes).ok()?;
  let header = VtexHeader::parse(&resource).ok()?;
  Some(
    header
      .decode_preview(&resource.data, SAMPLE_SIDE)
      .ok()?
      .rgba,
  )
}

/// The skin's main colors, most common first. Each map weighs the same however
/// much of it is empty, so a small part's color isn't drowned by the body's.
pub(crate) fn skin_palette(maps: &[Vec<u8>]) -> Vec<[u8; 3]> {
  let mut buckets: HashMap<u16, (f32, [f32; 3])> = HashMap::new();
  for rgba in maps {
    let texels: Vec<[u8; 3]> = rgba
      .chunks_exact(4)
      .map(|texel| [texel[0], texel[1], texel[2]])
      .filter(|[r, g, b]| u16::from(*r) + u16::from(*g) + u16::from(*b) >= DARK_SUM)
      .collect();
    let weight = 1.0 / texels.len().max(1) as f32;
    for [r, g, b] in texels {
      let key = (u16::from(r >> 4) << 8) | (u16::from(g >> 4) << 4) | u16::from(b >> 4);
      let (count, sum) = buckets.entry(key).or_insert((0.0, [0.0; 3]));
      *count += weight;
      for (total, channel) in sum.iter_mut().zip([r, g, b]) {
        *total += f32::from(channel) * weight;
      }
    }
  }

  let mut ranked: Vec<(f32, [f32; 3])> = buckets.into_values().collect();
  ranked.sort_by(|a, b| b.0.total_cmp(&a.0));

  // A shaded fabric spreads over many buckets, so a flat color would outrank
  // it bucket for bucket. Each bucket joins the nearest color already found,
  // measured from that color's first bucket so a cluster can't drift along a
  // gradient and swallow its neighbours, and colors rank on combined weight.
  let mut clusters: Vec<Cluster> = Vec::new();
  for (count, sum) in ranked {
    let color = sum.map(|total| total / count);
    let nearest = clusters
      .iter_mut()
      .map(|cluster| (distance(cluster.seed, color), cluster))
      .filter(|(gap, _)| *gap < MIN_DISTANCE)
      .min_by(|a, b| a.0.total_cmp(&b.0));
    match nearest {
      Some((_, cluster)) => {
        cluster.weight += count;
        for (total, add) in cluster.sum.iter_mut().zip(sum) {
          *total += add;
        }
      }
      None => clusters.push(Cluster {
        seed: color,
        weight: count,
        sum,
      }),
    }
  }
  clusters.sort_by(|a, b| b.weight.total_cmp(&a.weight));
  let colors: Vec<[f32; 3]> = clusters
    .iter()
    .take(PALETTE_SIZE)
    .map(|cluster| cluster.sum.map(|total| total / cluster.weight))
    .collect();

  let brightest = colors
    .iter()
    .flatten()
    .fold(0f32, |max, channel| max.max(*channel));
  let lift = (LIFT_TARGET / brightest.max(1.0)).clamp(1.0, MAX_LIFT);
  colors
    .into_iter()
    .map(|color| color.map(|channel| (channel * lift).round().min(255.0) as u8))
    .collect()
}

struct Cluster {
  seed: [f32; 3],
  weight: f32,
  sum: [f32; 3],
}

fn distance(a: [f32; 3], b: [f32; 3]) -> f32 {
  a.iter()
    .zip(b)
    .map(|(x, y)| (x - y).powi(2))
    .sum::<f32>()
    .sqrt()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn map(texels: &[([u8; 4], usize)]) -> Vec<u8> {
    texels
      .iter()
      .flat_map(|(texel, count)| std::iter::repeat_n(*texel, *count).flatten())
      .collect()
  }

  #[test]
  fn colors_under_zero_alpha_still_count() {
    let coat = map(&[([200, 80, 50, 0], 90), ([240, 240, 235, 255], 10)]);
    assert_eq!(skin_palette(&[coat]), vec![[200, 80, 50], [240, 240, 235]]);
  }

  #[test]
  fn a_shaded_color_outranks_a_smaller_flat_one() {
    let mut texels: Vec<([u8; 4], usize)> = (0..8)
      .map(|step| ([170 + step * 4, 170 + step * 4, 170 + step * 4, 255], 6))
      .collect();
    texels.push(([120, 0, 10, 255], 30));
    let palette = skin_palette(&[map(&texels)]);
    assert_eq!(palette.len(), 2);
    let [r, g, b] = palette[0];
    assert!(
      r == g && g == b,
      "the shaded grey ranks first, got {:?}",
      palette
    );
    assert_eq!(palette[1][1], 0);
  }

  #[test]
  fn albedo_is_lifted_to_read_like_the_game_but_at_most_twice() {
    let cloth = map(&[([128, 128, 128, 255], 50), ([100, 0, 0, 255], 50)]);
    let mut palette = skin_palette(&[cloth]);
    palette.sort();
    assert_eq!(palette, vec![[180, 0, 0], [230, 230, 230]]);

    let dark = map(&[([40, 40, 40, 255], 10)]);
    assert_eq!(skin_palette(&[dark]), vec![[80, 80, 80]]);
  }

  #[test]
  fn a_small_part_is_not_drowned_by_a_big_one() {
    let body = map(&[([200, 80, 50, 255], 1000)]);
    let gem = map(&[([40, 90, 220, 255], 4)]);
    let mut palette = skin_palette(&[body, gem]);
    palette.sort();
    assert_eq!(palette, vec![[42, 94, 230], [209, 84, 52]]);
  }
}
