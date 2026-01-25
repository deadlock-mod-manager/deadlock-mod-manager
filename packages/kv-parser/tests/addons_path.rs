mod common;

use kv_parser::{
    DiffApplicator, DiffGenerator, KeyValuesObject, KeyValuesValue, KvDocument, ParseOptions,
    Parser, SerializeOptions, Serializer,
};

fn get_search_paths_game(data: &KeyValuesObject) -> Option<&KeyValuesValue> {
    let game_info = data.get("GameInfo")?;
    if let KeyValuesValue::Object(obj) = game_info {
        let file_system = obj.get("FileSystem")?;
        if let KeyValuesValue::Object(fs_obj) = file_system {
            let search_paths = fs_obj.get("SearchPaths")?;
            if let KeyValuesValue::Object(sp_obj) = search_paths {
                return sp_obj.get("Game");
            }
        }
    }
    None
}

fn set_search_paths_game(
    data: &mut KeyValuesObject,
    new_game_value: KeyValuesValue,
) -> Result<(), &'static str> {
    let game_info = data.get_mut("GameInfo").ok_or("GameInfo not found")?;
    if let KeyValuesValue::Object(obj) = game_info {
        let file_system = obj.get_mut("FileSystem").ok_or("FileSystem not found")?;
        if let KeyValuesValue::Object(fs_obj) = file_system {
            let search_paths = fs_obj
                .get_mut("SearchPaths")
                .ok_or("SearchPaths not found")?;
            if let KeyValuesValue::Object(sp_obj) = search_paths {
                sp_obj.insert("Game".to_string(), new_game_value);
                return Ok(());
            }
        }
    }
    Err("Failed to set Game value")
}

#[test]
fn test_modify_addons_path_simple() {
    let content = common::load_gameinfo();
    let result =
        Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");
    let mut data = result.data;

    let game_paths = get_search_paths_game(&data).expect("Game paths should exist");
    if let KeyValuesValue::Array(arr) = game_paths {
        assert!(arr
            .iter()
            .any(|v| matches!(v, KeyValuesValue::String(s) if s == "citadel/addons")));
    }

    let new_game_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/profile1".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    set_search_paths_game(&mut data, new_game_paths).expect("Should set new paths");

    let game_paths = get_search_paths_game(&data).expect("Game paths should exist");
    if let KeyValuesValue::Array(arr) = game_paths {
        let has_profile1 = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s == "citadel/addons/profile1"
            } else {
                false
            }
        });
        assert!(has_profile1, "Should have new profile path");
    } else {
        panic!("Game should be an array");
    }
}

#[test]
fn test_round_trip_with_modified_path() {
    let content = common::load_gameinfo();
    let result =
        Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");
    let mut data = result.data;

    let new_game_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/my_profile".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    set_search_paths_game(&mut data, new_game_paths).expect("Should set new paths");

    let serializer = Serializer::new(SerializeOptions::default());
    let serialized = serializer.serialize_data(&data).expect("Should serialize");

    let result2 = Parser::parse(&serialized, ParseOptions::default()).expect("Should re-parse");

    let game_paths =
        get_search_paths_game(&result2.data).expect("Game paths should exist after round-trip");
    if let KeyValuesValue::Array(arr) = game_paths {
        let has_my_profile = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s == "citadel/addons/my_profile"
            } else {
                false
            }
        });
        assert!(
            has_my_profile,
            "Modified path should persist after round-trip"
        );
    } else {
        panic!("Game should be an array after round-trip");
    }
}

#[test]
fn test_modify_path_using_diff() {
    let content = common::load_gameinfo();
    let result =
        Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");
    let source = result.data.clone();

    let mut target = result.data;
    let new_game_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/diff_profile".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    set_search_paths_game(&mut target, new_game_paths).expect("Should set new paths");

    let diff = DiffGenerator::generate_diff(&source, &target);
    assert!(!diff.changes.is_empty(), "Diff should have changes");

    let applied = DiffApplicator::apply_to_data(&source, &diff).expect("Should apply diff");

    let game_paths = get_search_paths_game(&applied).expect("Game paths should exist");
    if let KeyValuesValue::Array(arr) = game_paths {
        let has_diff_profile = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s == "citadel/addons/diff_profile"
            } else {
                false
            }
        });
        assert!(has_diff_profile, "Diff-applied path should be present");
    } else {
        panic!("Game should be an array");
    }
}

