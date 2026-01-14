use std::path::PathBuf;

pub fn get_test_data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("data")
}

pub fn load_gameinfo() -> String {
    let path = get_test_data_dir().join("gameinfo.gi");
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read gameinfo.gi from {:?}: {}", path, e))
}
