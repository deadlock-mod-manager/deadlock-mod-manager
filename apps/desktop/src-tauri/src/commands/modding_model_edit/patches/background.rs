use super::ModdingPatchBackground;

pub(super) fn apply(pixels: &mut image::RgbaImage, key: &ModdingPatchBackground) {
  let color: [u8; 3] = std::array::from_fn(|i| {
    u8::from_str_radix(&key.color[1 + i * 2..3 + i * 2], 16).expect("validated color")
  });
  let distance = |pixel: &[u8]| {
    (0..3)
      .map(|i| f64::from(pixel[i].abs_diff(color[i])) / 255.)
      .fold(0., f64::max)
  };
  let count = pixels.width() as usize * pixels.height() as usize;
  let width = pixels.width() as usize;
  let mut connected = vec![false; count];
  if key.edge_connected.unwrap_or(true) {
    let radius = (f64::from(pixels.width().min(pixels.height()))
      * key.gap_protection.unwrap_or(0.01))
    .round() as u32;
    let foreground: Vec<bool> = pixels
      .pixels()
      .map(|p| p[3] > 0 && distance(&p.0) > key.tolerance)
      .collect();
    let protected = close_silhouette(foreground, width, radius);
    let mut queue = Vec::new();
    let mut visit = |index: usize| {
      if !connected[index]
        && !protected[index]
        && distance(&pixels.as_raw()[index * 4..index * 4 + 4]) <= key.tolerance
      {
        connected[index] = true;
        queue.push(index);
      }
    };
    for x in 0..width {
      visit(x);
      visit(count - width + x);
    }
    for y in 0..pixels.height() as usize {
      visit(y * width);
      visit(y * width + width - 1);
    }
    let mut head = 0;
    while head < queue.len() {
      let index = queue[head];
      head += 1;
      for next in [
        if index % width > 0 {
          Some(index - 1)
        } else {
          None
        },
        if index % width + 1 < width {
          Some(index + 1)
        } else {
          None
        },
        index.checked_sub(width),
        if index + width < count {
          Some(index + width)
        } else {
          None
        },
      ]
      .into_iter()
      .flatten()
      {
        if !connected[next]
          && !protected[next]
          && distance(&pixels.as_raw()[next * 4..next * 4 + 4]) <= key.tolerance
        {
          connected[next] = true;
          queue.push(next);
        }
      }
    }
  } else {
    connected.fill(true);
  }
  let feather = key.softness.min(key.tolerance);
  for (index, pixel) in pixels.pixels_mut().enumerate() {
    if !connected[index] {
      continue;
    }
    let d = distance(&pixel.0);
    let alpha = if feather == 0. {
      f64::from(d > key.tolerance)
    } else {
      ((d - key.tolerance + feather) / feather).clamp(0., 1.)
    };
    pixel[3] = (f64::from(pixel[3]) * alpha).round() as u8;
  }
}

fn close_silhouette(mask: Vec<bool>, width: usize, radius: u32) -> Vec<bool> {
  if radius == 0 {
    return mask;
  }
  box_mask(
    box_mask(mask, width, radius as usize, true),
    width,
    radius as usize,
    false,
  )
}

