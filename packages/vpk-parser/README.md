# @deadlock-mods/vpk-parser

Rust VPK parser with Bun FFI bindings, used to fingerprint GameBanana mod files.

## What are VPK Files?

VPK (Valve Package Format) files are archive containers used by Valve games to store game assets, textures, sounds, and mod content. In the context of Deadlock modding:

- **Mod Distribution**: Mods are packaged as `.vpk` files for easy distribution and installation
- **Asset Storage**: Game assets like textures, models, and sounds are stored in VPK archives
- **Metadata**: VPK files contain directory trees, file hashes, and integrity checksums
- **Performance**: VPK format allows for efficient random access to individual files within the archive

## Use Cases

This VPK parser is used across the Deadlock modding ecosystem:

- The online VPK analyzer uses it to inspect mod files
- Lockdex uses it to index Deadlock mods by analyzing VPK files from GameBanana
- The mod manager uses it to detect installed mods by comparing VPK fingerprints
- Its fingerprints identify mod files, which prevents duplicates and tracks versions

This parser extracts all metadata from VPK files including:

- File directory structure and entries
- Content hashes and fingerprints for mod identification
- File sizes, offsets, and checksums
- Archive integrity verification data

## Requirements

- **Bun >= 1.0.0** (uses Bun's native FFI capabilities)
- **Rust toolchain** (for building the native library)

## Installation

```bash
pnpm add @deadlock-mods/vpk-parser
```

## Building

Before using the package, you need to build the native Rust library:

```bash
# Build the native library
pnpm run build
```

## Usage

### Basic Usage

```typescript
import { VpkParser, parseVpkFile, getVpkInfo } from "@deadlock-mods/vpk-parser";

// Parse a VPK file
const parsed = VpkParser.parseFile("path/to/file.vpk", {
  include_full_file_hash: true,
  include_merkle: true,
});

console.log(`VPK contains ${parsed.entries.length} files`);
console.log(`Fast hash: ${parsed.fingerprint.fast_hash}`);

// Get quick info (fastest operation)
const info = getVpkInfo(buffer);
console.log(`Version: ${info.version}, Files: ${info.file_count}`);
```

### Advanced Usage

```typescript
import {
  parseVpk,
  getVpkHashes,
  getVpkInfoFromFile,
} from "@deadlock-mods/vpk-parser";
import { readFileSync } from "fs";

// Parse from buffer with options
const buffer = readFileSync("mod.vpk");
const parsed = parseVpk(buffer, {
  include_full_file_hash: true,
  include_merkle: true,
  file_path: "mod.vpk",
  last_modified: new Date(),
});

// Get hashes for mod identification
const hashes = getVpkHashes(buffer, "mod.vpk");
console.log("Content signature:", hashes.content_signature);
console.log("Merkle root:", hashes.merkle_root);

// Quick file info
const info = getVpkInfoFromFile("mod.vpk");
console.log("Manifest SHA256:", info.manifest_sha256);
```

## API Reference

### Classes

#### `VpkParser`

Main parser class providing high-level VPK parsing functionality.

- `VpkParser.parse(buffer: Buffer, options?: VpkParseOptions): VpkParsed`
- `VpkParser.parseFile(filePath: string, options?: VpkParseOptions): VpkParsed`

### Functions

#### Parsing Functions

- `parseVpk(buffer: Buffer, options?: VpkParseOptions): VpkParsed`
- `parseVpkFile(filePath: string, options?: VpkParseOptions): VpkParsed`

#### Hash Functions

- `getVpkHashes(buffer: Buffer, filePath?: string): VpkFingerprint`
- `getVpkHashesFromFile(filePath: string): VpkFingerprint`

#### Info Functions

- `getVpkInfo(buffer: Buffer): VpkInfo`
- `getVpkInfoFromFile(filePath: string): VpkInfo`

#### Utility Functions

- `getVersion(): string` - Get native library version

### Types

```typescript
interface VpkParseOptions {
  include_full_file_hash?: boolean;
  include_merkle?: boolean;
  file_path?: string;
  last_modified?: Date;
}

interface VpkParsed {
  header: VpkHeader;
  entries: VpkEntry[];
  tree_length: number;
  fingerprint: VpkFingerprint;
}

interface VpkFingerprint {
  fast_hash: string; // xxHash64
  manifest_sha256: string; // SHA256 of directory tree
  content_signature: string; // Content-based hash
  has_multiparts: boolean;
  has_inline_data: boolean;
  merkle_root?: string; // Optional Merkle tree root
}
```

## Development

### Building

```bash
# Build release version
pnpm run build

# Build debug version
pnpm run build:debug

# Clean build artifacts
pnpm run clean
```

### Testing

```bash
# Run tests
pnpm test

# Check Rust code
pnpm run check
```

### Project Structure

```
packages/vpk-parser/
├── src/              # TypeScript source files
│   ├── index.ts      # Main exports
│   ├── types.ts      # Type definitions
│   ├── parser.ts     # VpkParser class
│   └── ffi.ts        # FFI bindings
├── src-rs/           # Rust source files
│   ├── lib.rs        # FFI interface
│   ├── parser.rs     # Core parser logic
│   ├── types.rs      # Rust type definitions
│   └── error.rs      # Error handling
├── test/             # Test files
├── data/             # Test data
└── target/           # Rust build output
```

## License

GPL-3.0 - See LICENSE file for details.
