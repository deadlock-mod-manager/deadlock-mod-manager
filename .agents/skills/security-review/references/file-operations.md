# File Operations Security

Covers path traversal, archive extraction (ZIP slip), symlink attacks, and filesystem
operations — the **primary attack vector** for a mod manager handling untrusted archives.

## Path Traversal

### Vulnerable Patterns

```rust
// VULNERABLE: User-controlled filename appended to base path
fn install_mod(base: &Path, filename: &str) -> io::Result<()> {
    let dest = base.join(filename); // filename could be "../../etc/cron.d/evil"
    std::fs::write(dest, data)?;
    Ok(())
}

// VULNERABLE: No canonicalization check
fn read_mod_config(mod_dir: &Path, config_name: &str) -> io::Result<String> {
    let path = mod_dir.join(config_name);
    std::fs::read_to_string(path)
}

// VULNERABLE: Checking before canonicalization (TOCTOU)
fn safe_read(base: &Path, user_path: &str) -> io::Result<String> {
    let joined = base.join(user_path);
    if !joined.starts_with(base) { // WRONG: "../foo" starts_with checks raw string
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "nope"));
    }
    std::fs::read_to_string(joined)
}
```

### Safe Patterns

```rust
// SAFE: Canonicalize then verify prefix
fn safe_read(base: &Path, user_path: &str) -> Result<String, AppError> {
    let base_canonical = base.canonicalize()?;
    let target = base.join(user_path).canonicalize()?;
    if !target.starts_with(&base_canonical) {
        return Err(AppError::PathTraversal);
    }
    std::fs::read_to_string(target).map_err(Into::into)
}

// SAFE: Reject suspicious path components before any I/O
fn validate_filename(name: &str) -> Result<&str, AppError> {
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::InvalidFilename);
    }
    if name.starts_with('.') || name.is_empty() || name.len() > 255 {
        return Err(AppError::InvalidFilename);
    }
    Ok(name)
}
```

## Archive Extraction (ZIP Slip)

The #1 attack vector for a mod manager. Malicious ZIP/RAR/7Z archives can contain entries
with path traversal filenames that write outside the extraction directory.

### Vulnerable Patterns

```rust
// VULNERABLE: Extracting archive without checking entry paths
fn extract_zip(archive: &Path, dest: &Path) -> io::Result<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let path = dest.join(entry.name()); // entry.name() could be "../../evil.dll"
        std::fs::create_dir_all(path.parent().unwrap())?;
        let mut outfile = std::fs::File::create(&path)?;
        std::io::copy(&mut entry, &mut outfile)?;
    }
    Ok(())
}
```

### Safe Patterns

```rust
// SAFE: Validate every archive entry path
fn extract_zip_safe(archive: &Path, dest: &Path) -> Result<(), AppError> {
    let dest = dest.canonicalize()?;
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let entry_path = dest.join(entry.name());

        // Canonicalize parent to handle ../ in the middle of paths
        let parent = entry_path.parent().ok_or(AppError::InvalidPath)?;
        std::fs::create_dir_all(parent)?;
        let canonical = parent.canonicalize()?.join(
            entry_path.file_name().ok_or(AppError::InvalidPath)?
        );

        // Verify the resolved path is still under dest
        if !canonical.starts_with(&dest) {
            return Err(AppError::ZipSlip(entry.name().to_string()));
        }

        // Check for symlinks in entry
        if entry.is_symlink() {
            continue; // skip symlinks entirely
        }

        // Enforce size limits
        if entry.size() > MAX_ENTRY_SIZE {
            return Err(AppError::FileTooLarge(entry.name().to_string()));
        }

        let mut outfile = std::fs::File::create(&canonical)?;
        std::io::copy(&mut entry, &mut outfile)?;
    }
    Ok(())
}
```

## Symlink Attacks

```rust
// VULNERABLE: Following symlinks in mod directory
fn scan_mods(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut mods = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        mods.push(path); // could be a symlink pointing outside mod dir
    }
    Ok(mods)
}

// SAFE: Check for symlinks
fn scan_mods_safe(dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let base = dir.canonicalize()?;
    let mut mods = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let canonical = entry.path().canonicalize()?;
        if !canonical.starts_with(&base) {
            continue; // symlink escaping mod dir
        }
        mods.push(canonical);
    }
    Ok(mods)
}
```

## Zip Bomb / Resource Exhaustion

```rust
// SAFE: Enforce limits during extraction
const MAX_TOTAL_SIZE: u64 = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_ENTRY_SIZE: u64 = 500 * 1024 * 1024; // 500 MB
const MAX_ENTRIES: usize = 50_000;

fn check_archive_limits(zip: &zip::ZipArchive<File>) -> Result<(), AppError> {
    if zip.len() > MAX_ENTRIES {
        return Err(AppError::TooManyEntries);
    }
    let total: u64 = (0..zip.len())
        .map(|i| zip.by_index(i).map(|e| e.size()).unwrap_or(0))
        .sum();
    if total > MAX_TOTAL_SIZE {
        return Err(AppError::ArchiveTooLarge);
    }
    Ok(())
}
```

## Detection Patterns

```
# Path joining with user input
grep -rn '\.join(' --include='*.rs' | grep -v 'test'

# Archive extraction
grep -rn 'ZipArchive\|zip::read\|unrar\|sevenz\|extract' --include='*.rs'

# Missing canonicalize
grep -rn 'starts_with' --include='*.rs' | grep -v 'canonicalize'

# Symlink operations
grep -rn 'symlink\|read_link\|is_symlink' --include='*.rs'

# File creation with external input
grep -rn 'File::create\|fs::write\|fs::copy' --include='*.rs'
```

## Checklist

- [ ] All archive entry paths validated against extraction directory after canonicalization
- [ ] Symlinks in archives are skipped or explicitly rejected
- [ ] Archive extraction enforces max total size, max entry size, and max entry count
- [ ] User-provided filenames validated: no `..`, no path separators, length limit
- [ ] All path operations canonicalize before `starts_with` checks
- [ ] Temporary files created via `tempfile` crate (not predictable names in /tmp)
- [ ] File permissions set restrictively after creation
- [ ] VPK parser validates file sizes and offsets before reading
