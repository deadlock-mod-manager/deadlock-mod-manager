//! Opt-in regression runner for locally downloaded, checksum-pinned mods.
//! Runtime acceptance is deliberately not inferred from a successful rebuild.
use super::*;

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_MERRIN_VPK"]
fn legacy_merrin_model_restores_animation_and_camera_without_changing_skinning() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let source = PathBuf::from(std::env::var("DMM_MERRIN_VPK").unwrap());
  let original = fs::read(&source).unwrap();
  let input = LocalizationModInput {
    mod_id: "595391".into(),
    vpks: vec![source.clone()],
  };
  let path = "models/heroes_staging/hornet_v3/hornet.vmdl_c";
  let resources = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  let authored = resources.resolve(path).unwrap().unwrap().1;
  let current = resources.game_bytes(path).unwrap().unwrap();
  let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
  let repaired = plan.camera_models.get(path).unwrap_or_else(|| {
    panic!(
      "Merrin has no animation/camera repair: {:?}",
      plan.analysis.asset_warnings
    )
  });
  let (_, model, _) = decode_compiled_data(repaired, path).unwrap();
  let (_, reference, _) = decode_compiled_data(&current, path).unwrap();
  for field in ["m_animGraph2Refs", "m_vecNmSkeletonRefs"] {
    assert_eq!(model.get(field), reference.get(field), "{field}");
  }
  assert!(model_animation::deformation_preserved(&authored, repaired));
  assert!(
    !plan.analysis.asset_warnings.iter().any(|warning| {
      warning.file_path == path
        && matches!(
          warning.kind,
          asset_compatibility::WarningKind::MissingCameraInterface
            | asset_compatibility::WarningKind::MissingAnimationInterface
        )
    }),
    "Repaired model still lacks required interfaces"
  );
  let output = tempfile::tempdir().unwrap();
  let archive_path = output.path().join("overlay.vpk");
  assert!(plan.write(&archive_path, &[]).unwrap().has_overlay);
  let exported = VpkArchive::open(&archive_path)
    .unwrap()
    .extract_entry(path)
    .unwrap();
  assert_eq!(&exported, repaired);
  let independent = source2_model::resource::Resource::parse(exported).unwrap();
  let rebuilt = Resource::parse(repaired).unwrap();
  for (index, _block) in rebuilt
    .blocks()
    .iter()
    .enumerate()
    .filter(|(_, block)| [*b"DATA", *b"MDAT"].contains(&block.kind))
  {
    let reference = &independent.blocks[index];
    let decoded = source2_model::kv3::parse(
      &independent.data[reference.offset..reference.offset + reference.size],
    )
    .unwrap();
    let value = kv3::decode(rebuilt.get_block_by_index(index).unwrap()).unwrap();
    assert!(super::tests::independent_values_equal(&value, &decoded));
  }
  assert_eq!(fs::read(source).unwrap(), original);
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_GOLD_VPK"]
fn relocated_gold_model_reaches_current_hero_and_preserves_authored_materials() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let source = PathBuf::from(std::env::var("DMM_GOLD_VPK").unwrap());
  let original = fs::read(&source).unwrap();
  let input = LocalizationModInput {
    mod_id: "559174".into(),
    vpks: vec![source.clone()],
  };
  let resources = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  let (_, heroes, _) = decode_compiled_data(
    &resources.game_bytes(HEROES_VDATA_PATH).unwrap().unwrap(),
    HEROES_VDATA_PATH,
  )
  .unwrap();
  let target = format!(
    "{}_c",
    heroes
      .get("hero_synth")
      .unwrap()
      .get("m_strModelName")
      .unwrap()
      .as_str()
      .unwrap()
  );
  let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
  assert!(
    plan
      .analysis
      .asset_repairs
      .iter()
      .any(|repair| repair.file_path == target),
    "No repair reaches Pocket's current model: {target}; warnings={:?}",
    plan.analysis.asset_warnings
  );
  let output = tempfile::tempdir().unwrap();
  let path = output.path().join("overlay.vpk");
  assert!(plan.write(&path, &[]).unwrap().has_overlay);
  let archive = VpkArchive::open(&path).unwrap();
  let bytes = archive.extract_entry(&target).unwrap();
  let independent = source2_model::resource::Resource::parse(bytes.clone()).unwrap();
  source2_model::kv3::parse(independent.block_bytes("DATA").unwrap()).unwrap();
  let before = VpkArchive::open(&source)
    .unwrap()
    .extract_entry("models/heroes_staging/synth/synth.vmdl_c")
    .unwrap();
  let materials = |bytes: &[u8]| {
    vpkmanager::material_repair::references(bytes)
      .unwrap()
      .into_iter()
      .filter(|(_, name)| name.ends_with(".vmat"))
      .collect::<BTreeSet<_>>()
  };
  assert_eq!(
    materials(&bytes),
    materials(&before),
    "Authored material bindings changed"
  );
  assert_eq!(fs::read(source).unwrap(), original);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorpusCase {
  id: u64,
  name: String,
  url: String,
  archive: PathBuf,
  sha256: String,
  vpks: Vec<PathBuf>,
}

