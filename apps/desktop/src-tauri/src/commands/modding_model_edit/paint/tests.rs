use super::*;

fn image(width: u32, height: u32) -> Image {
  Image {
    width,
    height,
    data: ImageData::Rgba8([80, 100, 120, 73].repeat((width * height) as usize)),
  }
}

#[test]
fn animated_paint_scales_to_the_export_cells_before_allocating_each_frame() {
  let count = 41;
  let original = image(2048, 1024);
  assert!(
    u64::from(original.width) * u64::from(original.height) * 4 * count as u64 > 128 * 1024 * 1024
  );
  let expected =
    modding_model_images::animation::layout(original.width, original.height, count).unwrap();
  let base = animation_base(original, count).unwrap();
  assert_eq!(
    (base.width, base.height),
    (expected.frame_width, expected.frame_height)
  );
  assert!(u64::from(base.width) * u64::from(base.height) * 4 * count as u64 <= 64 * 1024 * 1024);
  assert_eq!(pixel(&base, 0, 0), [80, 100, 120, 73]);
  assert!(animation_base(image(1, 1), 129).is_err());
}
fn document() -> ModdingModelPaint {
  ModdingModelPaint {
    layers: vec![ModdingPaintLayer {
      id: "paint".into(),
      name: "Paint".into(),
      visible: true,
      opacity: 1.,
      blend: ModdingPaintBlend::Normal,
      image: None,
      strokes: vec![ModdingPaintStroke {
        color: [255, 0, 0],
        radius: 0.2,
        hardness: 1.,
        opacity: 1.,
        erase: false,
        fill_tolerance: None,
        points: vec![[0.25, 0.5], [0.75, 0.5]],
      }],
    }],
  }
}
fn pixel(image: &Image, x: usize, y: usize) -> &[u8] {
  let ImageData::Rgba8(data) = &image.data else {
    panic!("RGBA required")
  };
  &data[(y * image.width as usize + x) * 4..][..4]
}
#[test]
fn strokes_interpolate_without_gaps_and_keep_base_alpha() {
  let mut base = image(32, 16);
  apply(&mut base, &document()).unwrap();
  assert_eq!(pixel(&base, 16, 8), [255, 0, 0, 73]);
  assert_eq!(pixel(&base, 0, 0), [80, 100, 120, 73]);
  for x in 8..24 {
    assert_eq!(pixel(&base, x, 8), [255, 0, 0, 73]);
  }
}
#[test]
fn eraser_removes_paint_without_erasing_the_base() {
  let mut document = document();
  let mut erase = document.layers[0].strokes[0].clone();
  erase.erase = true;
  document.layers[0].strokes.push(erase);
  let mut base = image(32, 16);
  apply(&mut base, &document).unwrap();
  assert_eq!(pixel(&base, 16, 8), [80, 100, 120, 73]);
}
#[test]
fn hidden_layers_and_zero_opacity_do_not_change_the_base() {
  let mut paint = document();
  paint.layers[0].visible = false;
  let mut base = image(32, 16);
  apply(&mut base, &paint).unwrap();
  assert_eq!(pixel(&base, 16, 8), [80, 100, 120, 73]);
  paint.layers[0].visible = true;
  paint.layers[0].opacity = 0.;
  apply(&mut base, &paint).unwrap();
  assert_eq!(pixel(&base, 16, 8), [80, 100, 120, 73]);
}
#[test]
fn linear_blending_and_layer_order_match_reference_modes() {
  assert_eq!(blend(0.2, 0.5, ModdingPaintBlend::Normal), 0.5);
  assert!((blend(0.2, 0.5, ModdingPaintBlend::Multiply) - 0.1).abs() < 0.0001);
  assert!((blend(0.2, 0.5, ModdingPaintBlend::Screen) - 0.6).abs() < 0.0001);
  assert!((blend(0.2, 0.5, ModdingPaintBlend::Overlay) - 0.2).abs() < 0.0001);
  let mut paint = document();
  let mut top = paint.layers[0].clone();
  top.id = "top".into();
  top.strokes[0].color = [0, 255, 0];
  paint.layers.push(top);
  let mut base = image(32, 16);
  apply(&mut base, &paint).unwrap();
  assert_eq!(pixel(&base, 16, 8), [0, 255, 0, 73]);
}
#[test]
fn invalid_documents_fail_before_modifying_the_image() {
  let mut paint = document();
  paint.layers[0].strokes[0].radius = f32::NAN;
  let mut base = image(32, 16);
  assert!(apply(&mut base, &paint).is_err());
  assert_eq!(pixel(&base, 16, 8), [80, 100, 120, 73]);
  paint.layers[0].strokes[0].radius = 0.002;
  paint.layers[0].strokes[0].points = [[0., 0.], [1., 1.]].repeat(2049);
  assert!(validate(&paint).is_err());
}

