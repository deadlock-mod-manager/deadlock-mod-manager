use kv_parser::{DiffApplicator, DocumentDiff, ParseOptions, Parser, Serializer};
use serde_json;

#[test]
fn test_replace_array_in_gameinfo() {
    let gameinfo_content = r#"
"GameInfo"
{
    "FileSystem"
    {
        "SearchPaths"
        {
            Game                citadel
            Game                core
        }
    }
}
"#;

    let parse_result = Parser::parse(gameinfo_content, ParseOptions::default())
        .expect("Failed to parse gameinfo.gi");

    let patch_json = r#"{
        "changes": [
            {
                "op": "replace",
                "path": "GameInfo.FileSystem.SearchPaths.Game",
                "oldValue": ["citadel", "core"],
                "newValue": ["citadel/addons", "citadel", "core"]
            }
        ]
    }"#;

    let diff: DocumentDiff = serde_json::from_str(patch_json).expect("Failed to parse patch JSON");

    let patched_ast =
        DiffApplicator::apply_to_ast(&parse_result.ast, &diff).expect("Failed to apply patch");

    let patched_content = Serializer::serialize_ast(&patched_ast);

    println!("Patched content:\n{}", patched_content);

    assert!(
        patched_content.contains("citadel/addons"),
        "Should contain citadel/addons"
    );
    assert!(
        patched_content.contains("citadel"),
        "Should contain citadel"
    );
    assert!(patched_content.contains("core"), "Should contain core");

    let reparsed = Parser::parse(&patched_content, ParseOptions::default())
        .expect("Failed to reparse patched content");

    if let Some(kv_parser::KeyValuesValue::Object(game_info)) = reparsed.data.get("GameInfo") {
        if let Some(kv_parser::KeyValuesValue::Object(file_system)) = game_info.get("FileSystem") {
            if let Some(kv_parser::KeyValuesValue::Object(search_paths)) =
                file_system.get("SearchPaths")
            {
                if let Some(kv_parser::KeyValuesValue::Array(game_paths)) = search_paths.get("Game")
                {
                    assert_eq!(game_paths.len(), 3, "Should have 3 Game entries");

                    if let kv_parser::KeyValuesValue::String(s) = &game_paths[0] {
                        assert_eq!(s, "citadel/addons");
                    } else {
                        panic!("First Game entry should be citadel/addons");
                    }

                    if let kv_parser::KeyValuesValue::String(s) = &game_paths[1] {
                        assert_eq!(s, "citadel");
                    } else {
                        panic!("Second Game entry should be citadel");
                    }

                    if let kv_parser::KeyValuesValue::String(s) = &game_paths[2] {
                        assert_eq!(s, "core");
                    } else {
                        panic!("Third Game entry should be core");
                    }
                } else {
                    panic!("Game should be an array");
                }
            } else {
                panic!("SearchPaths should exist");
            }
        } else {
            panic!("FileSystem should exist");
        }
    } else {
        panic!("GameInfo should exist");
    }
}

#[test]
fn test_replace_array_back_to_vanilla() {
    let gameinfo_content = r#"
"GameInfo"
{
    "FileSystem"
    {
        "SearchPaths"
        {
            Game                citadel/addons
            Game                citadel
            Game                core
        }
    }
}
"#;

    let parse_result = Parser::parse(gameinfo_content, ParseOptions::default())
        .expect("Failed to parse gameinfo.gi");

    let patch_json = r#"{
        "changes": [
            {
                "op": "replace",
                "path": "GameInfo.FileSystem.SearchPaths.Game",
                "oldValue": ["citadel/addons", "citadel", "core"],
                "newValue": ["citadel", "core"]
            }
        ]
    }"#;

    let diff: DocumentDiff = serde_json::from_str(patch_json).expect("Failed to parse patch JSON");

    let patched_ast =
        DiffApplicator::apply_to_ast(&parse_result.ast, &diff).expect("Failed to apply patch");

    let patched_content = Serializer::serialize_ast(&patched_ast);

    println!("Patched content:\n{}", patched_content);

    assert!(
        !patched_content.contains("citadel/addons"),
        "Should not contain citadel/addons"
    );
    assert!(
        patched_content.contains("citadel"),
        "Should contain citadel"
    );
    assert!(patched_content.contains("core"), "Should contain core");

    let reparsed = Parser::parse(&patched_content, ParseOptions::default())
        .expect("Failed to reparse patched content");

    if let Some(kv_parser::KeyValuesValue::Object(game_info)) = reparsed.data.get("GameInfo") {
        if let Some(kv_parser::KeyValuesValue::Object(file_system)) = game_info.get("FileSystem") {
            if let Some(kv_parser::KeyValuesValue::Object(search_paths)) =
                file_system.get("SearchPaths")
            {
                if let Some(kv_parser::KeyValuesValue::Array(game_paths)) = search_paths.get("Game")
                {
                    assert_eq!(game_paths.len(), 2, "Should have 2 Game entries");

                    if let kv_parser::KeyValuesValue::String(s) = &game_paths[0] {
                        assert_eq!(s, "citadel");
                    } else {
                        panic!("First Game entry should be citadel");
                    }

                    if let kv_parser::KeyValuesValue::String(s) = &game_paths[1] {
                        assert_eq!(s, "core");
                    } else {
                        panic!("Second Game entry should be core");
                    }
                } else {
                    panic!("Game should be an array");
                }
            } else {
                panic!("SearchPaths should exist");
            }
        } else {
            panic!("FileSystem should exist");
        }
    } else {
        panic!("GameInfo should exist");
    }
}
