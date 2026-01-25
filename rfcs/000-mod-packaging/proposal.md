# RFC: Deadlock Mod Packaging Format (.dmodpkg)

**Status:** Draft
**Created:** 2025-11-10
**Updated:** 2025-11-10
**Version:** 0.3.0

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Design Principles](#goals--design-principles)
3. [Configuration Format](#configuration-format)
4. [Project Structure](#project-structure)
5. [Binary Format Specification](#binary-format-specification)
6. [Layer System](#layer-system)
7. [Variant Groups](#variant-groups)
8. [File Transformers](#file-transformers)
9. [Mod Bundles](#mod-bundles)
10. [CLI Tooling](#cli-tooling)
11. [Migration Path](#migration-path)
12. [Examples](#examples)
13. [Future Considerations](#future-considerations)

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
  "$schema": "https://deadlockmods.app/schemas/mod-config-v1.json",
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
  "screenshots": [
    "previews/mod/screenshot_1.png",
    "previews/mod/screenshot_2.png",
    "https://example.com/external_screenshot.jpg"
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
          "preview_image": "previews/character_skin/dark/main.png",
          "screenshots": [
            "previews/character_skin/dark/screenshot_1.png",
            "https://example.com/dark_variant_ingame.jpg"
          ],
          "layers": ["base", "dark_skin"]
        },
        {
          "id": "neon",
          "name": "Neon Theme",
          "description": "Bright neon-colored characters",
          "preview_image": "previews/character_skin/neon/main.png",
          "screenshots": [
            "previews/character_skin/neon/screenshot_1.png",
            "previews/character_skin/neon/screenshot_2.png"
          ],
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

| Field          | Type   | Required | Description                             |
| -------------- | ------ | -------- | --------------------------------------- |
| `name`         | string | Yes      | Unique identifier (kebab-case, a-z0-9-) |
| `display_name` | string | Yes      | Human-readable name                     |
| `version`      | string | Yes      | Semantic version (semver)               |
| `description`  | string | Yes      | Short description (max 500 chars)       |
| `game_version` | string | No       | Compatible Deadlock version constraint  |
| `authors`      | array  | Yes      | List of authors (string or object)      |
| `license`      | string | No       | SPDX license identifier                 |
| `readme`       | string | No       | Path to README file                     |
| `homepage`     | string | No       | Project homepage URL                    |
| `repository`   | string | No       | Source code repository URL              |
| `screenshots`  | array  | No       | Mod-level screenshots (paths or URLs)   |

#### Variant Groups

Variant groups define mutually exclusive options (user picks one):

| Field         | Type   | Required | Description             |
| ------------- | ------ | -------- | ----------------------- |
| `id`          | string | Yes      | Unique group identifier |
| `name`        | string | Yes      | Display name            |
| `description` | string | No       | Group description       |
| `default`     | string | Yes      | Default variant ID      |
| `variants`    | array  | Yes      | List of variant options |

Each variant specifies which layers to enable and can include preview images.

##### Variant Fields

| Field           | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `id`            | string | Yes      | Unique variant identifier               |
| `name`          | string | Yes      | Display name                            |
| `description`   | string | No       | Variant description                     |
| `layers`        | array  | Yes      | Which layers to enable for this variant |
| `preview_image` | string | No       | Main preview image (path or URL)        |
| `screenshots`   | array  | No       | Additional screenshots (paths or URLs)  |

#### Layers

Layers are additive content modules with priority-based overrides:

| Field         | Type    | Required | Description                        |
| ------------- | ------- | -------- | ---------------------------------- |
| `name`        | string  | Yes      | Unique layer name                  |
| `priority`    | number  | Yes      | Override priority (higher = wins)  |
| `description` | string  | No       | Layer description                  |
| `required`    | boolean | No       | Must be installed (default: false) |

#### Transformers

Transformers are plugins that preprocess files during packing:

| Field      | Type   | Required | Description                        |
| ---------- | ------ | -------- | ---------------------------------- |
| `name`     | string | Yes      | Transformer plugin name            |
| `patterns` | array  | Yes      | Glob patterns for matching files   |
| `config`   | object | No       | Transformer-specific configuration |

---

## Project Structure

A typical Deadlock mod project follows this structure:

```text
my-awesome-mod/
├── mod.config.json              # Project configuration
├── README.md                    # Mod documentation
├── LICENSE                      # License file
│
├── previews/                    # Preview images and screenshots
│   ├── mod/                     # Mod-level screenshots
│   │   ├── screenshot_1.png    # General mod screenshot
│   │   └── screenshot_2.png    # Additional screenshot
│   │
│   └── character_skin/          # Variant group directory
│       ├── dark/                # Dark variant previews
│       │   ├── main.png        # Main preview image
│       │   └── screenshot_1.png # Additional screenshot
│       │
│       └── neon/                # Neon variant previews
│           ├── main.png        # Main preview image
│           ├── screenshot_1.png
│           └── screenshot_2.png
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
- `CHANGELOG.md` - Version history (recommended)

### Preview Images Directory

The `previews/` directory contains all visual assets for showcasing the mod and its variants:

#### Structure Rules

1. **Mod-level screenshots**: Stored in `previews/mod/`
   - General screenshots showcasing the mod
   - Numbered sequentially: `screenshot_1.png`, `screenshot_2.png`, etc.

2. **Variant previews**: Stored in `previews/<variant_group_id>/<variant_id>/`
   - `main.png` - Primary preview image for the variant (required if variant has preview)
   - `screenshot_N.png` - Additional screenshots (optional)
   - Each variant can have its own dedicated preview images

3. **Supported formats**: PNG, JPEG/JPG, WebP
   - PNG recommended for UI elements and high-quality previews
   - JPEG for detailed screenshots with smaller file sizes
   - WebP for modern compression and smaller package sizes

4. **External URLs**: Both embedded paths and external URLs are supported
   - Embedded: `"previews/mod/screenshot_1.png"`
   - External: `"https://example.com/screenshot.jpg"`
   - Embedded images are included in the package; external images reduce package size

#### Image Recommendations

- **Preview images** (variant main images): 1920x1080 or 1280x720 recommended
- **Screenshots**: 1920x1080 or higher recommended
- **File size**: Keep individual images under 2MB for optimal loading

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

| Offset | Size | Type   | Description                          |
| ------ | ---- | ------ | ------------------------------------ |
| 0x00   | 8    | ASCII  | Magic bytes: "DMODPKG\0"             |
| 0x08   | 2    | uint16 | Format version (current: 1)          |
| 0x0A   | 2    | uint16 | Flags (reserved)                     |
| 0x0C   | 4    | uint32 | Metadata section offset              |
| 0x10   | 4    | uint32 | Metadata section compressed size     |
| 0x14   | 4    | uint32 | Metadata section uncompressed size   |
| 0x18   | 4    | uint32 | File index section offset            |
| 0x1C   | 4    | uint32 | File index section compressed size   |
| 0x20   | 4    | uint32 | File index section uncompressed size |
| 0x24   | 4    | uint32 | Chunk table offset                   |
| 0x28   | 4    | uint32 | Chunk table size                     |
| 0x2C   | 4    | uint32 | Data section offset                  |
| 0x30   | 8    | uint64 | Total uncompressed size              |
| 0x38   | 8    | uint64 | Package CRC64                        |

### Metadata Section

Zstd-compressed JSON containing the full `mod.config.json` plus:

```json
{
  "config": {
    /* mod.config.json contents */
  },
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

#### Preview Image Handling

Preview images and screenshots can be stored in two ways:

1. **Embedded images**: Image files referenced by relative paths (e.g., `"previews/mod/screenshot_1.png"`) are included in the File Index Section and Data Chunks, similar to VPK files.

2. **External URLs**: Images referenced by full URLs (e.g., `"https://example.com/screenshot.jpg"`) are stored only as metadata; the actual image is fetched at display time.

**Benefits of each approach:**

- **Embedded**: Always available offline, guaranteed availability, faster display
- **External**: Smaller package size, can be updated independently, reduced bandwidth for distribution

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
      "variants": [
        /* ... */
      ]
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
  transform(input: {
    filePath: string;
    content: Buffer;
    config: any;
  }): Promise<{
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
  name: "my-custom-transformer",
  version: "1.0.0",

  matches(filePath, patterns) {
    return patterns.some((pattern) => minimatch(filePath, pattern));
  },

  async transform({ filePath, content, config }) {
    // Process content
    const processed = await processFile(content, config);

    return {
      content: processed,
      metadata: {
        processed_at: new Date().toISOString(),
        transformer: "my-custom-transformer",
      },
    };
  },
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
      "on_error": "abort", // "abort" | "warn" | "skip"
      "config": {
        /* ... */
      }
    }
  ]
}
```

---

## Mod Bundles

Mod bundles (`.dmodbundle`) allow creators to package multiple mods together as a curated collection.

### Bundle Overview

A mod bundle is a container format that packages multiple `.dmodpkg` files together with shared metadata, preview images, and optional configuration presets. Bundles enable:

- **Themed collections**: Curated sets of mods that work well together
- **Author compilations**: All mods from a creator in one package
- **Modpacks**: Complete gameplay overhauls with multiple components
- **Convenience**: One-click installation of related mods

### Key Features

1. **Independent mods**: Each mod in the bundle remains a separate `.dmodpkg` with its own metadata and dependencies
2. **Selective installation**: Users can choose which mods from the bundle to install
3. **Variant presets**: Bundle can define themed configurations that set variants across multiple mods
4. **Bundle-level previews**: Screenshots and metadata for the entire collection

### Bundle Configuration Format

Bundles are defined by a `bundle.config.json` file:

```json
{
  "$schema": "https://deadlockmods.app/schemas/bundle-config-v1.json",
  "name": "ultimate-visual-pack",
  "display_name": "Ultimate Visual Pack",
  "version": "2.1.0",
  "description": "Complete visual overhaul with character skins, UI improvements, and effects",
  "authors": ["BundleCreator"],
  "homepage": "https://github.com/creator/ultimate-visual-pack",

  "screenshots": [
    "previews/bundle_showcase_1.png",
    "previews/bundle_showcase_2.png",
    "https://example.com/bundle_video_thumbnail.jpg"
  ],

  "mods": [
    {
      "package": "character-skins-2.0.0.dmodpkg",
      "required": true,
      "description": "Core character visual improvements"
    },
    {
      "package": "enhanced-ui-1.5.0.dmodpkg",
      "required": false,
      "description": "Optional UI modernization"
    },
    {
      "package": "particle-effects-3.1.0.dmodpkg",
      "required": false,
      "description": "Enhanced visual effects"
    }
  ],

  "presets": [
    {
      "id": "dark_theme",
      "name": "Dark Theme",
      "description": "Dark color scheme across all mods",
      "default": true,
      "mods": [
        {
          "package": "character-skins-2.0.0.dmodpkg",
          "variants": {
            "skin_style": "dark"
          }
        },
        {
          "package": "enhanced-ui-1.5.0.dmodpkg",
          "variants": {
            "ui_theme": "dark"
          }
        }
      ]
    },
    {
      "id": "light_theme",
      "name": "Light Theme",
      "description": "Light color scheme across all mods",
      "mods": [
        {
          "package": "character-skins-2.0.0.dmodpkg",
          "variants": {
            "skin_style": "light"
          }
        },
        {
          "package": "enhanced-ui-1.5.0.dmodpkg",
          "variants": {
            "ui_theme": "light"
          }
        }
      ]
    },
    {
      "id": "performance",
      "name": "Performance Mode",
      "description": "Optimized settings for lower-end systems",
      "mods": [
        {
          "package": "character-skins-2.0.0.dmodpkg",
          "variants": {
            "quality": "low"
          }
        },
        {
          "package": "particle-effects-3.1.0.dmodpkg",
          "variants": {
            "effect_quality": "minimal"
          }
        }
      ]
    }
  ],

  "metadata": {
    "tags": ["visual", "bundle", "complete-pack"],
    "category": "modpack"
  }
}
```

### Bundle Configuration Schema

#### Core Fields

| Field          | Type   | Required | Description                                 |
| -------------- | ------ | -------- | ------------------------------------------- |
| `name`         | string | Yes      | Unique bundle identifier (kebab-case)       |
| `display_name` | string | Yes      | Human-readable bundle name                  |
| `version`      | string | Yes      | Bundle version (semver)                     |
| `description`  | string | Yes      | Bundle description (max 1000 chars)         |
| `authors`      | array  | Yes      | Bundle authors (not individual mod authors) |
| `homepage`     | string | No       | Bundle homepage URL                         |
| `screenshots`  | array  | No       | Bundle-level screenshots (paths or URLs)    |
| `mods`         | array  | Yes      | List of included mod packages               |
| `presets`      | array  | No       | Variant configuration presets               |
| `metadata`     | object | No       | Additional metadata (tags, category)        |

#### Mod Entry Fields

| Field         | Type    | Required | Description                                    |
| ------------- | ------- | -------- | ---------------------------------------------- |
| `package`     | string  | Yes      | Filename of the .dmodpkg file                  |
| `required`    | boolean | No       | Whether mod is required (default: true)        |
| `description` | string  | No       | Brief description of this mod's role in bundle |

#### Preset Fields

| Field         | Type    | Required | Description                         |
| ------------- | ------- | -------- | ----------------------------------- |
| `id`          | string  | Yes      | Unique preset identifier            |
| `name`        | string  | Yes      | Display name                        |
| `description` | string  | No       | Preset description                  |
| `default`     | boolean | No       | Whether this is the default preset  |
| `mods`        | array   | Yes      | Variant configurations for each mod |

Each preset mod entry contains:

- `package`: Which mod package this configuration applies to
- `variants`: Object mapping variant group IDs to variant IDs

### Bundle Project Structure

```text
ultimate-visual-pack-bundle/
├── bundle.config.json           # Bundle configuration
├── README.md                    # Bundle documentation
├── previews/                    # Bundle-level screenshots
│   ├── bundle_showcase_1.png
│   └── bundle_showcase_2.png
│
├── mods/                        # Included mod packages
│   ├── character-skins-2.0.0.dmodpkg
│   ├── enhanced-ui-1.5.0.dmodpkg
│   └── particle-effects-3.1.0.dmodpkg
│
└── build/                       # Output directory
    └── ultimate-visual-pack-2.1.0.dmodbundle
```

### Bundle Binary Format

The `.dmodbundle` file structure:

```text
┌─────────────────────────────────────────┐
│ Header                                   │ 64 bytes
├─────────────────────────────────────────┤
│ Bundle Metadata Section                  │ Variable (Zstd compressed JSON)
├─────────────────────────────────────────┤
│ Mod Package Index                        │ Variable
├─────────────────────────────────────────┤
│ Bundle Resources (screenshots, etc.)     │ Variable (Zstd compressed)
├─────────────────────────────────────────┤
│ Embedded Mod Packages                    │ Variable
│  ├─ Mod Package 0 (.dmodpkg)           │
│  ├─ Mod Package 1 (.dmodpkg)           │
│  └─ ...                                 │
└─────────────────────────────────────────┘
```

#### Bundle Header Format (64 bytes)

| Offset | Size | Type   | Description                       |
| ------ | ---- | ------ | --------------------------------- |
| 0x00   | 8    | ASCII  | Magic bytes: "DMODBNDL"           |
| 0x08   | 2    | uint16 | Format version (current: 1)       |
| 0x0A   | 2    | uint16 | Flags (reserved)                  |
| 0x0C   | 4    | uint32 | Bundle metadata offset            |
| 0x10   | 4    | uint32 | Bundle metadata compressed size   |
| 0x14   | 4    | uint32 | Bundle metadata uncompressed size |
| 0x18   | 4    | uint32 | Package index offset              |
| 0x1C   | 4    | uint32 | Package index size                |
| 0x20   | 4    | uint32 | Resources offset                  |
| 0x24   | 4    | uint32 | Resources compressed size         |
| 0x28   | 4    | uint32 | Resources uncompressed size       |
| 0x2C   | 4    | uint32 | Packages section offset           |
| 0x30   | 8    | uint64 | Total bundle size                 |
| 0x38   | 8    | uint64 | Bundle CRC64                      |

#### Bundle Metadata Section

Zstd-compressed JSON containing `bundle.config.json` plus build info:

```json
{
  "config": {
    /* bundle.config.json contents */
  },
  "build_info": {
    "builder_version": "1.0.0",
    "build_timestamp": "2025-11-10T15:30:00Z",
    "included_mods": [
      {
        "filename": "character-skins-2.0.0.dmodpkg",
        "name": "character-skins",
        "version": "2.0.0",
        "size_bytes": 45000000,
        "checksum": "sha256:abc123..."
      }
    ]
  }
}
```

#### Mod Package Index

Binary structure listing each embedded mod package:

```text
┌──────────────────────────────┐
│ Package Count (uint32)       │
├──────────────────────────────┤
│ Package Entry 0              │
│  ├─ Filename Len (uint16)   │
│  ├─ Filename (UTF-8)        │
│  ├─ Offset (uint64)         │
│  ├─ Size (uint64)           │
│  └─ SHA256 (32 bytes)       │
├──────────────────────────────┤
│ Package Entry 1              │
│ ...                          │
└──────────────────────────────┘
```

### Bundle Use Cases

#### Use Case 1: Themed Collection

A creator makes several mods that share a visual style:

```json
{
  "name": "neon-nights-collection",
  "display_name": "Neon Nights Collection",
  "mods": [
    { "package": "neon-characters.dmodpkg", "required": true },
    { "package": "neon-ui.dmodpkg", "required": true },
    { "package": "neon-effects.dmodpkg", "required": false }
  ],
  "presets": [
    {
      "id": "full_neon",
      "name": "Full Neon Experience",
      "default": true,
      "mods": [
        {
          "package": "neon-characters.dmodpkg",
          "variants": { "intensity": "high" }
        },
        {
          "package": "neon-effects.dmodpkg",
          "variants": { "glow": "maximum" }
        }
      ]
    }
  ]
}
```

#### Use Case 2: Complete Overhaul

A modpack that replaces most game systems:

```json
{
  "name": "total-conversion-pack",
  "display_name": "Total Conversion Modpack",
  "description": "Complete gameplay and visual overhaul",
  "mods": [
    { "package": "core-framework.dmodpkg", "required": true },
    { "package": "gameplay-changes.dmodpkg", "required": true },
    { "package": "visual-overhaul.dmodpkg", "required": true },
    { "package": "audio-replacement.dmodpkg", "required": false },
    { "package": "bonus-content.dmodpkg", "required": false }
  ]
}
```

#### Use Case 3: Author Collection

All mods by a single creator:

```json
{
  "name": "artist-complete-works",
  "display_name": "ArtistName: Complete Works",
  "description": "All visual mods by ArtistName in one bundle",
  "mods": [
    { "package": "hero-skins-pack.dmodpkg", "required": false },
    { "package": "map-retextures.dmodpkg", "required": false },
    { "package": "ui-redesign.dmodpkg", "required": false },
    { "package": "particle-enhancements.dmodpkg", "required": false }
  ]
}
```

---

## CLI Tooling

The `dmodpkg` CLI tool manages mod projects, packages, and bundles.

### Installation

```bash
# npm
npm install -g dmodpkg-cli

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
✓ All preview images exist and are valid
✓ Image formats are supported (PNG, JPEG, WebP)
✓ Image sizes are within recommendations
✗ Warning: Layer 'optional_sounds' is empty
✗ Warning: Variant 'default' has no preview image

Validation passed with 2 warnings.
```

##### Image Validation Rules

The validation process checks preview images and screenshots for:

1. **File existence**: All paths must reference existing files
2. **Format validation**: Only PNG, JPEG/JPG, and WebP are supported
3. **File size warnings**:
   - Warning if any image exceeds 2MB (may impact load times)
   - Error if any image exceeds 10MB (too large for package)
4. **Dimension recommendations**:
   - Preview images: 1280x720 or 1920x1080 recommended
   - Screenshots: 1920x1080 or higher recommended
5. **URL validation**: External URLs must use HTTPS protocol
6. **Path structure**: Embedded images should follow `previews/` directory structure

### Bundle Commands

#### `dmodpkg bundle pack`

Create a bundle from multiple mod packages:

```bash
dmodpkg bundle pack [options]

Options:
  --config <path>      Path to bundle.config.json (default: ./bundle.config.json)
  --output <path>      Output directory (default: ./build)
  --no-validate        Skip validation checks
```

Example:

```bash
$ dmodpkg bundle pack

Packing bundle: Ultimate Visual Pack v2.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

✓ Validated bundle configuration
✓ Validated 3 mod packages
✓ Processed bundle resources (2 screenshots)
✓ Embedded 3 mod packages (total: 125 MB)
✓ Generated bundle checksums

Bundle created: ./build/ultimate-visual-pack-2.1.0.dmodbundle
```

#### `dmodpkg bundle info`

Display bundle information:

```bash
dmodpkg bundle info <bundle> [options]

Options:
  --json               Output as JSON
  --verbose, -v        Show detailed information
```

Example:

```bash
$ dmodpkg bundle info ultimate-visual-pack-2.1.0.dmodbundle

Ultimate Visual Pack v2.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Description: Complete visual overhaul with character skins, UI improvements, and effects
Author: BundleCreator

Included Mods (3):
  ✓ character-skins v2.0.0 [required]
    Core character visual improvements

  ○ enhanced-ui v1.5.0 [optional]
    Optional UI modernization

  ○ particle-effects v3.1.0 [optional]
    Enhanced visual effects

Presets (3):
  • Dark Theme (default)
    Dark color scheme across all mods

  • Light Theme
    Light color scheme across all mods

  • Performance Mode
    Optimized settings for lower-end systems

Bundle Size: 125 MB
Screenshots: 2
```

#### `dmodpkg bundle extract`

Extract individual mod packages from a bundle:

```bash
dmodpkg bundle extract <bundle> [options]

Options:
  --output <path>      Output directory (default: ./<bundle-name>)
  --packages <names>   Extract specific packages (comma-separated)
  --all                Extract all packages (default)
```

Example:

```bash
$ dmodpkg bundle extract ultimate-visual-pack-2.1.0.dmodbundle --output ./extracted

Extracting bundle packages...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

✓ Extracted character-skins-2.0.0.dmodpkg
✓ Extracted enhanced-ui-1.5.0.dmodpkg
✓ Extracted particle-effects-3.1.0.dmodpkg

Extracted 3 packages to: ./extracted/
```

#### `dmodpkg bundle validate`

Validate a bundle project or package:

```bash
dmodpkg bundle validate [target] [options]

Options:
  --strict             Enable strict validation mode
```

Example:

```bash
$ dmodpkg bundle validate ./ultimate-visual-pack-bundle

Validating bundle project...

✓ Bundle configuration is valid
✓ All mod packages exist
✓ All mod packages are valid .dmodpkg files
✓ Preset configurations reference valid packages and variants
✓ Bundle resources (screenshots) exist
✗ Warning: Mod 'particle-effects' has no variants but is referenced in preset 'performance'

Validation passed with 1 warning.
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
  "screenshots": ["previews/mod/overview.png", "previews/mod/ingame.png"],
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
          "preview_image": "previews/hero_skin/futuristic/main.png",
          "screenshots": ["previews/hero_skin/futuristic/screenshot_1.png"],
          "layers": ["base", "futuristic_skin"]
        },
        {
          "id": "medieval",
          "name": "Medieval",
          "preview_image": "previews/hero_skin/medieval/main.png",
          "screenshots": ["previews/hero_skin/medieval/screenshot_1.png"],
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
├── previews/
│   ├── mod/
│   │   ├── overview.png
│   │   └── ingame.png
│   └── hero_skin/
│       ├── futuristic/
│       │   ├── main.png
│       │   └── screenshot_1.png
│       └── medieval/
│           ├── main.png
│           └── screenshot_1.png
└── content/
    ├── base/
    │   ├── core.vpk
    │   └── sounds.vpk
    ├── futuristic_skin/
    │   └── characters.vpk
    └── medieval_skin/
        └── characters.vpk
```

### Example 3: Mod with Optional Layers

Mod with a base layer and optional enhancement layers.

**mod.config.json:**

```json
{
  "name": "environment-pack",
  "display_name": "Environment Enhancement Pack",
  "version": "1.5.0",
  "description": "Enhanced environmental effects and textures",
  "authors": ["DevName"],
  "layers": [
    {
      "name": "base",
      "priority": 0,
      "description": "Core environmental improvements",
      "required": true
    },
    {
      "name": "hd_textures",
      "priority": 10,
      "description": "High-resolution texture pack",
      "required": false
    },
    {
      "name": "particle_effects",
      "priority": 5,
      "description": "Enhanced particle effects",
      "required": false
    }
  ]
}
```

### Example 4: Complex Mod (Variants + Layers)

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
  "screenshots": [
    "previews/mod/main_menu.png",
    "previews/mod/gameplay_1.png",
    "https://example.com/external_comparison.jpg"
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
          "preview_image": "previews/visual_style/realistic/main.png",
          "screenshots": [
            "previews/visual_style/realistic/characters.png",
            "previews/visual_style/realistic/environments.png"
          ],
          "layers": ["base", "realistic_visuals"]
        },
        {
          "id": "stylized",
          "name": "Stylized",
          "description": "Artistic style",
          "preview_image": "previews/visual_style/stylized/main.png",
          "screenshots": [
            "previews/visual_style/stylized/characters.png",
            "previews/visual_style/stylized/environments.png"
          ],
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
    {
      "name": "base",
      "priority": 0,
      "description": "Core files",
      "required": true
    },
    { "name": "realistic_visuals", "priority": 10, "required": false },
    { "name": "stylized_visuals", "priority": 10, "required": false },
    { "name": "low_spec", "priority": 5, "required": false },
    { "name": "med_spec", "priority": 5, "required": false },
    { "name": "high_spec", "priority": 5, "required": false },
    {
      "name": "enhanced_audio",
      "priority": 15,
      "description": "Optional sound pack",
      "required": false
    },
    {
      "name": "bonus_content",
      "priority": 20,
      "description": "Extra features",
      "required": false
    }
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
├── previews/
│   ├── mod/
│   │   ├── main_menu.png
│   │   └── gameplay_1.png
│   └── visual_style/
│       ├── realistic/
│       │   ├── main.png
│       │   ├── characters.png
│       │   └── environments.png
│       └── stylized/
│           ├── main.png
│           ├── characters.png
│           └── environments.png
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

### Dependency Management System

Mod dependencies are not currently common in the Deadlock modding ecosystem, so this feature is reserved for future exploration. If the modding community develops a need for mods that require other mods to function, the following system could be implemented:

#### Potential Dependency Declaration

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

#### Version Constraint Syntax

Following npm-style semantic versioning:

| Constraint       | Meaning                    | Example Match                   |
| ---------------- | -------------------------- | ------------------------------- |
| `1.2.3`          | Exact version              | 1.2.3 only                      |
| `^1.2.3`         | Compatible (minor updates) | 1.2.3, 1.5.0, 1.9.9 (not 2.0.0) |
| `~1.2.3`         | Patch updates only         | 1.2.3, 1.2.9 (not 1.3.0)        |
| `>=1.0.0`        | Minimum version            | 1.0.0, 2.5.1, 99.0.0            |
| `>=1.0.0 <2.0.0` | Range                      | 1.0.0 to 1.9.9                  |

#### Dependency Resolution Considerations

A potential dependency system would need to handle:

- Topological sort for install order
- Circular dependency detection
- Version conflict resolution
- Optional vs required dependencies
- Dependency metadata tracking

This feature would add complexity to mod managers and may not be necessary unless framework-style mods become common in the Deadlock modding community.

### Schema Versioning

Format version in header allows future evolution:

- **Version 1**: Current specification
- **Version 2+**: Backward-compatible additions
- **Major versions**: Breaking changes (new magic bytes)

### Community Feedback

This RFC is open for community discussion. Key areas for feedback:

1. Configuration format (JSON vs TOML vs YAML)
2. Binary format efficiency (compression, chunk size)
3. Transformer plugin system design
4. CLI command ergonomics
5. Migration tooling requirements
6. Bundle preset system design

---

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Zstandard Compression](https://facebook.github.io/zstd/)
- [SPDX License List](https://spdx.org/licenses/)
- [League Toolkit - ltk_modpkg](https://github.com/LeagueToolkit/league-mod)
- [NPM Package JSON](https://docs.npmjs.com/cli/v9/configuring-npm/package-json)

---

## Changelog

### Version 0.3.0 (2025-11-10)

- **Added mod bundle support**:
  - New `.dmodbundle` file format for packaging multiple mods
  - `bundle.config.json` schema with bundle metadata
  - Bundle-level screenshots and previews
  - Variant preset system for themed configurations across mods
  - Selective installation (required vs optional mods)
  - Binary format specification for bundles
  - Bundle version independent from individual mod versions
  - CLI commands: `bundle pack`, `bundle info`, `bundle extract`, `bundle validate`
  - Use cases and examples for themed collections, modpacks, and author compilations
- **Removed installation commands from CLI specification**:
  - Installation is handled by mod managers, not the packaging CLI tool
  - Removed `install`, `uninstall`, `list`, and `upgrade` commands
  - Focus on package creation, validation, and extraction
- **Moved dependency management to Future Considerations**:
  - Dependencies are not common in Deadlock modding currently
  - Full dependency system reserved for future implementation if needed
  - Removed dependency examples and references from main specification

### Version 0.2.0 (2025-11-10)

- **Added preview image support**:
  - Mod-level `screenshots` array field in root configuration
  - Per-variant `preview_image` and `screenshots` fields
  - `previews/` directory structure specification
  - Support for both embedded images (PNG, JPEG, WebP) and external URLs
  - Image validation rules and recommendations
  - Binary format documentation for image storage
- **Removed icon requirement**: Mods no longer require 256x256 icon images

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

This specification is released under GPL-3.0 - See LICENSE file for details.
