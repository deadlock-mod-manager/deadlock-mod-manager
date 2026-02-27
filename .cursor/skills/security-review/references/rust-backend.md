# Rust Backend Security

Covers command injection, unsafe code, process management, and Rust-specific security
patterns in the Tauri backend.

## Command Injection

### Vulnerable Patterns

```rust
// VULNERABLE: User input concatenated into shell command
let output = Command::new("sh")
    .arg("-c")
    .arg(format!("vpk_tool extract {} {}", archive_path, dest))
    .output()?;

// VULNERABLE: User-controlled binary name
let output = Command::new(&user_provided_tool)
    .arg("--extract")
    .output()?;

// VULNERABLE: Path from mod metadata used directly
let output = Command::new("tar")
    .arg("-xf")
    .arg(&mod_archive.filename) // from untrusted source
    .output()?;
```

### Safe Patterns

```rust
// SAFE: Hardcoded command, separate validated args
Command::new("steam")
    .arg("steam://rungameid/1422450") // hardcoded game ID
    .spawn()?;

// SAFE: Allowlisted command with validated argument
let tool = match requested_tool {
    "vpk" => "/usr/local/bin/vpk_tool",
    _ => return Err(AppError::InvalidTool),
};
Command::new(tool)
    .arg("--extract")
    .arg("--") // terminate option parsing
    .arg(&validated_path)
    .output()?;

// SAFE: Use Rust libraries instead of shelling out
// Instead of Command::new("unzip"), use the zip crate
let file = std::fs::File::open(&archive_path)?;
let mut archive = zip::ZipArchive::new(file)?;
```

## Unsafe Code

### Vulnerable Patterns

```rust
// VULNERABLE: unsafe in IPC handler — FFI without validation
#[tauri::command]
fn parse_vpk(data: Vec<u8>) -> Result<VpkData, String> {
    unsafe {
        let ptr = data.as_ptr();
        // raw pointer manipulation on untrusted data
        let header = &*(ptr as *const VpkHeader);
        // ...
    }
}

// VULNERABLE: transmute on untrusted input
unsafe { std::mem::transmute::<&[u8], &str>(user_bytes) }
```

### Safe Patterns

```rust
// SAFE: Validate before FFI
#[tauri::command]
fn parse_vpk(data: Vec<u8>) -> Result<VpkData, AppError> {
    if data.len() < std::mem::size_of::<VpkHeader>() {
        return Err(AppError::InvalidFormat);
    }
    // Use safe parsing (byteorder, nom, binrw crates)
    let header = VpkHeader::parse(&data)?;
    // ...
}

// SAFE: Use safe abstractions
let text = std::str::from_utf8(user_bytes)?; // validates UTF-8
```

## Process Management

### Checklist

- [ ] No `Command::new()` with user-controlled binary names
- [ ] Arguments passed via separate `.arg()` calls, never concatenated into shell strings
- [ ] Never use `sh -c` or `cmd /c` with interpolated user data
- [ ] `--` used before positional args that might start with `-`
- [ ] Subprocess output not passed to `eval` or shell
- [ ] Spawned processes inherit minimal environment (`Command::env_clear()`)
- [ ] Process output size bounded to prevent memory exhaustion

## Unsafe Code Checklist

- [ ] No `unsafe` blocks in `#[tauri::command]` handlers without explicit justification
- [ ] FFI calls validate input size and format before passing to C code
- [ ] Raw pointers never created from untrusted input without bounds checking
- [ ] `transmute` never used on untrusted data
- [ ] All `unsafe` blocks documented with safety invariants

## Detection Patterns

```
# Command execution
grep -rn 'Command::new' --include='*.rs'
grep -rn 'std::process' --include='*.rs'
grep -rn 'sh.*-c\|cmd.*/c' --include='*.rs'

# Unsafe blocks
grep -rn 'unsafe\s*{' --include='*.rs'
grep -rn 'transmute' --include='*.rs'
grep -rn 'from_raw_parts' --include='*.rs'

# FFI declarations
grep -rn 'extern\s*"C"' --include='*.rs'
grep -rn '#\[no_mangle\]' --include='*.rs'
```