#[test]
fn paint_recipe_roundtrip_keeps_models_and_restores_original_materials() {
  let (_dir, addon) = super::super::tests::setup();
  let game = Path::new(&addon.game_path);
  let model = std::fs::read(game.join("models/test.vmdl_c")).unwrap();
  let material = std::fs::read(game.join("materials/body.vmat_c")).unwrap();
  let original_texture = std::fs::read(game.join("materials/color.vtex_c")).unwrap();
  let mut edit = default_edit("materials/body.vmat".into());
  edit.paint = Some(document());
  let mut saved = storage::load(&addon).unwrap();
  saved.models.insert(
    "models/test.vmdl_c".into(),
    vec![edit, default_edit("materials/head.vmat".into())],
  );
  bake::apply(&addon, saved, false, None).unwrap();
  let saved = storage::load(&addon).unwrap();
  assert_eq!(
    saved.models["models/test.vmdl_c"][0]
      .paint
      .as_ref()
      .unwrap()
      .layers
      .len(),
    1
  );
  let variant = saved
    .resources
    .keys()
    .find(|p| p.starts_with("materials/dmm_model_edits/"))
    .unwrap();
  let bytes = std::fs::read(game.join(variant)).unwrap();
  let painted = vpkmanager::source2::decode(&bytes).unwrap();
  assert_eq!((painted.width, painted.height), (256, 256));
  assert_eq!(pixel(&painted, 128, 128), [255, 0, 0, 99]);
  assert_eq!(
    std::fs::read(game.join("models/test.vmdl_c")).unwrap(),
    model
  );
  assert_eq!(
    std::fs::read(game.join("materials/color.vtex_c")).unwrap(),
    original_texture
  );
  reapply_after_compile(&addon).unwrap();
  assert_eq!(std::fs::read(game.join(variant)).unwrap(), bytes);
  let mut reset = storage::load(&addon).unwrap();
  reset.models.clear();
  bake::apply(&addon, reset, false, None).unwrap();
  assert_eq!(
    std::fs::read(game.join("materials/body.vmat_c")).unwrap(),
    material
  );
  assert!(!game.join(variant).exists());
}