fn diagnostic_json(value: &Kv3Value) -> serde_json::Value {
  match value {
    Kv3Value::Null => serde_json::Value::Null,
    Kv3Value::Bool(value) => (*value).into(),
    Kv3Value::Int(value) => (*value).into(),
    Kv3Value::UInt(value) => (*value).into(),
    Kv3Value::Double(value) => serde_json::json!(value),
    Kv3Value::String(value) => value.clone().into(),
    Kv3Value::Binary(value) => serde_json::json!({"binaryBytes":value.len()}),
    Kv3Value::Array(values) => values.iter().map(diagnostic_json).collect(),
    Kv3Value::Object(fields) => fields
      .iter()
      .map(|(key, value)| (key.clone(), diagnostic_json(value)))
      .collect::<serde_json::Map<_, _>>()
      .into(),
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL, DMM_COMPAT_CORPUS and DMM_COMPAT_REPORT"]
fn mixed_corpus_respects_per_mod_selection_and_load_order() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  assert!(
    cases.len() >= 10,
    "mixed regression requires ten pinned fixtures"
  );
  let inputs: Vec<_> = cases
    .iter()
    .map(|case| {
      assert_eq!(
        hex::encode(Sha256::digest(fs::read(&case.archive).unwrap())),
        case.sha256
      );
      LocalizationModInput {
        mod_id: case.id.to_string(),
        vpks: case.vpks.clone(),
      }
    })
    .collect();
  let originals: Vec<_> = inputs
    .iter()
    .flat_map(|input| &input.vpks)
    .map(|path| (path, Sha256::digest(fs::read(path).unwrap())))
    .collect();
  let output = TempDir::new().unwrap();
  let mut reports = Vec::new();
  for (label, selected) in [
    ("none", BTreeSet::new()),
    (
      "all",
      inputs.iter().map(|input| input.mod_id.clone()).collect(),
    ),
    (
      "alternating",
      inputs
        .iter()
        .step_by(2)
        .map(|input| input.mod_id.clone())
        .collect(),
    ),
    ("toon_only", BTreeSet::from(["670722".into()])),
    (
      "except_toon",
      inputs
        .iter()
        .filter(|input| input.mod_id != "670722")
        .map(|input| input.mod_id.clone())
        .collect(),
    ),
  ] {
    for reversed in [false, true] {
      let mut ordered = inputs.clone();
      if reversed {
        ordered.reverse();
      }
      let protected: BTreeSet<_> = ordered
        .iter()
        .filter(|input| !selected.contains(&input.mod_id))
        .flat_map(|input| &input.vpks)
        .flat_map(|path| VpkArchive::open(path).unwrap().list_entries())
        .map(|path| normalize_path(&path))
        .collect();
      let started = std::time::Instant::now();
      let plan = LocalizationOverlayPlan::build_selected(&citadel, &ordered, &selected).unwrap();
      assert!(
        plan
          .analysis
          .asset_repairs
          .iter()
          .all(|r| selected.contains(&r.mod_id))
      );
      assert!(
        plan
          .analysis
          .asset_warnings
          .iter()
          .all(|r| selected.contains(&r.mod_id))
      );
      let archive_path = output.path().join(format!("{label}-{reversed}.vpk"));
      let applied = plan.write(&archive_path, &[]).unwrap();
      if applied.has_overlay {
        let archive = VpkArchive::open(&archive_path).unwrap();
        assert_eq!(archive.list_entries().len(), applied.packed_files);
        for path in archive.list_entries() {
          assert!(
            !protected.contains(&normalize_path(&path)),
            "opted-out resource replaced: {label}/{reversed}/{path}"
          );
          let bytes = archive.extract_entry(&path).unwrap();
          if path.ends_with("_c") {
            let (_, value, _) = decode_compiled_data(&bytes, &path).unwrap();
            let resource = source2_model::resource::Resource::parse(bytes).unwrap();
            let decoded = source2_model::kv3::parse(resource.block_bytes("DATA").unwrap()).unwrap();
            assert!(tests::independent_values_equal(&value, &decoded));
          }
        }
      }
      if selected.is_empty() {
        assert!(!applied.has_overlay);
      }
      println!(
        "mixed {label}/{reversed}: {} packed files",
        applied.packed_files
      );
      reports.push(serde_json::json!({
        "selection": label, "reversed": reversed, "enabledMods": ordered.len(),
        "packedFiles": applied.packed_files, "analysis": plan.analysis,
        "elapsedMs": started.elapsed().as_millis(), "runtime": "not-tested"
      }));
    }
  }
  for (path, hash) in originals {
    assert_eq!(
      Sha256::digest(fs::read(path).unwrap()),
      hash,
      "source VPK modified"
    );
  }
  fs::write(
    std::env::var("DMM_COMPAT_REPORT").unwrap(),
    serde_json::to_vec_pretty(&reports).unwrap(),
  )
  .unwrap();
}

#[test]
#[ignore = "local selector diagnostic; requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS"]
fn inspect_legacy_hero_selector() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let case = cases.iter().find(|case| case.id == 639883).unwrap();
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: case.id.to_string(),
      vpks: case.vpks.clone(),
    }],
  )
  .unwrap();
  let current = resources.game_bytes(HEROES_VDATA_PATH).unwrap().unwrap();
  let source = resources.resolve(HEROES_VDATA_PATH).unwrap().unwrap().1;
  let archive = VpkArchive::open(Path::new(
    &std::env::var("DMM_COMPAT_LIVE_OVERLAY").unwrap(),
  ))
  .unwrap();
  let live = archive.extract_entry(HEROES_VDATA_PATH).unwrap();
  for (label, bytes) in [
    ("current", current),
    ("source", source),
    ("live", live.into()),
  ] {
    let (_, root, encoding) = decode_compiled_data(&bytes, HEROES_VDATA_PATH).unwrap();
    for name in ["hero_nano", "hero_astro", "hero_vampirebat"] {
      println!(
        "{label} {name} state {:?} encoding {:?}",
        root
          .get(name)
          .and_then(|r| r.get("m_eHeroDevelopmentState")),
        encoding
          .get(name)
          .and_then(|r| r.get("m_eHeroDevelopmentState"))
      );
    }
    fs::write(
      std::env::temp_dir().join(format!("dmm-selector-{label}.json")),
      serde_json::to_vec_pretty(&diagnostic_json(&root)).unwrap(),
    )
    .unwrap();
  }
}

