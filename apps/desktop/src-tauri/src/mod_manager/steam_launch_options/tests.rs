use super::*;

fn config(args: &str) -> String {
  format!(
    r#"// Keep this comment: 日本語
"UserLocalConfigStore"
{{ "Software" {{ "Valve" {{ "Steam" {{ "apps"
{{
  "1422450" {{ "LaunchOptions" "{args}" "Playtime" "123" }}
  "1234" {{ "LaunchOptions" "-condebug" }}
}}
}} }} }} }}
"#
  )
}

#[test]
fn removes_only_the_exact_flag_and_preserves_other_arguments() {
  for (args, expected) in [
    ("-condebug", ""),
    ("-condebug -novid", "-novid"),
    ("-novid -condebug", "-novid"),
    ("-novid -condebug +exec autoexec", "-novid +exec autoexec"),
    ("-condebug -condebug -novid -condebug", "-novid"),
    (
      r#"MANGOHUD=1 %command% -condebug +exec "my config.cfg""#,
      r#"MANGOHUD=1 %command% +exec "my config.cfg""#,
    ),
    ("-CONDEBUG -novid", "-novid"),
    ("\"-condebug\" -novid", "-novid"),
  ] {
    assert_eq!(remove_condebug(args).as_deref(), Some(expected), "{args}");
  }
  for args in [
    "",
    "-novid",
    "-condebuglog",
    r#"+echo "keep -condebug inside text""#,
    "CONDEBUG=-condebug %command%",
  ] {
    assert_eq!(remove_condebug(args), None, "{args}");
  }
}

#[test]
fn preserves_the_rest_of_the_steam_file_exactly() {
  let original = config("-novid -condebug +exec \\\"my config.cfg\\\"");
  let expected = config("-novid +exec \\\"my config.cfg\\\"");
  assert_eq!(cleaned_config(&original).unwrap(), Some(expected));
}

#[test]
fn preserves_large_steam_cache_values() {
  let cache = format!("\"LargeCache\" \"{}\"\n", "x".repeat(4096));
  let original = format!("{cache}{}", config("-condebug -novid"));
  let expected = format!("{cache}{}", config("-novid"));
  assert_eq!(cleaned_config(&original).unwrap(), Some(expected));
}

#[test]
fn leaves_configs_without_the_flag_unchanged() {
  assert_eq!(cleaned_config(&config("-novid")).unwrap(), None);
  assert_eq!(cleaned_config("\"UserLocalConfigStore\" {}").unwrap(), None);
}

#[test]
fn does_not_write_while_steam_is_running() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("localconfig.vdf");
  let original = config("-condebug -novid");
  fs::write(&path, &original).unwrap();
  assert!(matches!(
    clear_condebug(&path, true),
    Err(Error::SteamRunning)
  ));
  assert_eq!(fs::read_to_string(&path).unwrap(), original);
}

#[test]
fn clears_the_saved_option_when_steam_is_closed() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("localconfig.vdf");
  fs::write(&path, config("-condebug -novid")).unwrap();
  clear_condebug(&path, false).unwrap();
  assert_eq!(fs::read_to_string(&path).unwrap(), config("-novid"));
  clear_condebug(&path, false).unwrap();
}

#[test]
fn allows_disabling_with_steam_open_when_no_cleanup_is_needed() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("localconfig.vdf");
  clear_condebug(&path, true).unwrap();
  let original = config("-novid");
  fs::write(&path, &original).unwrap();
  clear_condebug(&path, true).unwrap();
  assert_eq!(fs::read_to_string(path).unwrap(), original);
}

#[test]
fn leaves_malformed_configs_untouched() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("localconfig.vdf");
  let original = "\"UserLocalConfigStore\" {";
  fs::write(&path, original).unwrap();
  assert!(clear_condebug(&path, false).is_err());
  assert_eq!(fs::read_to_string(path).unwrap(), original);
}
