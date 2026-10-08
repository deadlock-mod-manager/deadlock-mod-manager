use super::*;
use crate::mod_manager::perf_config::patch::test_support::{applies, entry, path};
use crate::mod_manager::perf_config::types::{PerfConfigDefinition, ResolvedCounts};

fn preset_request() -> PerfApplyRequest {
  PerfApplyRequest {
    config_id: "preset:optimizationlock".to_string(),
    name: "Sqooky's config, tweaked".to_string(),
    source: PerfConfigSource::Preset {
      id: "optimizationlock".to_string(),
    },
    overrides: vec![
      EntryOverride {
        path: path("ConVars/fps_max"),
        action: OverrideAction::Set {
          value: "240".to_string(),
        },
      },
      EntryOverride {
        path: path("ConVars/r_aspectratio"),
        action: OverrideAction::Omit,
      },
      EntryOverride {
        path: path("ConVars/citadel_hideout_ball_show_juggle_fx"),
        action: OverrideAction::Enable,
      },
    ],
    include_engine_sections: true,
  }
}

fn inline_request(entries: Vec<ConfigEntry>) -> PerfApplyRequest {
  PerfApplyRequest {
    config_id: "user:1".to_string(),
    name: "Мой конфиг".to_string(),
    source: PerfConfigSource::Inline {
      definition: PerfConfigDefinition {
        id: "user:1".to_string(),
        name: "Мой конфиг".to_string(),
        entries,
      },
    },
    overrides: Vec::new(),
    include_engine_sections: false,
  }
}

/// A code for an arbitrary JSON payload, bypassing `encode`'s checks.
fn code_for_json(json: &[u8]) -> String {
  let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
  encoder.write_all(json).unwrap();
  format!(
    "{PREFIX}1:{}",
    URL_SAFE_NO_PAD.encode(encoder.finish().unwrap())
  )
}

#[test]
fn presets_travel_by_id_with_overrides() {
  let request = preset_request();
  let code = encode(&request).unwrap();
  assert!(code.starts_with("dmm-perf:1:"));
  assert!(
    code["dmm-perf:1:".len()..]
      .chars()
      .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_'),
    "URL-safe without padding: {code}"
  );
  assert!(
    code.len() < 300,
    "a preset code stays short: {}",
    code.len()
  );

  let decoded = decode(&code).unwrap();
  assert_eq!(decoded.name, request.name);
  assert_eq!(decoded.preset_id.as_deref(), Some("optimizationlock"));
  assert!(decoded.entries.is_empty());
  assert_eq!(decoded.overrides, request.overrides);
  assert!(decoded.include_engine_sections);
}

#[test]
fn inline_configs_carry_their_entries() {
  let entries = vec![
    entry("ConVars/r_ssao", Some("0")),
    entry("ConVars/rate/max", Some("1000000")),
    entry("ConVars/sv_minrate", None),
    entry("SceneSystem/CSMCascadeResolution", Some("512")),
    entry("ConVars/sc_clutter_enable", Some("")),
  ];
  let code = encode(&inline_request(entries.clone())).unwrap();
  let decoded = decode(&code).unwrap();
  assert_eq!(decoded.name, "Мой конфиг");
  assert_eq!(decoded.preset_id, None);
  assert_eq!(decoded.entries, entries);
  assert!(decoded.overrides.is_empty());
  assert!(!decoded.include_engine_sections);
}

#[test]
fn decoding_tolerates_chat_wrapping_and_padding() {
  let code = encode(&preset_request()).unwrap();
  let (prefix, data) = code.split_at("dmm-perf:1:".len());
  let wrapped: String = data
    .chars()
    .enumerate()
    .flat_map(|(index, char)| {
      let wrap = (index > 0 && index % 20 == 0).then_some('\n');
      wrap.into_iter().chain(std::iter::once(char))
    })
    .collect();
  let pasted = format!("  {}{wrapped}==\r\n", prefix.to_uppercase());
  assert_eq!(
    decode(&pasted).unwrap().preset_id.as_deref(),
    Some("optimizationlock")
  );
}

#[test]
fn encoding_refuses_paths_that_cant_round_trip() {
  let request = inline_request(vec![
    entry("ConVars/a", Some("1")),
    ConfigEntry {
      path: vec!["ConVars".to_string(), "a/b".to_string()],
      value: Some("1".to_string()),
    },
  ]);
  assert!(encode(&request).is_err());
  let request = inline_request(vec![entry("ConVars/a", Some("say \"hi\""))]);
  assert!(
    encode(&request).is_err(),
    "quotes can't be written to gameinfo.gi"
  );
}

