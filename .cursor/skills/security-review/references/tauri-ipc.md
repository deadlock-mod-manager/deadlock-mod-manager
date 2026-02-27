# Tauri IPC Security

The IPC bridge (`invoke()` / `#[tauri::command]`) is the security boundary between the
untrusted webview and privileged native Rust code. XSS in the webview can invoke any
exposed command via `window.__TAURI__`.

## Vulnerable Patterns

```rust
// VULNERABLE: Accepts arbitrary path from frontend
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

// VULNERABLE: String-typed command allows arbitrary execution
#[tauri::command]
fn run_command(cmd: String, args: Vec<String>) -> Result<String, String> {
    let output = std::process::Command::new(cmd).args(args).output()?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// VULNERABLE: Unvalidated mod ID used in path construction
#[tauri::command]
fn delete_mod(mod_id: String) -> Result<(), String> {
    let path = format!("{}/mods/{}", base_dir, mod_id);
    std::fs::remove_dir_all(path).map_err(|e| e.to_string())
}

// VULNERABLE: Returns sensitive data without scoping
#[tauri::command]
fn get_env_var(name: String) -> Option<String> {
    std::env::var(name).ok()
}
```

## Safe Patterns

```rust
// SAFE: Enum-typed operations, no arbitrary strings
#[derive(Deserialize)]
enum ModAction { Enable, Disable, Uninstall }

#[tauri::command]
fn mod_action(mod_id: u64, action: ModAction) -> Result<(), AppError> {
    let mod_entry = db.get_mod(mod_id)?; // validated ID
    match action {
        ModAction::Enable => mod_entry.enable(),
        ModAction::Disable => mod_entry.disable(),
        ModAction::Uninstall => mod_entry.uninstall(),
    }
}

// SAFE: Path canonicalized and checked against allowed base
#[tauri::command]
fn read_mod_file(mod_id: u64, relative_path: String) -> Result<Vec<u8>, AppError> {
    let base = get_mods_dir()?;
    let full = base.join(&relative_path).canonicalize()?;
    if !full.starts_with(&base) {
        return Err(AppError::PathTraversal);
    }
    std::fs::read(full).map_err(Into::into)
}

// SAFE: Hardcoded command, validated arguments
#[tauri::command]
fn launch_game(game_id: u32) -> Result<(), AppError> {
    Command::new("steam")
        .arg("steam://rungameid/")
        .arg(game_id.to_string())
        .spawn()?;
    Ok(())
}
```

## Detection Patterns

```
# Search for commands accepting raw String paths
grep -rn '#\[tauri::command\]' --include='*.rs' -A 20 | grep 'path.*String\|file.*String'

# Search for process spawning in command handlers
grep -rn 'Command::new' --include='*.rs'

# Search for unsafe blocks in command handlers
grep -rn 'unsafe' --include='*.rs'

# Search for filesystem operations accepting frontend input
grep -rn 'std::fs::' --include='*.rs'

# Check Tauri capability/permission configuration
find . -name '*.json' -path '*/capabilities/*'
```

## Checklist

- [ ] Every `#[tauri::command]` treats parameters as untrusted (even from "your own" frontend)
- [ ] No commands accept arbitrary file paths — use IDs that resolve server-side
- [ ] No commands accept arbitrary command strings or binary names
- [ ] Strong types used for parameters (enums, newtypes, bounded integers) over raw Strings
- [ ] Path parameters canonicalized and checked against an allowed base directory
- [ ] Tauri capability/permission scopes restrict plugin access in `tauri.conf.json`
- [ ] `fs` plugin scope limits access to game/mod directories only
- [ ] `shell` plugin scope restricts to specific executables with validated args
- [ ] `http` plugin scope restricts to allowlisted domains
- [ ] No `unsafe` blocks inside command handlers without explicit justification
- [ ] Error responses don't leak internal paths, stack traces, or system info
- [ ] Rate-sensitive operations (file writes, process spawns) are throttled
