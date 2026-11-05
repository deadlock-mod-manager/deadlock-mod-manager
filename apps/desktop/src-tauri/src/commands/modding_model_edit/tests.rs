use super::*;
use vpkmanager::source2::{
  self,
  kv3::{self, Value},
  resource::Resource,
};
fn object(fields: Vec<(&str, Value)>) -> Value {
  Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn resource(blocks: Vec<([u8; 4], Vec<u8>)>) -> Vec<u8> {
  let mut bytes = vec![0; 16 + blocks.len() * 12];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
  for (i, (kind, data)) in blocks.into_iter().enumerate() {
    let at = 16 + i * 12;
    bytes[at..at + 4].copy_from_slice(&kind);
    let offset = (bytes.len() - at - 4) as u32;
    bytes[at + 4..at + 8].copy_from_slice(&offset.to_le_bytes());
    bytes[at + 8..at + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend(data);
  }
  let len = bytes.len() as u32;
  bytes[..4].copy_from_slice(&len.to_le_bytes());
  bytes
}
fn material() -> Vec<u8> {
  let textures = [
    ("g_tColor", "materials/color.vtex"),
    ("g_tNormalRoughness", "materials/normal.vtex"),
  ]
  .map(|(slot, path)| {
    object(vec![
      ("m_name", Value::String(slot.into())),
      ("m_pValue", Value::String(path.into())),
    ])
  });
  let data = object(vec![
    ("m_shaderName", Value::String("pbr.vfx".into())),
    (
      "m_materialName",
      Value::String("materials/body.vmat".into()),
    ),
    ("m_textureParams", Value::Array(textures.to_vec())),
    ("m_intParams", Value::Array(vec![])),
    ("m_floatParams", Value::Array(vec![])),
    ("m_vectorParams", Value::Array(vec![])),
    ("m_dynamicParams", Value::Array(vec![])),
    ("m_renderAttributesUsed", Value::Array(vec![])),
  ]);
  resource(vec![
    (*b"DATA", kv3::encode(&data, &kv3::Format([3; 16]))),
    (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
  ])
}
fn model() -> Vec<u8> {
  let draws = ["materials/body.vmat", "materials/head.vmat"].map(|name| {
    object(vec![
      ("m_material", Value::String(name.into())),
      ("m_nIndexCount", Value::Int(30)),
    ])
  });
  let data = object(vec![(
    "m_sceneObjects",
    Value::Array(vec![object(vec![(
      "m_drawCalls",
      Value::Array(draws.to_vec()),
    )])]),
  )]);
  resource(vec![
    (*b"MDAT", kv3::encode(&data, &kv3::Format([3; 16]))),
    (*b"ANIM", vec![7, 8, 9]),
  ])
}
pub(super) fn setup() -> (tempfile::TempDir, ModdingAddon) {
  let dir = tempfile::tempdir().unwrap();
  let content = dir.path().join("content");
  let game = dir.path().join("game");
  std::fs::create_dir(&content).unwrap();
  std::fs::create_dir_all(game.join("models")).unwrap();
  std::fs::create_dir(game.join("materials")).unwrap();
  std::fs::write(game.join("models/test.vmdl_c"), model()).unwrap();
  for path in ["materials/body.vmat_c", "materials/head.vmat_c"] {
    std::fs::write(game.join(path), material()).unwrap();
  }
  for path in ["materials/color.vtex_c", "materials/normal.vtex_c"] {
    let image = source2::Image {
      width: 2,
      height: 2,
      data: source2::ImageData::Rgba8([255, 0, 77, 99].repeat(4)),
    };
    std::fs::write(
      game.join(path),
      source2::texture::encode_vtex_png_rgba8888(
        &image,
        source2::texture::format::TextureFlags::empty(),
      )
      .unwrap(),
    )
    .unwrap();
  }
  let archive = dir.path().join("empty_dir.vpk");
  std::fs::write(
    &archive,
    [0x34, 0x12, 0xaa, 0x55, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  )
  .unwrap();
  let addon = ModdingAddon {
    id: "test".into(),
    name: "test".into(),
    sdk_root: dir.path().to_string_lossy().into(),
    content_path: content.to_string_lossy().into(),
    game_path: game.to_string_lossy().into(),
    archive_path: archive.to_string_lossy().into(),
  };
  (dir, addon)
}

#[test]
fn unchanged_model_overrides_keep_their_compiler_timestamps() {
  let (_dir, addon) = setup();
  let mut saved = storage::load(&addon).unwrap();
  let mut body = default_edit("materials/body.vmat".into());
  body.roughness = Some(0.2);
  let mut head = default_edit("materials/head.vmat".into());
  head.hidden = true;
  saved
    .models
    .insert("models/test.vmdl_c".into(), vec![body, head]);
  bake::apply(&addon, saved, false, None).unwrap();
  let saved = storage::load(&addon).unwrap();
  let time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
  let paths: Vec<_> = saved
    .resources
    .keys()
    .map(|path| Path::new(&addon.game_path).join(path))
    .chain(std::iter::once(
      Path::new(&addon.content_path).join(storage::STATE),
    ))
    .collect();
  for path in &paths {
    std::fs::File::options()
      .write(true)
      .open(path)
      .unwrap()
      .set_modified(time)
      .unwrap();
  }
  reapply_after_compile(&addon).unwrap();
  for path in paths {
    assert_eq!(
      std::fs::metadata(&path).unwrap().modified().unwrap(),
      time,
      "{} was rewritten",
      path.display()
    );
  }
  storage::verify(&addon, &storage::load(&addon).unwrap()).unwrap();
}

#[test]
fn gif_import_paint_and_streamed_save_preserve_timeline_colors_masks_and_restore() {
  use super::super::modding_model_images;
  use paint::{ModdingModelPaint, ModdingPaintBlend, ModdingPaintLayer};
  let (dir, addon) = setup();
  let source = dir.path().join("overlay.gif");
  {
    let mut encoder = image::codecs::gif::GifEncoder::new(std::fs::File::create(&source).unwrap());
    encoder
      .set_repeat(image::codecs::gif::Repeat::Infinite)
      .unwrap();
    for (color, duration) in [([255, 0, 0, 255], 30), ([0, 255, 0, 255], 90)] {
      encoder
        .encode_frame(image::Frame::from_parts(
          image::RgbaImage::from_pixel(4, 4, image::Rgba(color)),
          0,
          0,
          image::Delay::from_numer_denom_ms(duration, 1),
        ))
        .unwrap();
    }
  }
  let imported = modding_model_images::import(Path::new(&addon.content_path), &source).unwrap();
  let mut body = default_edit("materials/body.vmat".into());
  body.paint = Some(ModdingModelPaint {
    layers: vec![ModdingPaintLayer {
      id: "gif".into(),
      name: "GIF".into(),
      visible: true,
      opacity: 1.,
      blend: ModdingPaintBlend::Normal,
      strokes: Vec::new(),
      image: Some(imported.path),
    }],
  });
  let mut saved = storage::load(&addon).unwrap();
  saved.models.insert(
    "models/test.vmdl_c".into(),
    vec![body, default_edit("materials/head.vmat".into())],
  );
  bake::apply(&addon, saved, false, None).unwrap();
  let saved = storage::load(&addon).unwrap();
  storage::verify(&addon, &saved).unwrap();
  let atlas_path = saved
    .resources
    .keys()
    .find(|path| path.starts_with("materials/dmm_model_edits/"))
    .unwrap();
  let bytes = storage::read(&Path::new(&addon.game_path).join(atlas_path)).unwrap();
  assert_eq!(
    source2::inspect(&bytes).unwrap().format,
    source2::texture::format::TextureFormat::Bc7
  );
  let atlas = source2::decode(&bytes).unwrap();
  assert_eq!((atlas.width, atlas.height), (16, 8));
  let source2::ImageData::Rgba8(pixels) = atlas.data else {
    panic!("RGBA required")
  };
  for (x, expected) in [(2, [255u8, 0, 0, 99]), (10, [0, 255, 0, 99])] {
    let start = (2 * 16 + x) * 4;
    for (actual, expected) in pixels[start..start + 4].iter().zip(expected) {
      assert!(actual.abs_diff(expected) <= 3);
    }
  }
  let material = storage::read(&Path::new(&addon.game_path).join("materials/body.vmat_c")).unwrap();
  let tree = kv3::decode(Resource::parse(&material).unwrap().data_block().unwrap()).unwrap();
  let metadata = tree
    .get("m_stringAttributes")
    .unwrap()
    .as_array()
    .unwrap()
    .iter()
    .find(|entry| entry.get("m_name").and_then(Value::as_str) == Some("DmmAnimatedAlbedo"))
    .unwrap()
    .get("m_value")
    .and_then(Value::as_str)
    .unwrap();
  let metadata: serde_json::Value = serde_json::from_str(metadata).unwrap();
  assert_eq!(metadata["durationsMs"], serde_json::json!([30, 90]));
  reapply_after_compile(&addon).unwrap();
  assert_eq!(
    storage::read(&Path::new(&addon.game_path).join(atlas_path)).unwrap(),
    bytes
  );
  let mut reset = storage::load(&addon).unwrap();
  reset.models.clear();
  bake::apply(&addon, reset, false, None).unwrap();
  assert!(!Path::new(&addon.game_path).join(atlas_path).exists());
}
#[test]
fn model_edits_survive_recompilation_and_restore_every_original_without_cumulative_paint() {
  let (_dir, addon) = setup();
  let game = Path::new(&addon.game_path);
  let body = std::fs::read(game.join("materials/body.vmat_c")).unwrap();
  let normal = std::fs::read(game.join("materials/normal.vtex_c")).unwrap();
  let mut saved = storage::load(&addon).unwrap();
  let mut edit = default_edit("materials/body.vmat".into());
  edit.tint = Some("#3388dd".into());
  edit.roughness = Some(0.2);
  edit.metalness = Some(0.8);
  let mut head = default_edit("materials/head.vmat".into());
  head.hidden = true;
  saved
    .models
    .insert("models/test.vmdl_c".into(), vec![edit, head]);
  bake::apply(&addon, saved, false, None).unwrap();
  let saved = storage::load(&addon).unwrap();
  storage::verify(&addon, &saved).unwrap();
  let first: BTreeMap<_, _> = saved
    .resources
    .iter()
    .map(|(p, r)| (p.clone(), r.applied.clone()))
    .collect();
  let original_archive = archive(&addon).unwrap();
  let (_temp, baseline) = storage::baseline_archive(&addon, original_archive).unwrap();
  assert_eq!(
    baseline.extract_entry("models/test.vmdl_c").unwrap(),
    model()
  );
  std::fs::write(game.join("models/test.vmdl_c"), model()).unwrap();
  std::fs::write(game.join("materials/body.vmat_c"), &body).unwrap();
  reapply_after_compile(&addon).unwrap();
  let saved = storage::load(&addon).unwrap();
  let second: BTreeMap<_, _> = saved
    .resources
    .iter()
    .map(|(p, r)| (p.clone(), r.applied.clone()))
    .collect();
  assert_eq!(first, second);
  assert_eq!(
    std::fs::read(game.join("materials/normal.vtex_c")).unwrap(),
    normal
  );
  let edited = std::fs::read(game.join("models/test.vmdl_c")).unwrap();
  let resource = Resource::parse(&edited).unwrap();
  assert_eq!(resource.find_block(*b"ANIM"), Some([7, 8, 9].as_slice()));
  let mesh = kv3::decode(resource.find_block(*b"MDAT").unwrap()).unwrap();
  assert_eq!(
    mesh.get("m_sceneObjects").unwrap().as_array().unwrap()[0]
      .get("m_drawCalls")
      .unwrap()
      .as_array()
      .unwrap()[1]
      .get("m_nIndexCount")
      .unwrap()
      .as_int(),
    Some(0)
  );
  let packed = tempfile::NamedTempFile::new().unwrap();
  let staging = tempfile::tempdir().unwrap();
  super::super::modding_build::pack_files(game, staging.path()).unwrap();
  vpkmanager::pack::pack_directory_to_writer(staging.path(), &mut packed.as_file(), |_| true)
    .unwrap();
  let archive = VpkArchive::open(packed.path()).unwrap();
  assert_eq!(archive.extract_entry("models/test.vmdl_c").unwrap(), edited);
  for path in saved.resources.keys() {
    assert!(archive.contains_entry(path));
  }
  let mut reset = saved;
  reset.models.clear();
  bake::apply(&addon, reset, false, None).unwrap();
  assert_eq!(
    std::fs::read(game.join("models/test.vmdl_c")).unwrap(),
    model()
  );
  assert_eq!(
    std::fs::read(game.join("materials/body.vmat_c")).unwrap(),
    body
  );
  assert_eq!(
    std::fs::read_dir(game.join("materials/dmm_model_edits"))
      .unwrap()
      .count(),
    0
  );
}
#[test]
fn rejects_stale_outputs_bad_paths_and_nonfinite_controls() {
  let (_dir, addon) = setup();
  let mut saved = storage::load(&addon).unwrap();
  let mut edit = default_edit("materials/body.vmat".into());
  edit.tint = Some("#3388dd".into());
  saved.models.insert(
    "models/test.vmdl_c".into(),
    vec![edit.clone(), default_edit("materials/head.vmat".into())],
  );
  bake::apply(&addon, saved, false, None).unwrap();
  std::fs::write(
    Path::new(&addon.game_path).join("materials/body.vmat_c"),
    b"new external edit",
  )
  .unwrap();
  let saved = storage::load(&addon).unwrap();
  assert!(storage::verify(&addon, &saved).is_err());
  assert!(bake::apply(&addon, saved, false, None).is_err());
  assert_eq!(
    std::fs::read(Path::new(&addon.game_path).join("materials/body.vmat_c")).unwrap(),
    b"new external edit"
  );
  edit.material = "../outside.vmat".into();
  assert!(validate_edits(&[edit.clone()]).is_err());
  edit.material = "materials/body.vmat".into();
  edit.roughness = Some(f64::NAN);
  assert!(validate_edits(&[edit]).is_err());
}

#[test]
fn restoring_base_game_overrides_removes_only_generated_local_files() {
  let (_dir, mut addon) = setup();
  let game = Path::new(&addon.game_path);
  let packed = Path::new(&addon.content_path).join("base_dir.vpk");
  let mut file = std::fs::File::create(&packed).unwrap();
  vpkmanager::pack::pack_directory_to_writer(game, &mut file, |_| true).unwrap();
  drop(file);
  addon.archive_path = packed.to_string_lossy().into();
  let base_hash = fingerprint(&std::fs::read(&packed).unwrap());
  for path in [
    "models/test.vmdl_c",
    "materials/body.vmat_c",
    "materials/head.vmat_c",
    "materials/color.vtex_c",
    "materials/normal.vtex_c",
  ] {
    std::fs::remove_file(game.join(path)).unwrap();
  }
  let mut saved = storage::load(&addon).unwrap();
  let mut body = default_edit("materials/body.vmat".into());
  body.tint = Some("#22aaee".into());
  saved.models.insert(
    "models/test.vmdl_c".into(),
    vec![body, default_edit("materials/head.vmat".into())],
  );
  bake::apply(&addon, saved, false, None).unwrap();
  let mut saved = storage::load(&addon).unwrap();
  assert!(saved.resources.values().all(|resource| !resource.local));
  saved.models.clear();
  bake::apply(&addon, saved, false, None).unwrap();
  assert!(!game.join("materials/body.vmat_c").exists());
  assert_eq!(fingerprint(&std::fs::read(packed).unwrap()), base_hash);
  // Stale backups from a reset must not shadow a newly compiled local material.
  let replacement = vec![1, 2, 3];
  std::fs::write(game.join("materials/body.vmat_c"), &replacement).unwrap();
  let (_temp, baseline) = storage::baseline_archive(&addon, archive(&addon).unwrap()).unwrap();
  assert_eq!(
    baseline.extract_entry("materials/body.vmat_c").unwrap(),
    replacement
  );
}

#[test]
fn shared_material_settings_are_inherited_and_updated_without_sharing_visibility() {
  let (_dir, addon) = setup();
  let mut saved = storage::load(&addon).unwrap();
  let game = Path::new(&addon.game_path);
  std::fs::write(game.join("models/second.vmdl_c"), model()).unwrap();
  let mut body = default_edit("materials/body.vmat".into());
  body.tint = Some("#22aaee".into());
  let mut head = default_edit("materials/head.vmat".into());
  head.hidden = true;
  saved
    .models
    .insert("models/test.vmdl_c".into(), vec![body.clone(), head]);
  bake::apply(&addon, saved, false, None).unwrap();
  let mut saved = storage::load(&addon).unwrap();
  let (_, _, edits) = inspect(
    &addon,
    "models/second.vmdl_c",
    &saved,
    &archive(&addon).unwrap(),
  )
  .unwrap();
  assert_eq!(edits[0].tint, body.tint);
  assert!(!edits[1].hidden);
  body.tint = Some("#ee7722".into());
  update_models(
    &mut saved,
    "models/second.vmdl_c",
    vec![body.clone(), default_edit("materials/head.vmat".into())],
  );
  assert_eq!(saved.models["models/test.vmdl_c"][0].tint, body.tint);
  assert!(saved.models["models/test.vmdl_c"][1].hidden);
  update_models(
    &mut saved,
    "models/second.vmdl_c",
    vec![
      default_edit("materials/body.vmat".into()),
      default_edit("materials/head.vmat".into()),
    ],
  );
  assert!(!saved.models.contains_key("models/second.vmdl_c"));
  assert_eq!(saved.models["models/test.vmdl_c"][0].tint, None);
  assert!(saved.models["models/test.vmdl_c"][1].hidden);
}

#[test]
fn pattern_and_gameplay_recipes_restore_without_touching_the_model() {
  let (_dir, addon) = setup();
  let game = Path::new(&addon.game_path);
  let original = std::fs::read(game.join("models/test.vmdl_c")).unwrap();
  let original_material = std::fs::read(game.join("materials/body.vmat_c")).unwrap();
  let mut edit = default_edit("materials/body.vmat".into());
  edit.pattern = Some(ModdingModelPattern {
    style: "galaxy".into(),
    intensity: 0.8,
    phase: 0.2,
    scroll: [0.1, 0.05],
  });
  edit.parameters = vec![
    ModdingMaterialProperty {
      name: "F_USE_STATUS_EFFECTS_PROXY".into(),
      values: vec![1.],
    },
    ModdingMaterialProperty {
      name: "F_SELF_ILLUM".into(),
      values: vec![1.],
    },
  ];
  edit.expressions = vec![ModdingMaterialExpression {
    name: "g_flSelfIllumScale1".into(),
    source: "(1 - saturate($ent_health)) * 10".into(),
  }];
  validate_edits(&[edit.clone()]).unwrap();
  let mut saved = storage::load(&addon).unwrap();
  saved.models.insert(
    "models/test.vmdl_c".into(),
    vec![edit, default_edit("materials/head.vmat".into())],
  );
  bake::apply(&addon, saved, false, None).unwrap();
  let material = std::fs::read(game.join("materials/body.vmat_c")).unwrap();
  let (tree, _, _) = vpkmanager::material_repair::decode(&material).unwrap();
  assert_eq!(
    vpkmanager::model_edit::material::material_expressions(&tree).len(),
    1
  );
  assert_eq!(
    std::fs::read(game.join("models/test.vmdl_c")).unwrap(),
    original
  );
  let mut saved = storage::load(&addon).unwrap();
  assert_eq!(
    saved.models.values().next().unwrap()[0]
      .pattern
      .as_ref()
      .unwrap()
      .style,
    "galaxy"
  );
  saved.models.clear();
  bake::apply(&addon, saved, false, None).unwrap();
  assert_eq!(
    std::fs::read(game.join("materials/body.vmat_c")).unwrap(),
    original_material
  );
}

#[test]
fn attached_stickers_reopen_on_their_own_model_without_leaking_to_shared_materials() {
  let (_dir, addon) = setup();
  std::fs::write(
    Path::new(&addon.game_path).join("models/second.vmdl_c"),
    model(),
  )
  .unwrap();
  let mut saved = storage::load(&addon).unwrap();
  let patch: ModdingModelPatch = serde_json::from_value(serde_json::json!({
    "id":"test", "image":"materials/dmm_images/test/original.png", "bone":"spine", "position":[0,0,0], "rotation":[0,0,0,1], "size":[20,20], "shape":"conform", "curvature":0.03, "thickness":0.1, "offset":0.3, "roughness":0.7, "glow":0, "crop":[0,0,1,1], "background":null
  })).unwrap();
  let mut body = default_edit("materials/body.vmat".into());
  body.patches = Some(vec![patch.clone()]);
  saved
    .models
    .insert("models/test.vmdl_c".into(), vec![body.clone()]);
  let archive = archive(&addon).unwrap();
  let (_, _, edits) = inspect(&addon, "models/test.vmdl_c", &saved, &archive).unwrap();
  assert_eq!(edits[0].patches.as_ref().unwrap()[0].id, "test");
  body.tint = Some("#22aaee".into());
  saved.models.insert("models/test.vmdl_c".into(), vec![body]);
  let (_, _, edits) = inspect(&addon, "models/second.vmdl_c", &saved, &archive).unwrap();
  assert!(edits.iter().all(|edit| edit.patches.is_none()));
  let mut duplicate = default_edit("materials/head.vmat".into());
  duplicate.patches = Some(vec![patch]);
  saved
    .models
    .get_mut("models/test.vmdl_c")
    .unwrap()
    .push(duplicate);
  assert!(validate_edits(saved.models.get("models/test.vmdl_c").unwrap()).is_err());
}