#[test]
fn rejects_damaged_hostile_and_oversized_codes() {
  let too_many: Vec<(String, Option<String>)> = (0..=MAX_ITEMS)
    .map(|index| (format!("ConVars/k{index}"), Some("1".to_string())))
    .collect();
  let too_many = serde_json::to_vec(&serde_json::json!({ "n": "x", "e": too_many })).unwrap();
  let bomb = format!("{{\"n\":\"{}\"}}", " ".repeat(3 * 1024 * 1024));

  let cases: Vec<(&str, String)> = vec![
    ("empty", String::new()),
    ("prefix only", "dmm-perf:".to_string()),
    ("no data", "dmm-perf:1".to_string()),
    ("wrong prefix", "dmm-perv:1:abc".to_string()),
    ("bad base64", "dmm-perf:1:!!!*".to_string()),
    (
      "not deflate",
      format!("dmm-perf:1:{}", URL_SAFE_NO_PAD.encode(b"plain text")),
    ),
    ("not json", code_for_json(b"r_ssao 0")),
    ("wrong shape", code_for_json(br#"{"n": 5}"#)),
    ("no settings", code_for_json(br#"{"n": "nothing"}"#)),
    (
      "quote in path",
      code_for_json(br#"{"n":"x","e":[["ConVars/a\"b","1"]]}"#),
    ),
    (
      "brace in path",
      code_for_json(br#"{"n":"x","e":[["ConVars/{","1"]]}"#),
    ),
    (
      "empty segment",
      code_for_json(br#"{"n":"x","e":[["ConVars//a","1"]]}"#),
    ),
    (
      "newline in value",
      code_for_json(br#"{"n":"x","e":[["ConVars/a","1\n}"]]}"#),
    ),
    (
      "quote in value",
      code_for_json(br#"{"n":"x","e":[["ConVars/a","\"1"]]}"#),
    ),
    (
      "bad override",
      code_for_json(br#"{"n":"x","o":[["ConVars/a","z"]]}"#),
    ),
    (
      "set without value",
      code_for_json(br#"{"n":"x","o":[["ConVars/a","s"]]}"#),
    ),
    (
      "bad preset id",
      code_for_json(br#"{"n":"x","p":"../../etc"}"#),
    ),
    (
      "control in name",
      code_for_json(b"{\"n\":\"a\\u0007\",\"p\":\"x\"}"),
    ),
    ("too many entries", code_for_json(&too_many)),
    ("decompression bomb", code_for_json(bomb.as_bytes())),
    (
      "too long",
      format!("dmm-perf:1:{}", "A".repeat(MAX_CODE_BYTES)),
    ),
  ];
  for (label, code) in cases {
    assert!(decode(&code).is_err(), "{label} should be rejected");
  }

  match decode("dmm-perf:2:abc") {
    Err(Error::PerformanceConfig(message)) => assert!(message.contains("newer version")),
    other => panic!(
      "expected a version error, got {:?}",
      other.map(|share| share.name)
    ),
  }
}

fn resolved(joined: &str, value: Option<&str>, status: EntryStatus) -> ResolvedEntry {
  ResolvedEntry {
    status,
    ..applies(joined, value)
  }
}

#[test]
fn snippet_lists_written_entries_by_section() {
  let config = ResolvedConfig {
    entries: vec![
      resolved(
        "SceneSystem/CSMCascadeResolution",
        Some("512"),
        EntryStatus::Applies,
      ),
      resolved("ConVars/r_ssao", Some("0"), EntryStatus::Applies),
      resolved("ConVars/fps_max", Some("400"), EntryStatus::Unchanged),
      resolved("ConVars/rate/max", Some("2000000"), EntryStatus::Applies),
      resolved("ConVars/sv_minrate", None, EntryStatus::Applies),
      resolved("ConVars/r_shadows", Some("0"), EntryStatus::Blocked),
      resolved(
        "NetworkSystem/BetaUniverse/FakeLag",
        Some("0"),
        EntryStatus::EngineSection,
      ),
      resolved("ConVars/rate/min", Some("1"), EntryStatus::Applies),
    ],
    counts: ResolvedCounts::default(),
    cut_score: 0.0,
    rev: String::new(),
  };
  assert_eq!(
    snippet(&config),
    "ConVars\n{\n\t\"r_ssao\"\t\t\"0\"\n\t\"rate\"\n\t{\n\t\t\"max\"\t\t\"2000000\"\n\t\t\"min\"\t\t\"1\"\n\t}\n\t// \"sv_minrate\"\n}\n\nSceneSystem\n{\n\t\"CSMCascadeResolution\"\t\t\"512\"\n}\n"
  );
  assert_eq!(
    snippet(&ResolvedConfig {
      entries: Vec::new(),
      ..config
    }),
    ""
  );
}