#[test]
fn test_path_format_no_extra_quotes() {
    let content = common::load_gameinfo();
    let result =
        Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");
    let mut data = result.data;

    let new_game_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/test_profile".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    set_search_paths_game(&mut data, new_game_paths).expect("Should set new paths");

    let serializer = Serializer::new(SerializeOptions::default());
    let serialized = serializer.serialize_data(&data).expect("Should serialize");

    assert!(
        serialized.contains("citadel/addons/test_profile"),
        "Serialized should contain the path"
    );
    assert!(
        !serialized.contains("\"citadel/addons/test_profile\""),
        "Path should not be quoted (no spaces)"
    );
}

#[test]
fn test_switch_profile_folder() {
    let content = common::load_gameinfo();
    let result =
        Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");
    let mut data = result.data;

    let profiles = ["default", "competitive", "casual"];

    for profile in profiles {
        let new_game_paths = KeyValuesValue::Array(vec![
            KeyValuesValue::String(format!("citadel/addons/{}", profile)),
            KeyValuesValue::String("citadel".to_string()),
            KeyValuesValue::String("core".to_string()),
        ]);
        set_search_paths_game(&mut data, new_game_paths).expect("Should set new paths");

        let game_paths = get_search_paths_game(&data).expect("Game paths should exist");
        if let KeyValuesValue::Array(arr) = game_paths {
            let expected_path = format!("citadel/addons/{}", profile);
            let has_profile = arr.iter().any(|v| {
                if let KeyValuesValue::String(s) = v {
                    *s == expected_path
                } else {
                    false
                }
            });
            assert!(has_profile, "Should have path for profile: {}", profile);
        } else {
            panic!("Game should be an array");
        }
    }
}

#[test]
fn test_revert_to_vanilla_path() {
    let content = common::load_gameinfo();
    let result =
        Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");
    let mut data = result.data;

    let modded_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/some_profile".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    set_search_paths_game(&mut data, modded_paths).expect("Should set modded paths");

    let vanilla_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    set_search_paths_game(&mut data, vanilla_paths).expect("Should revert to vanilla paths");

    let game_paths = get_search_paths_game(&data).expect("Game paths should exist");
    if let KeyValuesValue::Array(arr) = game_paths {
        let has_vanilla = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s == "citadel/addons"
            } else {
                false
            }
        });
        assert!(has_vanilla, "Should have vanilla addons path");

        let has_profile = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s.contains("some_profile")
            } else {
                false
            }
        });
        assert!(!has_profile, "Should not have profile path after revert");
    } else {
        panic!("Game should be an array");
    }
}

#[test]
fn test_document_api_set_path() {
    let content = common::load_gameinfo();
    let mut doc = KvDocument::new();
    doc.load_from_string(&content)
        .expect("Failed to load gameinfo.gi");

    let new_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/doc_api_test".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    doc.set("GameInfo.FileSystem.SearchPaths.Game", new_paths)
        .expect("Should set via document API");

    let value = doc
        .get("GameInfo.FileSystem.SearchPaths.Game")
        .expect("Should get the value back");
    if let KeyValuesValue::Array(arr) = value {
        let has_new_path = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s == "citadel/addons/doc_api_test"
            } else {
                false
            }
        });
        assert!(has_new_path, "Document API should set the new path");
    } else {
        panic!("Game should be an array");
    }
}

#[test]
fn test_document_round_trip_with_modification() {
    let content = common::load_gameinfo();
    let mut doc = KvDocument::new();
    doc.load_from_string(&content)
        .expect("Failed to load gameinfo.gi");

    let new_paths = KeyValuesValue::Array(vec![
        KeyValuesValue::String("citadel/addons/round_trip_test".to_string()),
        KeyValuesValue::String("citadel".to_string()),
        KeyValuesValue::String("core".to_string()),
    ]);
    doc.set("GameInfo.FileSystem.SearchPaths.Game", new_paths)
        .expect("Should set via document API");

    let serialized = doc.serialize().expect("Should serialize");

    let mut doc2 = KvDocument::new();
    doc2.load_from_string(&serialized)
        .expect("Should load serialized content");

    let value = doc2
        .get("GameInfo.FileSystem.SearchPaths.Game")
        .expect("Should get the value back");
    if let KeyValuesValue::Array(arr) = value {
        let has_new_path = arr.iter().any(|v| {
            if let KeyValuesValue::String(s) = v {
                s == "citadel/addons/round_trip_test"
            } else {
                false
            }
        });
        assert!(has_new_path, "Modification should survive round-trip");
    } else {
        panic!("Game should be an array after round-trip");
    }
}
