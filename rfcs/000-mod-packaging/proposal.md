# RFC: Deadlock Mod Packaging Format (.dmodpkg)

**Status:** Draft
**Created:** 2025-11-10
**Version:** 0.1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Design Principles](#goals--design-principles)
3. [Configuration Format](#configuration-format)
4. [Project Structure](#project-structure)
5. [Binary Format Specification](#binary-format-specification)
6. [Layer System](#layer-system)
7. [Variant Groups](#variant-groups)
8. [Dependency Management](#dependency-management)
9. [File Transformers](#file-transformers)
10. [CLI Tooling](#cli-tooling)
11. [Migration Path](#migration-path)
12. [Examples](#examples)

---

## Overview

The Deadlock Mod Packaging format (`.dmodpkg`) is a standardized binary format for creating, distributing, and installing Deadlock game modifications. This format addresses the limitations of current distribution methods (zip/rar/7z archives) by providing:

- **Standardized metadata** for mod discovery and compatibility
- **Version management** for mods and dependencies
- **Modular content** through layers and variant systems
- **Efficient compression** using Zstd
- **Integrity verification** through checksums and optional signatures

### Problem Statement

Current Deadlock mod distribution suffers from:

1. **Inconsistent structure**: Mods use different archive formats and internal organization
2. **No metadata standard**: Version info, authors, and dependencies are ad-hoc or missing
3. **Poor variant support**: Multiple downloads required for different mod variations
4. **No dependency tracking**: Users must manually identify and install required mods
5. **Large file sizes**: Inefficient compression and redundant files

---

## Goals & Design Principles

### Primary Goals

1. **Standardization**: Single format for all Deadlock mods
2. **Efficiency**: Better compression ratios and faster installation
3. **Modularity**: Support variants, optional features, and layered content
4. **Compatibility**: Clear dependency tracking and version constraints
5. **Extensibility**: Plugin system for future features and transformers
6. **Developer-friendly**: Simple project structure and tooling

### Design Principles

- **Convention over configuration**: Sensible defaults, explicit overrides
- **Backward compatibility**: Easy migration from existing archives
- **Performance**: Fast extraction and minimal memory footprint
- **Security**: Integrity verification and optional cryptographic signatures
- **Human-readable metadata**: JSON configuration for easy editing

---

## Configuration Format

Mods are defined by a `mod.config.json` file in the project root.

### Schema

```json
{
  "$schema": "https://deadlock-modding.com/schemas/mod-config-v1.json",
  "name": "my-awesome-mod",
  "display_name": "My Awesome Mod",
  "version": "1.2.3",
  "description": "Enhances visual effects and adds custom sounds",
  "game_version": ">=1.0.0",

  "authors": [
    "AuthorName",
    {
      "name": "ContributorName",
      "role": "Contributor",
      "url": "https://github.com/contributor"
    }
  ],

  "license": "MIT",
  "readme": "README.md",
  "homepage": "https://github.com/author/my-awesome-mod",
  "repository": "https://github.com/author/my-awesome-mod",
  "icon": "icon.png",

  "dependencies": [
    {
      "name": "core-framework",
      "version": "^2.0.0",
      "optional": false
    },
    {
      "name": "hud-enhancer",
      "version": "~1.5.0",
      "optional": true
    }
  ],

  "variant_groups": [
    {
      "id": "character_skin",
      "name": "Character Skin Variant",
      "description": "Choose one character skin style",
      "default": "default",
      "variants": [
        {
          "id": "default",
          "name": "Default",
          "description": "Standard character appearance",
          "layers": ["base"]
        },
        {
          "id": "dark",
          "name": "Dark Theme",
          "description": "Darker, moodier character visuals",
          "layers": ["base", "dark_skin"]
        },
        {
          "id": "neon",
          "name": "Neon Theme",
          "description": "Bright neon-colored characters",
          "layers": ["base", "neon_skin"]
        }
      ]
    }
  ],

  "layers": [
    {
      "name": "base",
      "priority": 0,
      "description": "Core mod files",
      "required": true
    },
    {
      "name": "dark_skin",
      "priority": 10,
      "description": "Dark theme character textures",
      "required": false
    },
    {
      "name": "neon_skin",
      "priority": 10,
      "description": "Neon theme character textures",
      "required": false
    },
    {
      "name": "optional_sounds",
      "priority": 5,
      "description": "Enhanced sound effects",
      "required": false
    }
  ],

  "transformers": [
    {
      "name": "vpk-validator",
      "patterns": ["**/*.vpk"],
      "config": {
        "verify_structure": true
      }
    }
  ],

  "metadata": {
    "tags": ["visual", "audio", "characters"],
    "category": "gameplay",
    "nsfw": false
  }
}
```

### Field Descriptions

#### Core Metadata

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (kebab-case, a-z0-9-) |
| `display_name` | string | Yes | Human-readable name |
| `version` | string | Yes | Semantic version (semver) |
| `description` | string | Yes | Short description (max 500 chars) |
| `game_version` | string | No | Compatible Deadlock version constraint |
| `authors` | array | Yes | List of authors (string or object) |
| `license` | string | No | SPDX license identifier |
| `readme` | string | No | Path to README file |
| `homepage` | string | No | Project homepage URL |
| `repository` | string | No | Source code repository URL |
| `icon` | string | No | Path to icon image (256x256 recommended) |

#### Dependencies

Dependencies use semantic versioning constraints:

- `^1.2.3` - Compatible with 1.x.x (>= 1.2.3, < 2.0.0)
- `~1.2.3` - Patch updates (>= 1.2.3, < 1.3.0)
- `>=1.0.0 <2.0.0` - Range
- `1.2.3` - Exact version

#### Variant Groups

Variant groups define mutually exclusive options (user picks one):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique group identifier |
| `name` | string | Yes | Display name |
| `description` | string | No | Group description |
| `default` | string | Yes | Default variant ID |
| `variants` | array | Yes | List of variant options |

Each variant specifies which layers to enable.

#### Layers

Layers are additive content modules with priority-based overrides:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique layer name |
| `priority` | number | Yes | Override priority (higher = wins) |
| `description` | string | No | Layer description |
| `required` | boolean | No | Must be installed (default: false) |

#### Transformers

Transformers are plugins that preprocess files during packing:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Transformer plugin name |
| `patterns` | array | Yes | Glob patterns for matching files |
| `config` | object | No | Transformer-specific configuration |

---

## Project Structure

A typical Deadlock mod project follows this structure:

```text
my-awesome-mod/
├── mod.config.json              # Project configuration
├── README.md                    # Mod documentation
├── LICENSE                      # License file
├── icon.png                     # Mod icon (256x256)
│
├── content/                     # Mod content organized by layers
│   ├── base/                    # Base layer (priority 0)
│   │   ├── pak01_dir.vpk       # Core game content VPK
│   │   ├── characters.vpk      # Character modifications
│   │   └── maps.vpk            # Map modifications
│   │
│   ├── dark_skin/               # Dark skin variant layer
│   │   └── characters.vpk      # Overrides base/characters.vpk
│   │
│   ├── neon_skin/               # Neon skin variant layer
│   │   └── characters.vpk      # Overrides base/characters.vpk
│   │
│   └── optional_sounds/         # Optional sound layer
│       └── sounds.vpk           # Additional sound effects
│
├── build/                       # Output directory (generated)
│   └── my-awesome-mod-1.2.3.dmodpkg
│
└── .dmodpkg-cache/             # Build cache (ignored in VCS)
```

### Layer Content Rules

1. **VPK files only**: Each layer contains compiled VPK files
2. **Matching filenames**: Files with same name across layers are overridden by priority
3. **Flat structure**: VPK files are at layer root (no subdirectories)
4. **Naming convention**: Use descriptive names (e.g., `characters.vpk`, not `file1.vpk`)

### Special Files

- `README.md` - Displayed in mod manager and web listings
- `LICENSE` - License text (if not using SPDX identifier)
- `icon.png` - Mod icon for visual identification
- `CHANGELOG.md` - Version history (recommended)

---

## Binary Format Specification

The `.dmodpkg` file is a binary format optimized for fast extraction and verification.

### File Structure

```text
┌─────────────────────────────────────────┐
│ Header                                   │ 64 bytes
├─────────────────────────────────────────┤
│ Metadata Section                         │ Variable (Zstd compressed JSON)
├─────────────────────────────────────────┤
│ File Index Section                       │ Variable (Zstd compressed)
├─────────────────────────────────────────┤
│ Chunk Table                              │ Variable
├─────────────────────────────────────────┤
│ Data Chunks                              │ Variable (Zstd compressed)
│  ├─ Chunk 0                             │
│  ├─ Chunk 1                             │
│  └─ ...                                 │
└─────────────────────────────────────────┘
```

### Header Format (64 bytes)

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0x00 | 8 | ASCII | Magic bytes: "DMODPKG\0" |
| 0x08 | 2 | uint16 | Format version (current: 1) |
| 0x0A | 2 | uint16 | Flags (reserved) |
| 0x0C | 4 | uint32 | Metadata section offset |
| 0x10 | 4 | uint32 | Metadata section compressed size |
| 0x14 | 4 | uint32 | Metadata section uncompressed size |
| 0x18 | 4 | uint32 | File index section offset |
| 0x1C | 4 | uint32 | File index section compressed size |
| 0x20 | 4 | uint32 | File index section uncompressed size |
| 0x24 | 4 | uint32 | Chunk table offset |
| 0x28 | 4 | uint32 | Chunk table size |
| 0x2C | 4 | uint32 | Data section offset |
| 0x30 | 8 | uint64 | Total uncompressed size |
| 0x38 | 8 | uint64 | Package CRC64 |

### Metadata Section

Zstd-compressed JSON containing the full `mod.config.json` plus:

```json
{
  "config": { /* mod.config.json contents */ },
  "build_info": {
    "builder_version": "1.0.0",
    "build_timestamp": "2025-11-10T12:34:56Z",
    "platform": "win32",
    "checksum_algorithm": "SHA256"
  },
  "signature": {
    "algorithm": "ed25519",
    "public_key": "base64-encoded-key",
    "signature": "base64-encoded-signature"
  }
}
```

### File Index Section

Zstd-compressed binary structure:

```text
┌──────────────────────────────┐
│ File Count (uint32)          │
├──────────────────────────────┤
│ File Entry 0                 │
│  ├─ Path Length (uint16)    │
│  ├─ Path (UTF-8)            │
│  ├─ Layer Name Len (uint8)  │
│  ├─ Layer Name (UTF-8)      │
│  ├─ Uncompressed Size (u64) │
│  ├─ Chunk Count (uint16)    │
│  ├─ Chunk Indices (u32[])   │
│  └─ SHA256 Checksum (32B)   │
├──────────────────────────────┤
│ File Entry 1                 │
│ ...                          │
└──────────────────────────────┘
```

### Chunk Table

Array of chunk metadata (uncompressed):

```text
┌──────────────────────────────┐
│ Chunk Count (uint32)         │
├──────────────────────────────┤
│ Chunk 0                      │
│  ├─ Offset (uint64)         │
│  ├─ Compressed Size (u32)   │
│  ├─ Uncompressed Size (u32) │
│  └─ CRC32 (uint32)          │
├──────────────────────────────┤
│ Chunk 1                      │
│ ...                          │
└──────────────────────────────┘
```

### Data Chunks

Files are split into chunks (default: 1MB uncompressed) and compressed independently with Zstd. This enables:

- **Parallel decompression**: Multiple chunks can be decompressed concurrently
- **Partial extraction**: Extract specific files without decompressing entire archive
- **Better compression**: Similar files across layers share chunk patterns
- **Resume capability**: Re-download only corrupted chunks

### Compression Settings

- **Algorithm**: Zstd (Zstandard)
- **Default level**: 9 (balanced speed/ratio)
- **Chunk size**: 1MB (configurable: 256KB - 16MB)
- **Dictionary**: Optional shared dictionary for better compression across chunks

---

## Layer System

Layers provide a flexible system for organizing mod content with priority-based file overriding.

### How Layers Work

1. **Priority-based**: Each layer has a numeric priority (higher wins)
2. **Additive**: Multiple layers can be enabled simultaneously
3. **File-level overrides**: Files with the same name are overridden by higher priority layers
4. **Independent**: Layers can be enabled/disabled individually (unless required)

### Layer Priority Rules

When multiple layers contain files with the same name:

```text
Layer A (priority 0):  characters.vpk [version A]
Layer B (priority 10): characters.vpk [version B]
Layer C (priority 5):  maps.vpk

Result: characters.vpk from Layer B (priority 10) is used
        maps.vpk from Layer C (no conflict)
```

### Required vs Optional Layers

- **Required layers** (`required: true`): Always installed, cannot be disabled
- **Optional layers** (`required: false`): User can choose to enable/disable

### Use Cases

1. **Base + Enhancements**:

   ```text
   base (priority 0, required):     Core mod functionality
   hd_textures (priority 10):       High-res texture overrides
   experimental (priority 20):      Bleeding-edge features
   ```

2. **Modular Features**:

   ```text
   core (priority 0, required):     Essential files
   ui_improvements (priority 5):    Optional UI changes
   sound_pack (priority 5):         Optional sound effects
   ```

3. **Progressive Enhancement**:

   ```text
   low_spec (priority 0):           Works on all systems
   med_spec (priority 10):          Better quality for medium PCs
   high_spec (priority 20):         Maximum quality for high-end PCs
   ```

---

## Working with Variant Groups

Variant groups provide mutually exclusive options where the user selects one variant from a group.

### How Variant Groups Work

1. **Mutually exclusive**: Only one variant per group can be active
2. **Layer-based**: Each variant specifies which layers to enable
3. **Default selection**: Groups must specify a default variant
4. **Multiple groups**: A mod can have multiple independent variant groups

### Example: Character Skin Variants

```json
{
  "variant_groups": [
    {
      "id": "skin_style",
      "name": "Character Skin Style",
      "default": "realistic",
      "variants": [
        {
          "id": "realistic",
          "name": "Realistic",
          "description": "Photorealistic character textures",
          "layers": ["base", "realistic_textures"]
        },
        {
          "id": "stylized",
          "name": "Stylized",
          "description": "Artistic, painterly style",
          "layers": ["base", "stylized_textures"]
        },
        {
          "id": "minimal",
          "name": "Minimal",
          "description": "Clean, simple aesthetic",
          "layers": ["base", "minimal_textures"]
        }
      ]
    }
  ]
}
```

### Layer Organization for Variants

```text
content/
├── base/                    # Shared across all variants
│   ├── core.vpk
│   └── maps.vpk
├── realistic_textures/      # Realistic variant only
│   └── characters.vpk
├── stylized_textures/       # Stylized variant only
│   └── characters.vpk
└── minimal_textures/        # Minimal variant only
    └── characters.vpk
```

### Multiple Variant Groups

Mods can have multiple independent variant groups:

```json
{
  "variant_groups": [
    {
      "id": "skin_style",
      "name": "Skin Style",
      "default": "realistic",
      "variants": [/* ... */]
    },
    {
      "id": "ui_theme",
      "name": "UI Theme",
      "default": "dark",
      "variants": [
        {
          "id": "dark",
          "name": "Dark Theme",
          "layers": ["base", "ui_dark"]
        },
        {
          "id": "light",
          "name": "Light Theme",
          "layers": ["base", "ui_light"]
        }
      ]
    }
  ]
}
```

User selects: `skin_style: realistic` + `ui_theme: light`
Enabled layers: `base`, `realistic_textures`, `ui_light`

### Hybrid: Variants + Optional Layers

Combine variant groups with independent optional layers:

```json
{
  "variant_groups": [
    {
      "id": "quality",
      "name": "Graphics Quality",
      "default": "medium",
      "variants": [
        { "id": "low", "layers": ["base"] },
        { "id": "medium", "layers": ["base", "med_quality"] },
        { "id": "high", "layers": ["base", "high_quality"] }
      ]
    }
  ],
  "layers": [
    { "name": "base", "priority": 0, "required": true },
    { "name": "med_quality", "priority": 10, "required": false },
    { "name": "high_quality", "priority": 10, "required": false },
    { "name": "enhanced_audio", "priority": 5, "required": false },
    { "name": "bonus_effects", "priority": 15, "required": false }
  ]
}
```

User can:

1. Choose quality level (low/medium/high)
2. Independently enable/disable `enhanced_audio`
3. Independently enable/disable `bonus_effects`

---

## Dependency Management

Dependencies allow mods to require other mods for functionality.

### Dependency Declaration

```json
{
  "dependencies": [
    {
      "name": "framework-mod",
      "version": "^2.1.0",
      "optional": false
    },
    {
      "name": "hud-library",
      "version": ">=1.5.0 <3.0.0",
      "optional": true
    }
  ]
}
```

### Version Constraints

Following npm-style semantic versioning:

| Constraint | Meaning | Example Match |
|------------|---------|---------------|
| `1.2.3` | Exact version | 1.2.3 only |
| `^1.2.3` | Compatible (minor updates) | 1.2.3, 1.5.0, 1.9.9 (not 2.0.0) |
| `~1.2.3` | Patch updates only | 1.2.3, 1.2.9 (not 1.3.0) |
| `>=1.0.0` | Minimum version | 1.0.0, 2.5.1, 99.0.0 |
| `>=1.0.0 <2.0.0` | Range | 1.0.0 to 1.9.9 |
| `*` | Any version | All versions |

### Dependency Resolution

The mod manager resolves dependencies using a topological sort algorithm:

1. **Parse all dependencies**: Build a dependency graph
2. **Check for cycles**: Reject circular dependencies
3. **Resolve versions**: Find compatible versions for all dependencies
4. **Determine install order**: Install dependencies before dependents
5. **Validate conflicts**: Check for incompatible version requirements

### Optional Dependencies

Optional dependencies (`optional: true`):

- Not required for mod to function
- Install if available and compatible
- Provide enhanced features when present
- User can choose to skip optional dependencies

### Dependency Metadata

The mod manager tracks:

```json
{
  "installed": {
    "my-mod": {
      "version": "1.2.3",
      "dependencies": {
        "framework-mod": {
          "required_version": "^2.1.0",
          "installed_version": "2.5.1",
          "satisfied": true
        }
      }
    }
  }
}
```

### Conflict Detection

Conflicts occur when:

1. **Version mismatch**: Mod A requires framework ^1.0.0, Mod B requires framework ^2.0.0
2. **Missing dependency**: Required dependency not installed
3. **Circular dependency**: A depends on B, B depends on A

The mod manager should:

- Display clear error messages
- Suggest resolution steps
- Allow manual override with warnings

---

## File Transformers

Transformers are plugins that preprocess files during the packing process.

### Transformer Architecture

```text
Source Files → Transformer Pipeline → Processed Files → .dmodpkg Package
```

### Transformer Plugin Interface

Transformers implement a standard interface:

```typescript
interface Transformer {
  name: string;
  version: string;

  // Check if transformer can handle file
  matches(filePath: string, pattern: string[]): boolean;

  // Transform file content
  transform(
    input: {
      filePath: string;
      content: Buffer;
      config: any;
    }
  ): Promise<{
    content: Buffer;
    metadata?: Record<string, any>;
  }>;

  // Optional: Validate configuration
  validateConfig?(config: any): boolean;
}
```

### Built-in Transformers

#### 1. VPK Validator

Validates VPK file structure and content:

```json
{
  "name": "vpk-validator",
  "patterns": ["**/*.vpk"],
  "config": {
    "verify_structure": true,
    "check_checksums": true,
    "strict_mode": false
  }
}
```

#### 2. Compression Optimizer

Optimizes file compression settings:

```json
{
  "name": "compression-optimizer",
  "patterns": ["**/*"],
  "config": {
    "level": 9,
    "dictionary_size": "1MB"
  }
}
```

#### 3. Metadata Extractor

Extracts metadata from VPK files:

```json
{
  "name": "metadata-extractor",
  "patterns": ["**/*.vpk"],
  "config": {
    "extract_file_list": true,
    "extract_checksums": true
  }
}
```

### Custom Transformers

Users can create custom transformers and place them in:

```text
~/.dmodpkg/transformers/
└── my-transformer/
    ├── package.json
    ├── index.js
    └── README.md
```

Example custom transformer:

```javascript
// index.js
module.exports = {
  name: 'my-custom-transformer',
  version: '1.0.0',

  matches(filePath, patterns) {
    return patterns.some(pattern =>
      minimatch(filePath, pattern)
    );
  },

  async transform({ filePath, content, config }) {
    // Process content
    const processed = await processFile(content, config);

    return {
      content: processed,
      metadata: {
        processed_at: new Date().toISOString(),
        transformer: 'my-custom-transformer'
      }
    };
  }
};
```

### Transformer Pipeline

Multiple transformers can process the same file:

```json
{
  "transformers": [
    {
      "name": "vpk-validator",
      "patterns": ["**/*.vpk"]
    },
    {
      "name": "metadata-extractor",
      "patterns": ["**/*.vpk"]
    },
    {
      "name": "compression-optimizer",
      "patterns": ["**/*"]
    }
  ]
}
```

Execution order: Listed order in config (top to bottom)

### Transformer Errors

Transformers can:

- **Warn**: Log warning and continue (non-critical issues)
- **Error**: Abort packing process (critical issues)
- **Skip**: Skip file and continue (incompatible files)

Error handling configuration:

```json
{
  "transformers": [
    {
      "name": "vpk-validator",
      "patterns": ["**/*.vpk"],
      "on_error": "abort",  // "abort" | "warn" | "skip"
      "config": { /* ... */ }
    }
  ]
}
```

---

## CLI Tooling

The `dmodpkg` CLI tool manages mod projects and packages.

### Installation

```bash
# npm
npm install -g dmodpkg-cli

# cargo
cargo install dmodpkg-cli

# Binary download
# Download from releases page
```

### Commands

#### `dmodpkg init`

Initialize a new mod project:

```bash
dmodpkg init [project-name] [options]

Options:
  --template <name>    Use project template (basic, advanced, multilayer)
  --author <name>      Set author name
  --license <spdx>     Set license (default: MIT)
  --interactive, -i    Interactive project setup
```

Example:

```bash
$ dmodpkg init my-awesome-mod --interactive

Creating new Deadlock mod project...

✔ Project name: my-awesome-mod
✔ Display name: My Awesome Mod
✔ Description: A cool mod that does amazing things
✔ Author: YourName
✔ License: MIT
✔ Include example layers? Yes

Project created at: ./my-awesome-mod/

Next steps:
  cd my-awesome-mod
  # Add your VPK files to content/base/
  dmodpkg pack
```

#### `dmodpkg pack`

Package a mod project into `.dmodpkg`:

```bash
dmodpkg pack [options]

Options:
  --config <path>      Path to mod.config.json (default: ./mod.config.json)
  --output <path>      Output directory (default: ./build)
  --compression <n>    Zstd compression level 1-22 (default: 9)
  --chunk-size <size>  Chunk size (default: 1MB)
  --no-validate        Skip validation checks
  --sign <key>         Sign package with private key
```

Example:

```bash
$ dmodpkg pack

Packing mod: My Awesome Mod v1.2.3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

✓ Validated configuration
✓ Processed 12 files (3 layers)
✓ Applied 2 transformers
✓ Compressed 45.2 MB → 18.7 MB (41.3% ratio)
✓ Generated checksums

Package created: ./build/my-awesome-mod-1.2.3.dmodpkg
```

#### `dmodpkg extract`

Extract a `.dmodpkg` package:

```bash
dmodpkg extract <package> [options]

Options:
  --output <path>      Output directory (default: ./<mod-name>)
  --layers <names>     Extract specific layers (comma-separated)
  --verify             Verify checksums during extraction
  --no-decompress      Extract without decompressing
```

Example:

```bash
$ dmodpkg extract my-awesome-mod-1.2.3.dmodpkg --output ./extracted

Extracting: My Awesome Mod v1.2.3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

✓ Verified package integrity
✓ Extracted 12 files
✓ Layers: base, dark_skin, optional_sounds

Extracted to: ./extracted/
```

#### `dmodpkg info`

Display package information:

```bash
dmodpkg info <package> [options]

Options:
  --json               Output as JSON
  --verbose, -v        Show detailed information
```

Example:

```bash
$ dmodpkg info my-awesome-mod-1.2.3.dmodpkg

My Awesome Mod v1.2.3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Description: Enhances visual effects and adds custom sounds
Author: YourName
License: MIT
Game Version: >=1.0.0

Layers:
  • base (priority 0) - Core mod files [required]
  • dark_skin (priority 10) - Dark theme character textures
  • neon_skin (priority 10) - Neon theme character textures
  • optional_sounds (priority 5) - Enhanced sound effects

Variant Groups:
  Character Skin Variant (default: default)
    • default - Standard character appearance
    • dark - Darker, moodier character visuals
    • neon - Bright neon-colored characters

Dependencies:
  • core-framework ^2.0.0
  • hud-enhancer ~1.5.0 (optional)

Package Info:
  Files: 12
  Compressed Size: 18.7 MB
  Uncompressed Size: 45.2 MB
  Compression Ratio: 41.3%
```

#### `dmodpkg validate`

Validate a mod project or package:

```bash
dmodpkg validate [target] [options]

Options:
  --strict             Enable strict validation mode
  --schema <version>   Schema version to validate against
```

Example:

```bash
$ dmodpkg validate ./my-awesome-mod

Validating mod project...

✓ Configuration is valid
✓ All layers have valid structure
✓ All VPK files exist
✓ No circular dependencies
✓ Version constraints are valid
✗ Warning: Layer 'optional_sounds' is empty

Validation passed with 1 warning.
```

#### `dmodpkg install`

Install a package to the Deadlock mod directory:

```bash
dmodpkg install <package> [options]

Options:
  --profile <name>     Install to specific profile
  --layers <names>     Install specific layers only
  --variant <group:id> Select variant (can specify multiple)
  --no-deps            Skip dependency installation
  --dry-run            Show what would be installed
```

Example:

```bash
$ dmodpkg install my-awesome-mod-1.2.3.dmodpkg \
    --variant character_skin:dark \
    --variant ui_theme:light

Installing: My Awesome Mod v1.2.3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

✓ Resolved dependencies
  ↳ Installing core-framework 2.5.1
  ↳ Installing hud-enhancer 1.5.2 (optional)
✓ Selected variants:
  character_skin: dark
  ui_theme: light
✓ Enabled layers: base, dark_skin, ui_light
✓ Installed to profile: default

Mod installed successfully!
```

#### `dmodpkg uninstall`

Uninstall a mod:

```bash
dmodpkg uninstall <mod-name> [options]

Options:
  --profile <name>     Uninstall from specific profile
  --keep-deps          Don't remove dependencies
```

#### `dmodpkg list`

List installed mods:

```bash
dmodpkg list [options]

Options:
  --profile <name>     List mods in specific profile
  --json               Output as JSON
```

Example:

```bash
$ dmodpkg list

Installed Mods (profile: default)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

my-awesome-mod v1.2.3
  ├─ Layers: base, dark_skin, ui_light
  └─ Dependencies: core-framework, hud-enhancer

core-framework v2.5.1
  └─ Required by: my-awesome-mod, another-mod

hud-enhancer v1.5.2 (optional)
  └─ Required by: my-awesome-mod

3 mods installed
```

#### `dmodpkg upgrade`

Upgrade installed mods:

```bash
dmodpkg upgrade [mod-name] [options]

Options:
  --profile <name>     Upgrade in specific profile
  --all                Upgrade all mods
  --check              Check for updates without installing
```

---

## Migration Path

### From Current Archives (zip/rar/7z)

#### Step 1: Extract Current Archive

```bash
# Extract existing mod
unzip my-mod-v1.zip -d my-mod-temp
```

#### Step 2: Organize Content

```bash
# Create new project structure
dmodpkg init my-mod --template basic

# Move VPK files to base layer
mv my-mod-temp/*.vpk my-mod/content/base/
```

#### Step 3: Create Configuration

Edit `mod.config.json`:

```json
{
  "name": "my-mod",
  "display_name": "My Mod",
  "version": "1.0.0",
  "description": "Migrated from legacy archive",
  "authors": ["OriginalAuthor"],
  "layers": [
    {
      "name": "base",
      "priority": 0,
      "required": true
    }
  ]
}
```

#### Step 4: Pack and Distribute

```bash
dmodpkg pack
# Distribute my-mod-1.0.0.dmodpkg
```

### Handling Variations

If your archive has multiple variations:

**Before (multiple files in archive):**

```text
mod-v1.zip:
  characters_red.vpk
  characters_blue.vpk
  readme.txt
```

**After (variant groups):**

```text
my-mod/
├── mod.config.json
└── content/
    ├── base/
    │   └── core.vpk
    ├── red_variant/
    │   └── characters.vpk  # (renamed from characters_red.vpk)
    └── blue_variant/
        └── characters.vpk  # (renamed from characters_blue.vpk)
```

`mod.config.json`:

```json
{
  "variant_groups": [
    {
      "id": "color",
      "name": "Color Variant",
      "default": "red",
      "variants": [
        { "id": "red", "name": "Red", "layers": ["base", "red_variant"] },
        { "id": "blue", "name": "Blue", "layers": ["base", "blue_variant"] }
      ]
    }
  ],
  "layers": [
    { "name": "base", "priority": 0, "required": true },
    { "name": "red_variant", "priority": 10, "required": false },
    { "name": "blue_variant", "priority": 10, "required": false }
  ]
}
```

### Migration Tool

```bash
dmodpkg migrate <archive> [options]

Options:
  --output <path>      Output project directory
  --auto-detect        Attempt to auto-detect variants
  --template <name>    Use migration template
```

Example:

```bash
$ dmodpkg migrate my-old-mod.zip --auto-detect

Analyzing archive...
✓ Found 3 VPK files
✓ Detected 2 variants (characters_red, characters_blue)

Creating project structure...
✓ Organized files into layers
✓ Generated mod.config.json
✓ Created README from archive text

Migration complete!

Next steps:
  1. Review generated mod.config.json
  2. Update metadata (description, authors, etc.)
  3. Run: dmodpkg pack
```

---

## Examples

### Example 1: Simple Mod

Single layer, no variants or dependencies.

**mod.config.json:**

```json
{
  "name": "better-ui",
  "display_name": "Better UI",
  "version": "1.0.0",
  "description": "Improved user interface",
  "authors": ["UIDesigner"],
  "layers": [
    {
      "name": "base",
      "priority": 0,
      "required": true
    }
  ]
}
```

**Structure:**

```text
better-ui/
├── mod.config.json
└── content/
    └── base/
        └── ui.vpk
```

### Example 2: Mod with Variants

Multiple skin variants, user picks one.

**mod.config.json:**

```json
{
  "name": "hero-skins",
  "display_name": "Hero Skins Pack",
  "version": "2.0.0",
  "description": "Multiple hero skin options",
  "authors": ["ArtistName"],
  "variant_groups": [
    {
      "id": "hero_skin",
      "name": "Hero Skin",
      "default": "classic",
      "variants": [
        {
          "id": "classic",
          "name": "Classic",
          "layers": ["base"]
        },
        {
          "id": "futuristic",
          "name": "Futuristic",
          "layers": ["base", "futuristic_skin"]
        },
        {
          "id": "medieval",
          "name": "Medieval",
          "layers": ["base", "medieval_skin"]
        }
      ]
    }
  ],
  "layers": [
    { "name": "base", "priority": 0, "required": true },
    { "name": "futuristic_skin", "priority": 10, "required": false },
    { "name": "medieval_skin", "priority": 10, "required": false }
  ]
}
```

**Structure:**

```text
hero-skins/
├── mod.config.json
└── content/
    ├── base/
    │   ├── core.vpk
    │   └── sounds.vpk
    ├── futuristic_skin/
    │   └── characters.vpk
    └── medieval_skin/
        └── characters.vpk
```

### Example 3: Mod with Dependencies

Requires framework mod to function.

**mod.config.json:**

```json
{
  "name": "advanced-features",
  "display_name": "Advanced Features",
  "version": "1.5.0",
  "description": "Advanced gameplay features requiring framework",
  "authors": ["DevName"],
  "dependencies": [
    {
      "name": "gameplay-framework",
      "version": "^3.0.0",
      "optional": false
    },
    {
      "name": "enhanced-audio",
      "version": ">=1.0.0",
      "optional": true
    }
  ],
  "layers": [
    { "name": "base", "priority": 0, "required": true }
  ]
}
```

### Example 4: Complex Mod (Variants + Layers + Dependencies)

Full-featured mod using all systems.

**mod.config.json:**

```json
{
  "name": "total-overhaul",
  "display_name": "Total Overhaul Mod",
  "version": "3.2.1",
  "description": "Complete visual and gameplay overhaul",
  "authors": [
    "LeadDev",
    { "name": "ArtistName", "role": "Artist" },
    { "name": "SoundDesigner", "role": "Audio" }
  ],
  "license": "CC-BY-NC-SA-4.0",
  "homepage": "https://github.com/author/total-overhaul",
  "dependencies": [
    {
      "name": "framework-mod",
      "version": "^4.0.0",
      "optional": false
    }
  ],
  "variant_groups": [
    {
      "id": "visual_style",
      "name": "Visual Style",
      "default": "realistic",
      "variants": [
        {
          "id": "realistic",
          "name": "Realistic",
          "description": "Photorealistic graphics",
          "layers": ["base", "realistic_visuals"]
        },
        {
          "id": "stylized",
          "name": "Stylized",
          "description": "Artistic style",
          "layers": ["base", "stylized_visuals"]
        }
      ]
    },
    {
      "id": "performance",
      "name": "Performance Profile",
      "default": "balanced",
      "variants": [
        {
          "id": "performance",
          "name": "Performance",
          "layers": ["base", "low_spec"]
        },
        {
          "id": "balanced",
          "name": "Balanced",
          "layers": ["base", "med_spec"]
        },
        {
          "id": "quality",
          "name": "Quality",
          "layers": ["base", "high_spec"]
        }
      ]
    }
  ],
  "layers": [
    { "name": "base", "priority": 0, "description": "Core files", "required": true },
    { "name": "realistic_visuals", "priority": 10, "required": false },
    { "name": "stylized_visuals", "priority": 10, "required": false },
    { "name": "low_spec", "priority": 5, "required": false },
    { "name": "med_spec", "priority": 5, "required": false },
    { "name": "high_spec", "priority": 5, "required": false },
    { "name": "enhanced_audio", "priority": 15, "description": "Optional sound pack", "required": false },
    { "name": "bonus_content", "priority": 20, "description": "Extra features", "required": false }
  ],
  "transformers": [
    {
      "name": "vpk-validator",
      "patterns": ["**/*.vpk"]
    }
  ],
  "metadata": {
    "tags": ["visual", "gameplay", "complete-overhaul"],
    "category": "overhaul"
  }
}
```

**Structure:**

```text
total-overhaul/
├── mod.config.json
├── README.md
├── LICENSE
├── icon.png
└── content/
    ├── base/
    │   ├── core.vpk
    │   ├── maps.vpk
    │   └── gameplay.vpk
    ├── realistic_visuals/
    │   ├── characters.vpk
    │   └── environments.vpk
    ├── stylized_visuals/
    │   ├── characters.vpk
    │   └── environments.vpk
    ├── low_spec/
    │   └── optimized.vpk
    ├── med_spec/
    │   └── balanced.vpk
    ├── high_spec/
    │   └── ultra.vpk
    ├── enhanced_audio/
    │   └── sounds.vpk
    └── bonus_content/
        └── extras.vpk
```

**User selects:**

- Visual Style: Realistic
- Performance: Quality
- Optional: Enhanced Audio (enabled), Bonus Content (disabled)

**Result - Enabled layers (in priority order):**

1. `base` (priority 0)
2. `med_spec` (priority 5)
3. `realistic_visuals` (priority 10)
4. `enhanced_audio` (priority 15)

---

## Future Considerations

### Schema Versioning

Format version in header allows future evolution:

- **Version 1**: Current specification
- **Version 2+**: Backward-compatible additions
- **Major versions**: Breaking changes (new magic bytes)

### Community Feedback

This RFC is open for community discussion. Key areas for feedback:

1. Configuration format (JSON vs TOML vs YAML)
2. Binary format efficiency (compression, chunk size)
3. Dependency resolution complexity
4. Transformer plugin system design
5. CLI command ergonomics
6. Migration tooling requirements

---

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Zstandard Compression](https://facebook.github.io/zstd/)
- [SPDX License List](https://spdx.org/licenses/)
- [League Toolkit - ltk_modpkg](https://github.com/LeagueToolkit/league-mod)
- [NPM Package JSON](https://docs.npmjs.com/cli/v9/configuring-npm/package-json)

---

## Changelog

### Version 0.1.0 (2025-11-10)

- Initial RFC draft
- Core format specification
- Configuration schema
- Binary format design
- Layer and variant systems
- Dependency management
- Transformer architecture
- CLI tooling specification
- Migration path documentation

---

## License

This specification is released under the MIT License.

