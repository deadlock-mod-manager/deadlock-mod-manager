mod common;

use kv_parser::{KvDocument, KeyValuesValue, ParseOptions, Parser};

#[test]
fn test_parse_gameinfo_structure() {
    let content = common::load_gameinfo();
    let result = Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");

    assert!(result.data.contains_key("GameInfo"), "Root 'GameInfo' key should exist");

    let game_info = result.data.get("GameInfo").expect("GameInfo should exist");
    if let KeyValuesValue::Object(obj) = game_info {
        assert!(obj.contains_key("game"), "GameInfo should have 'game' key");
        assert!(obj.contains_key("title"), "GameInfo should have 'title' key");

        if let Some(KeyValuesValue::String(game)) = obj.get("game") {
            assert_eq!(game, "citadel", "game should be 'citadel'");
        } else {
            panic!("'game' should be a string");
        }

        if let Some(KeyValuesValue::String(title)) = obj.get("title") {
            assert_eq!(title, "Citadel", "title should be 'Citadel'");
        } else {
            panic!("'title' should be a string");
        }
    } else {
        panic!("GameInfo should be an object");
    }
}

#[test]
fn test_parse_nested_filesystem_section() {
    let content = common::load_gameinfo();
    let result = Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");

    let game_info = result.data.get("GameInfo").expect("GameInfo should exist");
    if let KeyValuesValue::Object(obj) = game_info {
        assert!(obj.contains_key("FileSystem"), "GameInfo should have 'FileSystem' key");

        let file_system = obj.get("FileSystem").expect("FileSystem should exist");
        assert!(matches!(file_system, KeyValuesValue::Object(_)), "FileSystem should be an object");
    } else {
        panic!("GameInfo should be an object");
    }
}

#[test]
fn test_parse_search_paths() {
    let content = common::load_gameinfo();
    let result = Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");

    let game_info = result.data.get("GameInfo").expect("GameInfo should exist");
    if let KeyValuesValue::Object(obj) = game_info {
        let file_system = obj.get("FileSystem").expect("FileSystem should exist");
        if let KeyValuesValue::Object(fs_obj) = file_system {
            assert!(fs_obj.contains_key("SearchPaths"), "FileSystem should have 'SearchPaths' key");

            let search_paths = fs_obj.get("SearchPaths").expect("SearchPaths should exist");
            assert!(matches!(search_paths, KeyValuesValue::Object(_)), "SearchPaths should be an object");
        } else {
            panic!("FileSystem should be an object");
        }
    } else {
        panic!("GameInfo should be an object");
    }
}

#[test]
fn test_parse_convars_section() {
    let content = common::load_gameinfo();
    let result = Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");

    let game_info = result.data.get("GameInfo").expect("GameInfo should exist");
    if let KeyValuesValue::Object(obj) = game_info {
        assert!(obj.contains_key("ConVars"), "GameInfo should have 'ConVars' key");

        let convars = obj.get("ConVars").expect("ConVars should exist");
        assert!(matches!(convars, KeyValuesValue::Object(_)), "ConVars should be an object");
    } else {
        panic!("GameInfo should be an object");
    }
}

#[test]
fn test_round_trip_parsing() {
    let content = common::load_gameinfo();
    let mut doc = KvDocument::new();
    doc.load_from_string(&content).expect("Failed to load gameinfo.gi");

    let serialized = doc.serialize().expect("Failed to serialize");
    let mut doc2 = KvDocument::new();
    doc2.load_from_string(&serialized).expect("Failed to re-parse serialized content");

    assert!(doc2.get("GameInfo").is_some(), "Re-parsed document should have GameInfo");
}

#[test]
fn test_search_paths_duplicate_keys_as_arrays() {
    let content = common::load_gameinfo();
    let result = Parser::parse(&content, ParseOptions::default()).expect("Failed to parse gameinfo.gi");

    let game_info = result.data.get("GameInfo").expect("GameInfo should exist");
    if let KeyValuesValue::Object(obj) = game_info {
        let file_system = obj.get("FileSystem").expect("FileSystem should exist");
        if let KeyValuesValue::Object(fs_obj) = file_system {
            let search_paths = fs_obj.get("SearchPaths").expect("SearchPaths should exist");
            if let KeyValuesValue::Object(sp_obj) = search_paths {
                let game_paths = sp_obj.get("Game").expect("SearchPaths should have 'Game' key");
                
                if let KeyValuesValue::Array(arr) = game_paths {
                    assert!(arr.len() >= 2, "Game should have at least 2 entries (duplicate keys)");
                    
                    let has_addons = arr.iter().any(|v| {
                        if let KeyValuesValue::String(s) = v {
                            s == "citadel/addons"
                        } else {
                            false
                        }
                    });
                    assert!(has_addons, "Game paths should include 'citadel/addons'");
                    
                    let has_citadel = arr.iter().any(|v| {
                        if let KeyValuesValue::String(s) = v {
                            s == "citadel"
                        } else {
                            false
                        }
                    });
                    assert!(has_citadel, "Game paths should include 'citadel'");
                } else {
                    panic!("Game should be an array (duplicate keys)");
                }
            } else {
                panic!("SearchPaths should be an object");
            }
        } else {
            panic!("FileSystem should be an object");
        }
    } else {
        panic!("GameInfo should be an object");
    }
}

#[test]
fn test_round_trip_preserves_search_paths() {
    let content = common::load_gameinfo();
    let mut doc = KvDocument::new();
    doc.load_from_string(&content).expect("Failed to load gameinfo.gi");

    let serialized = doc.serialize().expect("Failed to serialize");
    let result = Parser::parse(&serialized, ParseOptions::default()).expect("Failed to re-parse");

    let game_info = result.data.get("GameInfo").expect("GameInfo should exist");
    if let KeyValuesValue::Object(obj) = game_info {
        let file_system = obj.get("FileSystem").expect("FileSystem should exist");
        if let KeyValuesValue::Object(fs_obj) = file_system {
            let search_paths = fs_obj.get("SearchPaths").expect("SearchPaths should exist");
            if let KeyValuesValue::Object(sp_obj) = search_paths {
                let game_paths = sp_obj.get("Game").expect("SearchPaths should have 'Game' key");
                
                if let KeyValuesValue::Array(arr) = game_paths {
                    assert!(arr.len() >= 2, "Game array should be preserved after round-trip");
                } else {
                    panic!("Game should be an array after round-trip");
                }
            } else {
                panic!("SearchPaths should be an object");
            }
        } else {
            panic!("FileSystem should be an object");
        }
    } else {
        panic!("GameInfo should be an object");
    }
}