#[test]
fn bucket_fill_respects_connected_color_regions_and_preserves_alpha() {
  let mut base = image(5, 2);
  let ImageData::Rgba8(data) = &mut base.data else {
    unreachable!()
  };
  for y in 0..2 {
    data[(y * 5 + 2) * 4..][..4].copy_from_slice(&[0, 0, 0, 73]);
  }
  let mut paint = document();
  paint.layers[0].strokes[0].fill_tolerance = Some(0.);
  paint.layers[0].strokes[0].points = vec![[0., 0.]];
  apply(&mut base, &paint).unwrap();
  assert_eq!(pixel(&base, 0, 1), [255, 0, 0, 73]);
  assert_eq!(pixel(&base, 2, 1), [0, 0, 0, 73]);
  assert_eq!(pixel(&base, 4, 1), [80, 100, 120, 73]);
}
#[test]
fn bucket_fill_uses_tolerance_and_clamps_the_edge_seed() {
  let mut base = image(2, 1);
  let ImageData::Rgba8(data) = &mut base.data else {
    unreachable!()
  };
  data[..4].copy_from_slice(&[90, 100, 120, 73]);
  let mut paint = document();
  paint.layers[0].strokes[0].fill_tolerance = Some(0.05);
  paint.layers[0].strokes[0].points = vec![[1., 1.]];
  apply(&mut base, &paint).unwrap();
  assert_eq!(pixel(&base, 0, 0), [255, 0, 0, 73]);
  assert_eq!(pixel(&base, 1, 0), [255, 0, 0, 73]);
  paint.layers[0].strokes[0].fill_tolerance = Some(f32::NAN);
  assert!(validate(&paint).is_err());
}
#[test]
fn bucket_fill_respects_a_previously_painted_barrier() {
  let mut paint = document();
  paint.layers[0].strokes[0].color = [0, 0, 0];
  paint.layers[0].strokes[0].radius = 0.07;
  paint.layers[0].strokes[0].points = vec![[0.5, 0.], [0.5, 1.]];
  let mut bucket = paint.layers[0].strokes[0].clone();
  bucket.color = [255, 0, 0];
  bucket.points = vec![[0., 0.]];
  bucket.fill_tolerance = Some(0.);
  paint.layers[0].strokes.push(bucket);
  let mut base = image(20, 20);
  apply(&mut base, &paint).unwrap();
  assert_eq!(pixel(&base, 1, 10), [255, 0, 0, 73]);
  assert_eq!(pixel(&base, 10, 10), [0, 0, 0, 73]);
  assert_eq!(pixel(&base, 19, 10), [80, 100, 120, 73]);
}

#[test]
fn managed_images_follow_timing_blending_and_preserve_source_alpha() {
  let root = tempfile::tempdir().unwrap();
  let source = root.path().join("overlay.gif");
  {
    let mut encoder = image::codecs::gif::GifEncoder::new(std::fs::File::create(&source).unwrap());
    encoder
      .set_repeat(image::codecs::gif::Repeat::Finite(1))
      .unwrap();
    for (color, delay) in [([255, 0, 0, 255], 30), ([0, 255, 0, 255], 90)] {
      encoder
        .encode_frame(image::Frame::from_parts(
          image::RgbaImage::from_pixel(2, 2, image::Rgba(color)),
          0,
          0,
          image::Delay::from_numer_denom_ms(delay, 1),
        ))
        .unwrap();
    }
  }
  let imported = modding_model_images::import(root.path(), &source).unwrap();
  let mut paint = document();
  paint.layers[0].strokes.clear();
  paint.layers[0].image = Some(imported.path);
  for (elapsed, color) in [
    (0, [255, 0, 0, 73]),
    (30, [0, 255, 0, 73]),
    (120, [255, 0, 0, 73]),
    (240, [0, 255, 0, 73]),
  ] {
    let mut base = image(16, 16);
    apply_at(&mut base, &paint, root.path(), elapsed).unwrap();
    assert_eq!(pixel(&base, 0, 0), color);
  }
  let mut second = paint.layers[0].clone();
  second.id = "second".into();
  second.image = paint.layers[0].image.clone();
  paint.layers.push(second);
  // The same animation may be reused by more than one layer without creating a second clock.
  assert!(sources(&paint, root.path()).is_ok());
}
#[test]
fn transparent_image_and_erasure_reveal_the_immutable_base() {
  let root = tempfile::tempdir().unwrap();
  let source = root.path().join("overlay.png");
  image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 0]))
    .save(&source)
    .unwrap();
  let imported = modding_model_images::import(root.path(), &source).unwrap();
  let mut paint = document();
  paint.layers[0].strokes.clear();
  paint.layers[0].image = Some(imported.path);
  let mut base = image(16, 16);
  apply_at(&mut base, &paint, root.path(), 0).unwrap();
  assert_eq!(pixel(&base, 8, 8), [80, 100, 120, 73]);
}
