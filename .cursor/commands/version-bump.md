# Version Bump

Handle version bumps after changesets are ready. This command runs changeset version, syncs Cargo.toml, and updates the What's New translations.

## Instructions

### 1. Run Changeset Version

First, run the changeset version command to apply pending changesets:

```bash
pnpm changeset version
```

This will:

- Update package versions based on changesets
- Generate/update CHANGELOG.md files
- Remove consumed changeset files

### 2. Run Version Sync Script

After changeset version completes, run the version bump script to sync versions and generate What's New content:

```bash
bun scripts/version-bump.ts --generate-whats-new
```

This will:

- Sync the `apps/desktop/package.json` version to `apps/desktop/src-tauri/Cargo.toml`
- Parse the CHANGELOG.md for the new version
- Generate What's New content for `apps/desktop/src/locales/en/translation.json`

### 3. Review Generated Content

Review the generated What's New content in the English translation file:

```bash
cat apps/desktop/src/locales/en/translation.json | grep -A 20 '"whatsNew"'
```

If the generated content needs adjustments:

- Edit `apps/desktop/src/locales/en/translation.json`
- Update the title to be more descriptive
- Refine feature descriptions to be user-friendly
- Ensure emojis are appropriate

### 4. Verify Version Sync

Confirm versions are in sync:

```bash
echo "Package.json:" && grep '"version"' apps/desktop/package.json | head -1
echo "Cargo.toml:" && grep '^version = ' apps/desktop/src-tauri/Cargo.toml
```

### 5. Run Linting and Formatting

Ensure code quality:

```bash
pnpm lint:fix
pnpm format:fix
```

### 6. Stage and Commit

Stage all version-related changes:

```bash
git add -A
```

Then use the `/commit` command or commit manually with:

```text
chore(desktop): bump version to X.X.X
```

## Dry Run Mode

To preview changes without modifying files:

```bash
bun scripts/version-bump.ts --generate-whats-new --dry-run
```

## Manual What's New Entry

If automatic generation doesn't produce good results, manually add an entry to `apps/desktop/src/locales/en/translation.json`:

```json
{
  "whatsNew": {
    "versions": {
      "X.X.X": {
        "title": "Feature Title & Another Feature",
        "features": [
          "🔧 Description of first change",
          "✨ Description of new feature",
          "🐛 Bug fix description"
        ]
      }
    }
  }
}
```

### Emoji Guidelines

| Emoji | Usage                         |
| ----- | ----------------------------- |
| 🔧    | Bug fixes, configuration      |
| ✨    | New features, UI improvements |
| 🔒    | Auth, security                |
| 🎯    | Crosshairs                    |
| 🔌    | Plugins                       |
| 🎨    | Themes, styling               |
| 📁    | Profiles, file management     |
| 📥    | Downloads                     |
| 📦    | VPK, packaging                |
| 🌐    | Localization, languages       |
| 🛠️    | Developer tools               |
| ⚡    | Performance                   |
| 🛡️    | Security                      |
| 🐛    | Bug fixes                     |

## Example Usage

**User:** "version bump", "bump version", or `/version-bump`

**Response:**

1. Run `pnpm changeset version`
2. Run `bun scripts/version-bump.ts --generate-whats-new`
3. Review generated What's New content
4. Verify version sync
5. Run linting and formatting
6. Stage and commit changes

## Related Files

- `scripts/version-bump.ts` - Version sync and What's New generation script
- `apps/desktop/package.json` - Desktop app version source of truth
- `apps/desktop/src-tauri/Cargo.toml` - Rust version (must match package.json)
- `apps/desktop/CHANGELOG.md` - Source for What's New content
- `apps/desktop/src/locales/en/translation.json` - What's New translations