#[test]
#[ignore = "local corpus diagnostic; requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS"]
fn inspect_legacy_model_contracts() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let root = std::env::temp_dir().join("dmm-legacy-contracts");
  fs::create_dir_all(&root).unwrap();
  for case in cases {
    let resources = resources::ResourceSnapshot::open(
      &citadel,
      &[LocalizationModInput {
        mod_id: case.id.to_string(),
        vpks: case.vpks.clone(),
      }],
    )
    .unwrap();
    for path in resources
      .mod_paths()
      .filter(|path| path.ends_with(".vmdl_c"))
    {
      let Some(base) = resources.game_bytes(path).unwrap() else {
        continue;
      };
      let source = resources.resolve(path).unwrap().unwrap().1;
      let mut contract = serde_json::Map::new();
      for (label, bytes) in [("source", source), ("current", base)] {
        let (_, value, _) = decode_compiled_data(&bytes, path).unwrap();
        let resource = Resource::parse(&bytes).unwrap();
        for kind in [*b"PHYS", *b"CTRL"] {
          if let Some(block) = resource.find_block(kind) {
            let value = kv3::decode(block).unwrap();
            fs::write(
              root.join(format!(
                "{}-{}-{label}-{}.json",
                case.id,
                path.rsplit('/').next().unwrap(),
                String::from_utf8_lossy(&kind)
              )),
              serde_json::to_vec_pretty(&diagnostic_json(&value)).unwrap(),
            )
            .unwrap();
          }
        }
        fs::write(
          root.join(format!(
            "{}-{}-{label}.bin",
            case.id,
            path.rsplit('/').next().unwrap()
          )),
          &*bytes,
        )
        .unwrap();
        let mut details = serde_json::Map::new();
        details.insert(
          "meshBlocks".into(),
          resource
            .blocks()
            .iter()
            .filter(|block| block.kind == *b"MDAT")
            .count()
            .into(),
        );
        for key in [
          "m_animGraph2Refs",
          "m_vecNmSkeletonRefs",
          "m_refAnimGroups",
          "m_refAnimIncludeModels",
          "m_refMeshes",
          "m_modelInfo",
          "m_remappingTableStarts",
          "m_nNmSkeletonBoneCount",
        ] {
          details.insert(key.into(), format!("{:?}", value.get(key)).into());
        }
        let rig = value.get("m_modelSkeleton").unwrap();
        details.insert("rig".into(), diagnostic_json(rig));
        details.insert(
          "blocks".into(),
          serde_json::json!(
            resource
              .blocks()
              .iter()
              .map(|block| String::from_utf8_lossy(&block.kind).into_owned())
              .collect::<Vec<_>>()
          ),
        );
        if let Some(refs) = value
          .get("m_vecNmSkeletonRefs")
          .and_then(Kv3Value::as_array)
        {
          for name in refs.iter().filter_map(Kv3Value::as_str) {
            if let Some(bytes) = resources.game_bytes(name).unwrap() {
              let (_, skeleton, _) = decode_compiled_data(&bytes, name).unwrap();
              details.insert("animationRig".into(), diagnostic_json(&skeleton));
            }
          }
        }
        details.insert(
          "rigKeys".into(),
          serde_json::to_value(
            rig
              .as_object()
              .unwrap()
              .iter()
              .map(|(key, _)| key)
              .collect::<Vec<_>>(),
          )
          .unwrap(),
        );
        details.insert(
          "bones".into(),
          format!("{:?}", rig.get("m_boneName")).into(),
        );
        details.insert(
          "parents".into(),
          format!("{:?}", rig.get("m_nParent")).into(),
        );
        contract.insert(label.into(), details.into());
        let filename = path.rsplit('/').next().unwrap();
        fs::write(
          root.join(format!("{}-{filename}-{label}.txt", case.id)),
          format!("{value:#?}"),
        )
        .unwrap();
      }
      let filename = path.rsplit('/').next().unwrap();
      fs::write(
        root.join(format!("{}-{filename}.json", case.id)),
        serde_json::to_vec_pretty(&contract).unwrap(),
      )
      .unwrap();
      println!("{} {path}", case.id);
    }
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL, DMM_COMPAT_CORPUS and DMM_COMPAT_REPORT"]
fn run_obsolete_mod_corpus() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  assert!(!cases.is_empty());
  let output = TempDir::new().unwrap();
  let mut reports = Vec::new();
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: "index".into(),
      vpks: cases[0].vpks.clone(),
    }],
  )
  .unwrap();
  let heroes = resources
    .game_bytes(HEROES_VDATA_PATH)
    .unwrap()
    .map(|bytes| decode_compiled_data(&bytes, "current heroes").unwrap().1);
  for case in cases {
    assert_eq!(
      hex::encode(Sha256::digest(fs::read(&case.archive).unwrap())),
      case.sha256,
      "download checksum: {}",
      case.name
    );
    assert!(!case.vpks.is_empty(), "{} has no extracted VPKs", case.name);
    let original: Vec<_> = case
      .vpks
      .iter()
      .map(|path| (path, Sha256::digest(fs::read(path).unwrap())))
      .collect();
    let input = LocalizationModInput {
      mod_id: case.id.to_string(),
      vpks: case.vpks.clone(),
    };
    let mut categories = BTreeMap::<String, usize>::new();
    for path in &case.vpks {
      let archive = VpkArchive::open(path).unwrap();
      for entry in archive.list_entries() {
        *categories
          .entry(
            entry
              .rsplit('.')
              .next()
              .unwrap_or("no-extension")
              .to_owned(),
          )
          .or_default() += 1;
      }
    }
    let started = std::time::Instant::now();
    let result = LocalizationOverlayPlan::build(&citadel, &[input]);
    let mut report = match result {
      Ok(plan) => {
        let archive_path = output.path().join(format!("{}.vpk", case.id));
        let written = plan.write(&archive_path, &[]);
        let (packed, error) = match written {
          Ok(applied) => {
            if applied.has_overlay {
              let archive = VpkArchive::open(&archive_path).unwrap();
              assert_eq!(archive.list_entries().len(), applied.packed_files);
              for path in archive.list_entries() {
                let bytes = archive.extract_entry(&path).unwrap();
                if path.ends_with("_c") {
                  let (_, value, _) = decode_compiled_data(&bytes, &path).unwrap();
                  let independent = source2_model::resource::Resource::parse(bytes).unwrap();
                  let decoded =
                    source2_model::kv3::parse(independent.block_bytes("DATA").unwrap()).unwrap();
                  assert!(
                    super::tests::independent_values_equal(&value, &decoded),
                    "independent decode: {} / {path}",
                    case.name
                  );
                }
              }
            }
            (applied.packed_files, None)
          }
          Err(error) => (0, Some(error.to_string())),
        };
        serde_json::json!({"id":case.id,"name":case.name,"url":case.url,"sha256":case.sha256,"categories":categories,"analysis":plan.analysis,"packedFiles":packed,"error":error,"elapsedMs":started.elapsed().as_millis(),"runtime":"not-tested"})
      }
      Err(error) => {
        serde_json::json!({"id":case.id,"name":case.name,"url":case.url,"sha256":case.sha256,"categories":categories,"error":error.to_string(),"elapsedMs":started.elapsed().as_millis(),"runtime":"not-tested"})
      }
    };
    let models: Vec<_> = case.vpks.iter().flat_map(|path| VpkArchive::open(path).unwrap().list_entries()).filter(|path| path.ends_with(".vmdl_c")).map(|path| {
      let owners: Vec<_> = heroes.as_ref().and_then(Kv3Value::as_object).into_iter().flatten().filter_map(|(row, value)| {
        (value.get("m_strModelName").and_then(Kv3Value::as_str).map(|name| format!("{name}_c")) == Some(path.clone())).then_some(row)
      }).collect();
      serde_json::json!({"path":path,"currentReferenceExists":resources.game_bytes(&path).unwrap().is_some(),"currentHeroDefinitions":owners})
    }).collect();
    report["modelUsage"] = serde_json::to_value(models).unwrap();
    for (path, hash) in original {
      assert_eq!(
        Sha256::digest(fs::read(path).unwrap()),
        hash,
        "source VPK modified"
      );
    }
    println!("{}: {}", case.id, report.get("error").unwrap());
    reports.push(report);
  }
  fs::write(
    std::env::var("DMM_COMPAT_REPORT").unwrap(),
    serde_json::to_vec_pretty(&reports).unwrap(),
  )
  .unwrap();
  assert!(
    reports.iter().all(|report| report["error"].is_null()),
    "corpus contains analysis/export failures; inspect the report"
  );
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS"]
fn legacy_cat_bindings_and_camera_preserve_authored_geometry() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let case = cases.iter().find(|case| case.id == 639883).unwrap();
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: case.id.to_string(),
      vpks: case.vpks.clone(),
    }],
  )
  .unwrap();
  let path = "models/abilities/nano_catform_model.vmdl_c";
  let (provider, source) = resources.resolve(path).unwrap().unwrap();
  let sources = BTreeMap::from([(
    path.to_owned(),
    vec![CompiledDataSource {
      mod_id: case.id.to_string(),
      source_vpk: provider
        .archive
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned(),
      priority: 0,
      bytes: source.to_vec(),
    }],
  )]);
  let mut inputs = animation_model_evidence::AnimationInputs::default();
  for name in resources.mod_paths() {
    inputs.record(name, &case.id.to_string());
  }
  let mut repairs = Vec::new();
  let mut warnings = Vec::new();
  let animations =
    model_animation::prepare(&resources, &sources, &inputs, &mut repairs, &mut warnings).unwrap();
  assert!(animations.contains_key(path), "{warnings:?}");
  let repaired =
    model_camera::prepare(&resources, &sources, &inputs, &animations, &mut repairs).unwrap();
  assert!(
    repairs.iter().any(|repair| matches!(
      repair.kind,
      asset_compatibility::RepairKind::CameraInterface
    )),
    "{repairs:?}"
  );
  let output = &repaired[path];
  let (_, before, _) = decode_compiled_data(&source, path).unwrap();
  let (_, after, _) = decode_compiled_data(output, path).unwrap();
  assert!(runtime_values_equal(
    before.get("m_modelSkeleton").unwrap(),
    after.get("m_modelSkeleton").unwrap()
  ));
  for key in [
    "m_remappingTable",
    "m_remappingTableStarts",
    "m_materialGroups",
    "m_refAnimIncludeModels",
  ] {
    assert_eq!(before.get(key), after.get(key));
  }
  let old = Resource::parse(&source).unwrap();
  let new = Resource::parse(output).unwrap();
  for (index, block) in old.blocks().iter().enumerate() {
    if ![*b"DATA", *b"MDAT", *b"RERL"].contains(&block.kind) {
      assert_eq!(old.get_block_by_index(index), new.get_block_by_index(index));
    }
  }
  let current = resources.game_bytes(path).unwrap().unwrap();
  let (_, current, _) = decode_compiled_data(&current, path).unwrap();
  assert!(model_camera::missing_camera_fields(&after, &current).is_empty());
  let independent = source2_model::resource::Resource::parse(output.clone()).unwrap();
  let decoded = source2_model::kv3::parse(independent.block_bytes("DATA").unwrap()).unwrap();
  assert!(super::tests::independent_values_equal(&after, &decoded));
  if let Ok(live) = std::env::var("DMM_COMPAT_LIVE_OVERLAY") {
    let archive = VpkArchive::open(Path::new(&live)).unwrap();
    assert_eq!(
      archive.extract_entry(path).unwrap(),
      *output,
      "live cat repair differs from the fixture pipeline"
    );
    let heroes = archive.extract_entry(HEROES_VDATA_PATH).unwrap();
    let (_, heroes, _) = decode_compiled_data(&heroes, HEROES_VDATA_PATH).unwrap();
    let current = resources.game_bytes(HEROES_VDATA_PATH).unwrap().unwrap();
    let (_, current, _) = decode_compiled_data(&current, HEROES_VDATA_PATH).unwrap();
    let known_stat_keys: BTreeSet<_> = current
      .as_object()
      .unwrap()
      .iter()
      .filter(|(_, hero)| {
        hero.get("_class").and_then(Kv3Value::as_str) == Some("CitadelHeroData_t")
      })
      .flat_map(|(_, hero)| {
        hero
          .get("m_mapStandardLevelUpUpgrades")
          .and_then(Kv3Value::as_object)
      })
      .flatten()
      .map(|(key, _)| key.as_str())
      .collect();
    let abilities = resources
      .game_bytes(vdata_compatibility::ABILITIES_PATH)
      .unwrap()
      .unwrap();
    let (_, abilities, _) =
      decode_compiled_data(&abilities, vdata_compatibility::ABILITIES_PATH).unwrap();
    assert!(
      heroes.get("hero_tokamak").is_none(),
      "unavailable copied hero must not reach the live overlay"
    );
    for (name, hero) in heroes.as_object().unwrap() {
      for (key, _) in hero
        .get("m_mapStandardLevelUpUpgrades")
        .and_then(Kv3Value::as_object)
        .into_iter()
        .flatten()
      {
        assert!(
          known_stat_keys.contains(key.as_str()),
          "live unsupported stat key: {name}:{key}"
        );
      }
      if let Some(base) = current.get(name) {
        assert_eq!(
          hero.get("m_eHeroDevelopmentState"),
          base.get("m_eHeroDevelopmentState"),
          "live visibility state: {name}"
        );
        assert_eq!(
          hero.get("m_HeroID"),
          base.get("m_HeroID"),
          "live native identity: {name}"
        );
      }
      for (slot, target) in hero
        .get("m_mapBoundAbilities")
        .and_then(Kv3Value::as_object)
        .into_iter()
        .flatten()
      {
        let Some(target_name) = target.as_str().filter(|name| !name.is_empty()) else {
          continue;
        };
        let native_fallback = current
          .get(name)
          .and_then(|hero| hero.get("m_mapBoundAbilities"))
          .and_then(|map| map.get(slot))
          == Some(target);
        assert!(
          native_fallback
            || object_get_case_insensitive(abilities.as_object().unwrap(), target_name).is_some(),
          "live unresolved binding: {name}:{slot} -> {target_name}"
        );
      }
    }
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS"]
fn legacy_sliver_animation_activation_contract() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let case = cases.iter().find(|case| case.id == 639883).unwrap();
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: case.id.to_string(),
      vpks: case.vpks.clone(),
    }],
  )
  .unwrap();
  let mut inputs = animation_model_evidence::AnimationInputs::default();
  for path in resources.mod_paths() {
    inputs.record(path, &case.id.to_string());
  }
  let paths = [
    "models/abilities/nano_catform_model.vmdl_c",
    "models/heroes_staging/nano/nano_v2/nano.vmdl_c",
  ];
  let mut sources = BTreeMap::new();
  for path in paths {
    let (provider, bytes) = resources.resolve(path).unwrap().unwrap();
    sources.insert(
      path.into(),
      vec![CompiledDataSource {
        mod_id: case.id.to_string(),
        source_vpk: provider
          .archive
          .file_name()
          .unwrap()
          .to_string_lossy()
          .into_owned(),
        priority: 0,
        bytes: bytes.to_vec(),
      }],
    );
  }
  let mut repairs = Vec::new();
  let mut warnings = Vec::new();
  let output =
    model_animation::prepare(&resources, &sources, &inputs, &mut repairs, &mut warnings).unwrap();
  let final_models =
    model_camera::prepare(&resources, &sources, &inputs, &output, &mut repairs).unwrap();
  let live = std::env::var("DMM_COMPAT_LIVE_OVERLAY")
    .ok()
    .map(|path| VpkArchive::open(Path::new(&path)).unwrap());
  for path in paths {
    let repaired = output
      .get(path)
      .unwrap_or_else(|| panic!("Missing animation activation for {path}: {warnings:?}"));
    let (_, model, _) = decode_compiled_data(repaired, path).unwrap();
    let text = model
      .get("m_modelInfo")
      .unwrap()
      .get("m_keyValueText")
      .unwrap()
      .as_str()
      .unwrap();
    assert!(
      text.contains("CCitadelHeroModelGameData_t"),
      "Missing pawn animation controls for {path}"
    );
    assert!(
      !text.contains(".vanmgrph"),
      "Retired graph selection remains active for {path}"
    );
    assert!(
      text.contains("m_bTurnToFaceVelocity"),
      "Missing facing control for {path}"
    );
    let (_, original, _) = decode_compiled_data(&sources[path][0].bytes, path).unwrap();
    let before = original.get("m_modelSkeleton").unwrap();
    let after = model.get("m_modelSkeleton").unwrap();
    for (field, original) in before.as_object().unwrap() {
      let original = original.as_array().unwrap();
      assert_eq!(
        &after.get(field).unwrap().as_array().unwrap()[..original.len()],
        original,
        "authored rig changed: {path}:{field}"
      );
    }
    for field in [
      "m_remappingTable",
      "m_remappingTableStarts",
      "m_materialGroups",
      "m_refAnimIncludeModels",
    ] {
      assert_eq!(
        model.get(field),
        original.get(field),
        "authored mappings changed: {path}:{field}"
      );
    }
    let old_resource = Resource::parse(&sources[path][0].bytes).unwrap();
    let rebuilt = Resource::parse(repaired).unwrap();
    for (index, block) in old_resource.blocks().iter().enumerate() {
      if ![*b"DATA", *b"RERL"].contains(&block.kind) {
        assert_eq!(
          old_resource.get_block_by_index(index),
          rebuilt.get_block_by_index(index),
          "geometry or authored animation changed: {path}"
        );
      }
    }
    let independent = source2_model::resource::Resource::parse(repaired.clone()).unwrap();
    let decoded = source2_model::kv3::parse(independent.block_bytes("DATA").unwrap()).unwrap();
    assert!(super::tests::independent_values_equal(&model, &decoded));
    if let Some(live) = &live {
      assert_eq!(
        live.extract_entry(path).unwrap(),
        final_models[path],
        "live animation activation differs: {path}"
      );
    }
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS"]
fn legacy_mina_animation_and_camera_contract() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let case = cases.iter().find(|case| case.id == 634460).unwrap();
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: case.id.to_string(),
      vpks: case.vpks.clone(),
    }],
  )
  .unwrap();
  let mut inputs = animation_model_evidence::AnimationInputs::default();
  for path in resources.mod_paths() {
    inputs.record(path, &case.id.to_string());
  }
  let path = "models/heroes_wip/vampirebat/vampirebat.vmdl_c";
  let (provider, source) = resources.resolve(path).unwrap().unwrap();
  let sources = BTreeMap::from([(
    path.into(),
    vec![CompiledDataSource {
      mod_id: case.id.to_string(),
      source_vpk: provider
        .archive
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned(),
      priority: 0,
      bytes: source.to_vec(),
    }],
  )]);
  let mut repairs = Vec::new();
  let mut warnings = Vec::new();
  let animations =
    model_animation::prepare(&resources, &sources, &inputs, &mut repairs, &mut warnings).unwrap();
  assert!(animations.contains_key(path), "{warnings:?}");
  let output =
    model_camera::prepare(&resources, &sources, &inputs, &animations, &mut repairs).unwrap();
  let (_, model, _) = decode_compiled_data(&output[path], path).unwrap();
  let current = resources.game_bytes(path).unwrap().unwrap();
  let (_, current_model, _) = decode_compiled_data(&current, path).unwrap();
  assert!(
    model_camera::missing_camera_fields(&model, &current_model).is_empty(),
    "missing camera contract: {repairs:?}"
  );
  let (_, original, _) = decode_compiled_data(&source, path).unwrap();
  for field in [
    "m_modelSkeleton",
    "m_remappingTable",
    "m_remappingTableStarts",
    "m_materialGroups",
  ] {
    assert_eq!(model.get(field), original.get(field));
  }
  let resource = Resource::parse(&output[path]).unwrap();
  let original = Resource::parse(&source).unwrap();
  let first_mesh = original
    .blocks()
    .iter()
    .position(|block| block.kind == *b"MDAT")
    .unwrap();
  for (index, block) in original.blocks().iter().enumerate() {
    if index != first_mesh && ![*b"DATA", *b"RERL"].contains(&block.kind) {
      assert_eq!(
        original.get_block_by_index(index),
        resource.get_block_by_index(index)
      );
    }
  }
  let before = kv3::decode(original.find_block(*b"MDAT").unwrap()).unwrap();
  let after = kv3::decode(resource.find_block(*b"MDAT").unwrap()).unwrap();
  for (field, value) in before.as_object().unwrap() {
    if field == "m_attachments" {
      let points = value.as_array().unwrap();
      assert_eq!(
        &after.get(field).unwrap().as_array().unwrap()[..points.len()],
        points,
        "authored attachments changed"
      );
    } else {
      assert_eq!(after.get(field), Some(value), "mesh field changed: {field}");
    }
  }
  let bones: BTreeSet<_> = model
    .get("m_modelSkeleton")
    .unwrap()
    .get("m_boneName")
    .unwrap()
    .as_array()
    .unwrap()
    .iter()
    .filter_map(Kv3Value::as_str)
    .collect();
  assert!(asset_compatibility::mesh_warnings(&after, &bones).is_empty());
  let independent = source2_model::resource::Resource::parse(output[path].clone()).unwrap();
  let decoded = source2_model::kv3::parse(independent.block_bytes("DATA").unwrap()).unwrap();
  assert!(super::tests::independent_values_equal(&model, &decoded));
  if let Ok(path_to_live) = std::env::var("DMM_COMPAT_LIVE_OVERLAY") {
    let live = VpkArchive::open(Path::new(&path_to_live)).unwrap();
    assert_eq!(live.extract_entry(path).unwrap(), output[path]);
  }
}

