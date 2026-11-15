use super::{normalize_resource_path, sanitize_relative};
use std::path::PathBuf;

#[test]
fn rejects_unsafe_resource_segments_on_every_platform() {
    for path in [
        "",
        "/root.txt",
        "a//b.txt",
        "a/",
        "a/./b.txt",
        "a/../b.txt",
        "a/con .txt",
        "a/b./c.txt",
        "a/b /c.txt",
        "a/b.txt.",
        "a/b.txt ",
        "a/.../c.txt",
        "a/...",
        "C:/file.txt",
        "a/C:/file.txt",
        "a/file.txt:stream",
        "a/\0b.txt",
        "a/\nb.txt",
        "a/\tb.txt",
        "a/\u{7f}b.txt",
        "a/\u{85}b.txt",
        "a\\..\\file.txt",
        "\\root.txt",
        "a\\\\b.txt",
    ] {
        assert_eq!(normalize_resource_path(path), None, "{path:?}");
        assert_eq!(sanitize_relative(path), None, "{path:?}");
    }
    let devices = ["con", "PRN", "Aux", "NUL"]
        .into_iter()
        .map(String::from)
        .chain((1..=9).flat_map(|digit| [format!("Com{digit}"), format!("lPt{digit}")]));
    for device in devices {
        for path in [
            device.clone(),
            format!("a/{device}.txt"),
            format!("a/{device} .txt"),
            format!("{device}.x/y"),
        ] {
            assert_eq!(normalize_resource_path(&path), None, "{path:?}");
            assert_eq!(sanitize_relative(&path), None, "{path:?}");
        }
    }
}

#[test]
fn accepts_normal_names_and_normalizes_only_separators() {
    for (path, expected) in [
        (
            "resource/localization/English.txt",
            "resource/localization/English.txt",
        ),
        ("Models\\Hero\\Skin.vmdl_c", "Models/Hero/Skin.vmdl_c"),
        ("scripts/Com10.vdata_c", "scripts/Com10.vdata_c"),
        ("a/lpt0.txt", "a/lpt0.txt"),
        ("a/console.txt", "a/console.txt"),
        ("éé/中文.txt", "éé/中文.txt"),
    ] {
        assert_eq!(normalize_resource_path(path).as_deref(), Some(expected));
        assert_eq!(sanitize_relative(path), Some(PathBuf::from(expected)));
    }
}