fn box_mask(mut mask: Vec<bool>, width: usize, radius: usize, expand: bool) -> Vec<bool> {
  let height = mask.len() / width;
  let mut prefix = vec![0_u32; width.max(height) + 1];
  for vertical in [false, true] {
    let length = if vertical { height } else { width };
    let lines = if vertical { width } else { height };
    let mut output = vec![false; mask.len()];
    for line in 0..lines {
      let index = |i: usize| {
        if vertical {
          i * width + line
        } else {
          line * width + i
        }
      };
      for i in 0..length {
        prefix[i + 1] = prefix[i] + u32::from(mask[index(i)]);
      }
      for i in 0..length {
        let start = i.saturating_sub(radius);
        let end = length.min(i + radius + 1);
        let sum = prefix[end] - prefix[start];
        output[index(i)] = if expand {
          sum > 0
        } else {
          sum as usize == end - start
        };
      }
    }
    mask = output;
  }
  mask
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn removes_border_background_without_erasing_enclosed_black_details() {
    let mut pixels = image::RgbaImage::from_pixel(5, 5, image::Rgba([0, 0, 0, 255]));
    for y in 1..4 {
      for x in 1..4 {
        pixels.put_pixel(x, y, image::Rgba([255, 0, 0, 255]));
      }
    }
    pixels.put_pixel(2, 2, image::Rgba([0, 0, 0, 255]));
    let key = ModdingPatchBackground {
      color: "#000000".into(),
      tolerance: 0.02,
      softness: 0.02,
      edge_connected: None,
      gap_protection: None,
    };
    apply(&mut pixels, &key);
    assert_eq!(pixels.get_pixel(0, 0)[3], 0);
    assert_eq!(pixels.get_pixel(2, 2)[3], 255);
    assert_eq!(pixels.get_pixel(1, 1)[3], 255);
  }

  fn key() -> ModdingPatchBackground {
    ModdingPatchBackground {
      color: "#000000".into(),
      tolerance: 0.02,
      softness: 0.02,
      edge_connected: None,
      gap_protection: None,
    }
  }
  #[test]
  fn softness_cannot_bridge_through_dark_foreground() {
    let mut pixels = image::RgbaImage::from_pixel(5, 5, image::Rgba([0, 0, 0, 255]));
    for y in 1..4 {
      for x in 1..4 {
        pixels.put_pixel(x, y, image::Rgba([8, 0, 0, 255]));
      }
    }
    pixels.put_pixel(2, 2, image::Rgba([0, 0, 0, 255]));
    apply(&mut pixels, &key());
    assert_eq!(pixels.get_pixel(0, 0)[3], 0);
    assert_eq!(pixels.get_pixel(1, 1)[3], 255);
    assert_eq!(pixels.get_pixel(2, 2)[3], 255);
  }
  #[test]
  fn protection_seals_small_gaps_without_filling_surrounding_background() {
    let mut pixels = image::RgbaImage::from_pixel(100, 100, image::Rgba([0, 0, 0, 255]));
    for y in 30..=70 {
      for x in 30..=70 {
        if x == 30 || x == 70 || y == 30 || y == 70 {
          pixels.put_pixel(x, y, image::Rgba([255, 0, 0, 255]));
        }
      }
    }
    pixels.put_pixel(50, 30, image::Rgba([0, 0, 0, 255]));
    let mut strict = pixels.clone();
    let mut global = pixels.clone();
    apply(&mut pixels, &key());
    apply(
      &mut strict,
      &ModdingPatchBackground {
        gap_protection: Some(0.),
        ..key()
      },
    );
    apply(
      &mut global,
      &ModdingPatchBackground {
        edge_connected: Some(false),
        ..key()
      },
    );
    assert_eq!(pixels.get_pixel(50, 50)[3], 255);
    assert_eq!(pixels.get_pixel(0, 0)[3], 0);
    assert_eq!(strict.get_pixel(50, 50)[3], 0);
    assert_eq!(global.get_pixel(50, 50)[3], 0);
  }
  #[test]
  fn zero_tolerance_still_removes_exact_background() {
    let mut pixels = image::RgbaImage::from_pixel(3, 3, image::Rgba([0, 0, 0, 255]));
    pixels.put_pixel(1, 1, image::Rgba([1, 0, 0, 255]));
    apply(
      &mut pixels,
      &ModdingPatchBackground {
        tolerance: 0.,
        ..key()
      },
    );
    assert_eq!(pixels.get_pixel(0, 0)[3], 0);
    assert_eq!(pixels.get_pixel(1, 1)[3], 255);
  }
}