#[test]
#[ignore = "local material diagnostic; requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS"]
fn inspect_legacy_material_contracts() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let root = std::env::temp_dir().join("dmm-legacy-materials");
  fs::create_dir_all(&root).unwrap();
  for case in cases {
    let resources = resources::ResourceSnapshot::open(
      &citadel,
      &[LocalizationModInput {
        mod_id: case.id.to_string(),
        vpks: case.vpks.clone(),
      }],
    )
    .unwrap();
    for path in resources
      .mod_paths()
      .filter(|path| path.ends_with(".vmat_c"))
    {
      let source = resources.resolve(path).unwrap().unwrap().1;
      let refs = vpkmanager::material_repair::references(&source).unwrap_or_default();
      let missing: Vec<_> = refs
        .iter()
        .filter(|(_, name)| resources.provider(name).is_none())
        .collect();
      if missing.is_empty() {
        continue;
      }
      let filename = format!("{}-{}", case.id, path.replace('/', "_"));
      println!("{} {path} {missing:?}", case.id);
      for (label, bytes) in [
        ("source", Some(source)),
        ("current", resources.game_bytes(path).unwrap()),
      ] {
        let Some(bytes) = bytes else {
          continue;
        };
        let resource = Resource::parse(&bytes).unwrap();
        let (_, value, _) = decode_compiled_data(&bytes, path).unwrap();
        fs::write(
          root.join(format!("{filename}-{label}.json")),
          serde_json::to_vec_pretty(&diagnostic_json(&value)).unwrap(),
        )
        .unwrap();
        if let Some(red2) = resource.find_block(*b"RED2")
          && let Ok(red2) = kv3::decode(red2) {
            fs::write(
              root.join(format!("{filename}-{label}-RED2.json")),
              serde_json::to_vec_pretty(&diagnostic_json(&red2)).unwrap(),
            )
            .unwrap();
          }
      }
    }
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS original fixtures"]
fn legacy_models_missing_samples_are_reconciled_against_current_render_contract() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  for (id, path, missing_count) in [
    (551071, "models/heroes_staging/digger/digger.vmdl_c", 36),
    (614168, "models/heroes_wip/dynamo/dynamo.vmdl_c", 0),
    (555188, "models/heroes_staging/yamato_v2/yamato.vmdl_c", 1),
  ] {
    let case = cases.iter().find(|case| case.id == id).unwrap();
    let input = LocalizationModInput {
      mod_id: id.to_string(),
      vpks: case.vpks.clone(),
    };
    let resources = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
    let original = resources.resolve(path).unwrap().unwrap().1;
    let (_, authored, _) = decode_compiled_data(&original, path).unwrap();
    let current = resources.game_bytes(path).unwrap().unwrap();
    let (_, current, _) = decode_compiled_data(&current, path).unwrap();
    let skeleton_path = current
      .get("m_vecNmSkeletonRefs")
      .unwrap()
      .as_array()
      .unwrap()[0]
      .as_str()
      .unwrap();
    let skeleton = resources.game_bytes(skeleton_path).unwrap().unwrap();
    let (_, skeleton, _) = decode_compiled_data(&skeleton, skeleton_path).unwrap();
    let names: BTreeSet<_> = authored
      .get("m_modelSkeleton")
      .unwrap()
      .get("m_boneName")
      .unwrap()
      .as_array()
      .unwrap()
      .iter()
      .map(|name| name.as_str().unwrap().to_ascii_lowercase())
      .collect();
    let missing: Vec<_> = skeleton
      .get("m_boneIDs")
      .unwrap()
      .as_array()
      .unwrap()
      .iter()
      .filter_map(Kv3Value::as_str)
      .filter(|name| !names.contains(&name.to_ascii_lowercase()))
      .collect();
    assert_eq!(missing.len(), missing_count, "fixture {id} changed");
    let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
    assert!(
      plan
        .analysis
        .asset_repairs
        .iter()
        .any(|r| r.file_path == path
          && matches!(r.kind, asset_compatibility::RepairKind::AnimationRigRebase))
    );
    assert!(plan.camera_models.contains_key(path));
    assert!(
      !plan.analysis.asset_warnings.iter().any(
        |w| w.file_path == path && w.kind == asset_compatibility::WarningKind::AnimationMapping
      )
    );
    assert_eq!(resources.resolve(path).unwrap().unwrap().1, original);
    println!("{id}: original missing samples: {missing_count}; coordinated AG2 repair accepted");
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS original fixtures"]
fn legacy_deformation_rig_rebase_preserves_authored_render_buffers() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let root = std::env::temp_dir().join("dmm-rig-rebase");
  fs::create_dir_all(&root).unwrap();
  let mut failed = Vec::new();
  for (id, path) in [
    (614168, "models/heroes_wip/dynamo/dynamo.vmdl_c"),
    (551071, "models/heroes_staging/digger/digger.vmdl_c"),
    (555188, "models/heroes_staging/yamato_v2/yamato.vmdl_c"),
  ] {
    let case = cases.iter().find(|case| case.id == id).unwrap();
    let input = LocalizationModInput {
      mod_id: id.to_string(),
      vpks: case.vpks.clone(),
    };
    let resources = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
    let source = resources.resolve(path).unwrap().unwrap().1;
    let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
    let Some(repaired) = plan.camera_models.get(path) else {
      println!(
        "{id}: {:?}",
        plan
          .analysis
          .asset_warnings
          .iter()
          .filter(|w| w.file_path == path)
          .map(|w| &w.detail)
          .collect::<Vec<_>>()
      );
      failed.push(id);
      continue;
    };
    if id == 551071 {
      let current = resources.game_bytes(path).unwrap().unwrap();
      for clip in ["weapon_stand_idle", "out_of_combat_stand_idle"] {
        let clip = format!("models/heroes_staging/digger/clips/{clip}.vnmclip_c");
        let provider = resources.provider(&clip).unwrap();
        let archive = VpkArchive::open(&provider.archive).unwrap();
        let animation =
          source2_model::nm_anim::load_nm_animation_from_archive(&archive, &clip).unwrap();
        model_animation::verify_animated_fixture(&source, &current, repaired, &animation);
      }
    }
    assert!(
      model_animation::deformation_preserved(&source, repaired),
      "{id}: authored skinning/attachments/hitboxes changed"
    );
    assert!(
      plan
        .analysis
        .asset_repairs
        .iter()
        .any(|r| r.file_path == path
          && matches!(r.kind, asset_compatibility::RepairKind::AnimationRigRebase))
    );
    let (_, value, _) = decode_compiled_data(repaired, path).unwrap();
    fs::write(
      root.join(format!("{id}-repaired-model.json")),
      serde_json::to_vec_pretty(&diagnostic_json(&value)).unwrap(),
    )
    .unwrap();
    let before = Resource::parse(&source).unwrap();
    let after = Resource::parse(repaired).unwrap();
    let independent = source2_model::resource::Resource::parse(repaired.clone()).unwrap();
    for (index, block) in after
      .blocks()
      .iter()
      .enumerate()
      .filter(|(_, b)| [*b"DATA", *b"MDAT"].contains(&b.kind))
    {
      let reference = &independent.blocks[index];
      let decoded = source2_model::kv3::parse(
        &independent.data[reference.offset..reference.offset + reference.size],
      )
      .unwrap();
      let value = kv3::decode(after.get_block_by_index(index).unwrap()).unwrap();
      assert!(
        super::tests::independent_values_equal(&value, &decoded),
        "{id}: independent block decode {}",
        String::from_utf8_lossy(&block.kind)
      );
    }
    assert_eq!(before.blocks().len(), after.blocks().len());
    for (index, block) in before.blocks().iter().enumerate() {
      assert_eq!(block.kind, after.blocks()[index].kind);
      if ![*b"DATA", *b"MDAT", *b"RERL"].contains(&block.kind) {
        assert_eq!(
          before.get_block_by_index(index),
          after.get_block_by_index(index),
          "{id}: block {index} changed"
        );
      }
    }
  }
  assert!(
    failed.is_empty(),
    "missing deformation-rig repairs: {failed:?}"
  );
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_COMPAT_CORPUS with Toon Bebop"]
fn toon_bebop_repair_is_stable_with_unrelated_animation_overrides() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<CorpusCase> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_COMPAT_CORPUS").unwrap()).unwrap())
      .unwrap();
  let case = cases.iter().find(|case| case.id == 670722).unwrap();
  assert_eq!(
    hex::encode(Sha256::digest(fs::read(&case.archive).unwrap())),
    case.sha256
  );
  let source_hashes: Vec<_> = case
    .vpks
    .iter()
    .map(|path| Sha256::digest(fs::read(path).unwrap()))
    .collect();
  let input = LocalizationModInput {
    mod_id: case.id.to_string(),
    vpks: case.vpks.clone(),
  };
  let baseline = LocalizationOverlayPlan::build(&citadel, std::slice::from_ref(&input)).unwrap();
  let skeleton = "models/heroes_staging/bebop/bebop.vnmskel_c";
  let expected = &baseline.animation_skeletons[skeleton];
  let snapshot = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  assert_eq!(
    expected,
    snapshot.game_bytes(skeleton).unwrap().unwrap().as_ref()
  );
  assert!(
    baseline.camera_models.is_empty(),
    "Toon model must remain authored"
  );
  let output = TempDir::new().unwrap();
  for (name, extension, binding, allowed) in [
    (
      "unrelated_nm",
      "vnmclip_c",
      "models/unrelated/rig.vnmskel",
      true,
    ),
    (
      "related_nm",
      "vnmclip_c",
      "models/heroes_staging/bebop/bebop.vnmskel",
      false,
    ),
    (
      "unknown_legacy",
      "vanim_c",
      "models/unrelated/rig.vnmskel",
      false,
    ),
  ] {
    let clip = tests::compiled_resource(vec![(
      "m_skeleton".into(),
      Kv3Value::String(binding.into()),
    )]);
    let path = format!("models/unrelated/idle.{extension}");
    let archive = resources::tests::pack(output.path(), name, &[(&path, &clip)]);
    let other = LocalizationModInput {
      mod_id: name.into(),
      vpks: vec![archive],
    };
    for (order, inputs) in [
      ("first", vec![input.clone(), other.clone()]),
      ("last", vec![other.clone(), input.clone()]),
    ] {
      let plan = LocalizationOverlayPlan::build(&citadel, &inputs).unwrap();
      assert!(
        plan.camera_models.is_empty(),
        "{name}/{order}: Toon model was rewritten"
      );
      if allowed {
        assert!(
          plan.animation_skeletons == baseline.animation_skeletons,
          "{name}/{order}: unrelated override changed the Toon repair"
        );
        let overlay = output.path().join(format!("{name}-{order}.vpk"));
        plan.write(&overlay, &[]).unwrap();
        let packed = VpkArchive::open(&overlay).unwrap();
        assert!(
          packed.extract_entry(skeleton).unwrap() == *expected,
          "{name}/{order}: packed repair changed"
        );
      } else {
        assert!(
          !plan.animation_skeletons.contains_key(skeleton),
          "{name}/{order}: affected or unsupported animation was accepted"
        );
      }
    }
  }
  for (path, hash) in case.vpks.iter().zip(source_hashes) {
    assert_eq!(
      Sha256::digest(fs::read(path).unwrap()),
      hash,
      "original mod changed"
    );
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_GT_VPK"]
fn owl_camera_repair_is_stable_with_unrelated_animation_overrides() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let vpk = PathBuf::from(std::env::var("DMM_GT_VPK").unwrap());
  let original = Sha256::digest(fs::read(&vpk).unwrap());
  let input = LocalizationModInput {
    mod_id: "563116".into(),
    vpks: vec![vpk.clone()],
  };
  let owl = "models/heroes_staging/grey_talon/grey_talon_owl.vmdl_c";
  let baseline = LocalizationOverlayPlan::build(&citadel, std::slice::from_ref(&input)).unwrap();
  let expected = &baseline.camera_models[owl];
  assert!(baseline.analysis.asset_repairs.iter().any(|repair| {
    repair.file_path == owl
      && matches!(repair.kind, asset_compatibility::RepairKind::CameraControls)
  }));
  let resources = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  let current = resources.game_bytes(owl).unwrap().unwrap();
  let (_, model, _) = decode_compiled_data(&current, owl).unwrap();
  let skeleton = model
    .get("m_vecNmSkeletonRefs")
    .unwrap()
    .as_array()
    .unwrap()[0]
    .as_str()
    .unwrap();
  let skeleton_path = resources::resource_path(skeleton).unwrap();
  let graph = animation_model_evidence::graphs(&model)
    .unwrap()
    .into_values()
    .next()
    .unwrap();
  let graph_path = resources::resource_path(&graph).unwrap();
  let output = TempDir::new().unwrap();
  for (name, path, bytes, allowed) in [
    (
      "unrelated_nm",
      "models/unrelated/idle.vnmclip_c".to_owned(),
      tests::compiled_resource(vec![(
        "m_skeleton".into(),
        Kv3Value::String("models/unrelated/rig.vnmskel".into()),
      )]),
      true,
    ),
    (
      "related_nm",
      "models/unrelated/idle.vnmclip_c".to_owned(),
      tests::compiled_resource(vec![(
        "m_skeleton".into(),
        Kv3Value::String(skeleton.to_owned()),
      )]),
      false,
    ),
    (
      "overridden_skeleton",
      skeleton_path.clone(),
      resources
        .game_bytes(&skeleton_path)
        .unwrap()
        .unwrap()
        .to_vec(),
      false,
    ),
    (
      "unknown_animation",
      "models/unrelated/idle.vanim_c".to_owned(),
      tests::compiled_resource(vec![]),
      false,
    ),
    (
      "overridden_graph",
      graph_path.clone(),
      resources.game_bytes(&graph_path).unwrap().unwrap().to_vec(),
      false,
    ),
    (
      "own_unrelated_nm",
      "models/unrelated/idle.vnmclip_c".to_owned(),
      tests::compiled_resource(vec![(
        "m_skeleton".into(),
        Kv3Value::String("models/unrelated/rig.vnmskel".into()),
      )]),
      false,
    ),
  ] {
    let archive = resources::tests::pack(output.path(), name, &[(&path, &bytes)]);
    let other = LocalizationModInput {
      mod_id: if name == "own_unrelated_nm" {
        input.mod_id.clone()
      } else {
        name.into()
      },
      vpks: vec![archive],
    };
    for (order, inputs) in [
      ("first", vec![input.clone(), other.clone()]),
      ("last", vec![other.clone(), input.clone()]),
    ] {
      let plan = LocalizationOverlayPlan::build(&citadel, &inputs).unwrap();
      if allowed {
        assert!(
          plan.camera_models.get(owl) == Some(expected),
          "{name}/{order}: unrelated animation suppressed the owl camera repair"
        );
        let overlay = output.path().join(format!("{name}-{order}.vpk"));
        plan.write(&overlay, &[]).unwrap();
        assert!(
          &VpkArchive::open(&overlay)
            .unwrap()
            .extract_entry(owl)
            .unwrap()
            == expected
        );
      } else {
        assert!(
          !plan.camera_models.contains_key(owl),
          "{name}/{order}: affected or unsupported animation permitted a camera repair"
        );
      }
    }
  }
  assert_eq!(Sha256::digest(fs::read(vpk).unwrap()), original);
}
