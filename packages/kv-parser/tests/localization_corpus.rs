use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use kv_parser::localization::{LocalizationDocument, decode};

#[derive(Default)]
struct Corpus {
    physical_files: usize,
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
        }
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
        let before = corpus.physical_files;
        let localization = root.join("resource/localization");
        match fs::metadata(&localization) {
            Ok(_) => scan_loose(root, &localization, &mut corpus),
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => panic!("{}: {error}", localization.display()),
        }
        println!(
            "{}: {} loose localization files",
            root.display(),
            corpus.physical_files - before
        );
    }
    println!(
        "Localization corpus: {} loose files, {} distinct localization paths; encodings: {:?}",
        corpus.physical_files,
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
    ] {
        assert!(corpus.paths.contains(required), "not visited: {required}");
    }
}
