use vpk_parser::VpkEntry;

pub fn is_ignored_readme(entry: &VpkEntry) -> bool {
    entry.filename.eq_ignore_ascii_case("readme")
}
