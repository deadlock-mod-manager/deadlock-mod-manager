# Supply Chain Security

Covers dependency management for both Cargo (Rust) and npm (TypeScript/React),
build pipeline security, and update mechanism integrity.

## Dependency Vulnerabilities

### Cargo (Rust)

```bash
# Audit Rust dependencies against RustSec advisory DB
cargo audit

# Check for unmaintained or yanked crates
cargo audit --deny warnings

# Generate SBOM
cargo sbom
```

```toml
# VULNERABLE: Wildcard version (unpredictable updates)
[dependencies]
serde = "*"
zip = "*"

# SAFE: Pinned versions with Cargo.lock committed
[dependencies]
serde = "1.0.203"
zip = "2.1.6"
```

### npm (TypeScript)

```bash
# Audit npm dependencies
npm audit
pnpm audit

# Check for known vulnerabilities
npx audit-ci --critical
```

```json
// VULNERABLE: Unpinned ranges in package.json
{ "dependencies": { "react": "^19" } }
// Combined with missing lockfile = unpredictable installs

// SAFE: Lockfile committed (pnpm-lock.yaml)
// Exact versions resolved and integrity hashes verified
```

## Lock Files

| File | Purpose | Must Commit? |
|------|---------|-------------|
| `Cargo.lock` | Rust dependency lock | **Yes** (for applications) |
| `pnpm-lock.yaml` | npm dependency lock | **Yes** |

If lockfiles are not committed, builds are not reproducible and supply chain
attacks via version substitution become possible.

## Dependency Confusion

```json
// VULNERABLE: Internal package name on public registry
{ "dependencies": { "@deadlock-mods/shared": "^1.0.0" } }
// If not scoped to private registry, npm may resolve from public registry

// SAFE: Workspace protocol for monorepo packages
{ "dependencies": { "@deadlock-mods/shared": "workspace:*" } }
```

In this monorepo, `workspace:*` is used correctly for internal packages.
Verify that no internal package names exist on public npm.

## Build Pipeline Security

```yaml
# VULNERABLE: Unpinned action versions
- uses: actions/checkout@latest
- uses: some-org/action@main

# SAFE: Pinned to commit SHA
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

# VULNERABLE: Secrets in build logs
- run: echo "Token is ${{ secrets.API_KEY }}"

# SAFE: Secrets masked, never echoed
- run: |
    npm run build
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

## OTA Update Security

The app uses a custom CraNebula OTA updater plugin. The update channel is a
**critical trust boundary** — a compromised update = RCE on all users.

```rust
// VULNERABLE: No signature verification on updates
fn apply_update(update_bundle: &[u8]) -> Result<()> {
    extract_and_replace(update_bundle)?;
    Ok(())
}

// SAFE: Verify digital signature before applying
fn apply_update(update_bundle: &[u8], signature: &[u8]) -> Result<()> {
    let public_key = include_bytes!("../keys/update-signing.pub");
    verify_ed25519(public_key, update_bundle, signature)?;
    extract_and_replace(update_bundle)?;
    Ok(())
}
```

### OTA Checklist

- [ ] Update bundles signed with a key not stored in the repo
- [ ] Signature verified before extraction or execution
- [ ] Update endpoint uses HTTPS with certificate pinning
- [ ] Rollback mechanism available if update fails
- [ ] Update metadata includes version to prevent downgrade attacks

## Typosquatting

Common targets in this stack:

| Legitimate | Typosquat Risk |
|------------|---------------|
| `@tauri-apps/api` | `@tauri-app/api`, `@tauri-apps/apii` |
| `serde` | `serdee`, `ser-de` |
| `hono` | `hoono`, `honno` |
| `drizzle-orm` | `drizzle_orm`, `drizle-orm` |
| `zod` | `zodd`, `z0d` |

## Detection Patterns

```
# Check for advisory vulnerabilities
cargo audit 2>&1
pnpm audit 2>&1

# Verify lockfiles exist and are committed
git ls-files --error-unmatch Cargo.lock pnpm-lock.yaml

# Check for wildcard or unpinned versions
grep -n '"*"' Cargo.toml
grep -n 'latest' package.json

# GitHub Actions version pinning
grep -rn 'uses:' --include='*.yml' --include='*.yaml' .github/

# Internal packages on public registry check
npm view @deadlock-mods/shared 2>&1
```

## Checklist

- [ ] `cargo audit` runs in CI with no critical/high findings
- [ ] `pnpm audit` runs in CI with no critical/high findings
- [ ] `Cargo.lock` and `pnpm-lock.yaml` committed to version control
- [ ] Internal packages use `workspace:*` protocol, not public registry
- [ ] GitHub Actions pinned to commit SHAs, not mutable tags
- [ ] No secrets printed in CI logs
- [ ] OTA updates cryptographically signed and verified before applying
- [ ] Update endpoint uses HTTPS
- [ ] Dependencies reviewed before addition (check maintainers, activity, reputation)
