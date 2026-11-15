use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use kv_parser::localization::{LocalizationDocument, decode};
use vpk_parser::{VpkEntry, VpkParser};

#[derive(Default)]
struct Corpus {
    physical_files: usize,
    loose_files: usize,
    packed_files: usize,
    paths: BTreeSet<String>,
    encodings: BTreeMap<&'static str, usize>,
    failures: Vec<String>,
}

impl Corpus {
    fn check(&mut self, origin: &str, path: String, bytes: &[u8]) {
        let encoding = match bytes {
            [0xff, 0xfe, ..] => "UTF-16 LE BOM",
            [0xfe, 0xff, ..] => "UTF-16 BE BOM",
            [0xef, 0xbb, 0xbf, ..] => "UTF-8 BOM",
            _ => "UTF-8",
        };
        self.physical_files += 1;
        self.paths.insert(path);
        *self.encodings.entry(encoding).or_default() += 1;
        let text = match decode(bytes) {
            Ok(text) => text,
            Err(error) => {
                self.failures.push(format!("{origin}: decode: {error}"));
                return;
            }
        };
        let document = match LocalizationDocument::parse(&text) {
            Ok(document) => document,
            Err(error) => {
                self.failures
                    .push(format!("{origin}: strict parse: {error}"));
                return;
            }
        };
        let output = document.edit(&text, &[]);
        if output.as_bytes() != text.as_bytes() {
            self.failures.push(format!(
                "{origin}: no-edit output differs from decoded UTF-8 text"
            ));
        }
        if encoding.starts_with("UTF-8") && output.as_bytes() != bytes {
            self.failures.push(format!(
                "{origin}: no-edit output differs from original UTF-8 bytes"
            ));
        }
    }
}

fn directory_entries(path: &Path) -> Vec<PathBuf> {
    let mut entries: Vec<_> = fs::read_dir(path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()))
        .map(|entry| {
            entry
                .unwrap_or_else(|error| panic!("{}: {error}", path.display()))
                .path()
        })
        .collect();
    entries.sort();
    entries
}

fn scan_loose(root: &Path, directory: &Path, corpus: &mut Corpus) {
    for path in directory_entries(directory) {
        let metadata = fs::symlink_metadata(&path)
            .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        if metadata.is_dir() {
            scan_loose(root, &path, corpus);
        } else if metadata.is_file()
            && path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("txt"))
        {
            let bytes =
                fs::read(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
            let relative = path.strip_prefix(root).unwrap().to_str().unwrap();
            corpus.check(
                &path.display().to_string(),
                relative.to_ascii_lowercase(),
                &bytes,
            );
            corpus.loose_files += 1;
        }
    }
}

fn inline_data_start(archive: &Path) -> u64 {
    let mut header = [0; 12];
    File::open(archive)
        .and_then(|mut file| file.read_exact(&mut header))
        .unwrap_or_else(|error| panic!("{}: read header: {error}", archive.display()));
    let version = u32::from_le_bytes(header[4..8].try_into().unwrap());
    let tree_length = u32::from_le_bytes(header[8..12].try_into().unwrap());
    let header_length = if version >= 2 { 28 } else { 12 };
    header_length + u64::from(tree_length)
}

fn entry_bytes(archive: &Path, data_start: u64, entry: &VpkEntry, mut preload: Vec<u8>) -> Vec<u8> {
    assert_eq!(preload.len(), usize::from(entry.preload_bytes));
    if entry.entry_length == 0 {
        return preload;
    }
    let (source, offset) = if entry.archive_index == 0x7fff {
        (
            archive.to_path_buf(),
            data_start + u64::from(entry.entry_offset),
        )
    } else {
        let name = archive.file_name().unwrap().to_str().unwrap();
        let base = name.strip_suffix("_dir.vpk").unwrap();
        (
            archive.with_file_name(format!("{base}_{:03}.vpk", entry.archive_index)),
            u64::from(entry.entry_offset),
        )
    };
    let mut file = File::open(&source).unwrap_or_else(|error| {
        panic!(
            "{}!{}: {}: {error}",
            archive.display(),
            entry.full_path,
            source.display()
        )
    });
    let start = preload.len();
    preload.resize(start + entry.entry_length as usize, 0);
    file.seek(SeekFrom::Start(offset))
        .and_then(|_| file.read_exact(&mut preload[start..]))
        .unwrap_or_else(|error| {
            panic!(
                "{}!{}: read {} at {offset}: {error}",
                archive.display(),
                entry.full_path,
                source.display()
            )
        });
    preload
}

fn scan_archive(archive: &Path, corpus: &mut Corpus) {
    let entries = VpkParser::parse_directory_with_preload_from_file(archive)
        .unwrap_or_else(|error| panic!("{}: directory: {error}", archive.display()));
    let data_start = inline_data_start(archive);
    for (entry, preload) in entries {
        let path = entry.full_path.replace('\\', "/").to_ascii_lowercase();
        if !path.starts_with("resource/localization/") || !path.ends_with(".txt") {
            continue;
        }
        let bytes = entry_bytes(archive, data_start, &entry, preload);
        corpus.check(
            &format!("{}!{}", archive.display(), entry.full_path),
            path,
            &bytes,
        );
        corpus.packed_files += 1;
    }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL pointing to an installed game's citadel directory"]
fn installed_localization_strictly_parses_and_round_trips() {
    let citadel =
        PathBuf::from(std::env::var_os("DMM_REAL_CITADEL").expect("set DMM_REAL_CITADEL"));
    let core = citadel
        .parent()
        .expect("citadel must have a parent")
        .join("core");
    let mut corpus = Corpus::default();
    for root in [&citadel, &core] {
        assert!(root.is_dir(), "{}: missing game directory", root.display());
        let loose_before = corpus.loose_files;
        let packed_before = corpus.packed_files;
        let localization = root.join("resource/localization");
        match fs::metadata(&localization) {
            Ok(_) => scan_loose(root, &localization, &mut corpus),
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => panic!("{}: {error}", localization.display()),
        }
        let mut archives = 0;
        for path in directory_entries(root) {
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("_dir.vpk"))
            {
                scan_archive(&path, &mut corpus);
                archives += 1;
            }
        }
        assert!(
            archives > 0,
            "{}: no top-level *_dir.vpk archives",
            root.display()
        );
        println!(
            "{}: {} loose + {} packed localization files; {archives} VPK directories scanned",
            root.display(),
            corpus.loose_files - loose_before,
            corpus.packed_files - packed_before
        );
    }
    println!(
        "Localization corpus: {} physical files ({} loose, {} packed), {} distinct localization paths; encodings: {:?}",
        corpus.physical_files,
        corpus.loose_files,
        corpus.packed_files,
        corpus.paths.len(),
        corpus.encodings
    );
    assert!(
        corpus.failures.is_empty(),
        "{} localization failures:\n{}",
        corpus.failures.len(),
        corpus.failures.join("\n")
    );
    for required in [
        "resource/localization/citadel_main/citadel_main_english.txt",
        "resource/localization/citadel_vdata/accolades/accolades_english.txt",
        "resource/localization/items_english.txt",
    ] {
        assert!(corpus.paths.contains(required), "not visited: {required}");
    }
}
