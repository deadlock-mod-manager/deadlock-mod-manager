# Cryptography Security

Covers encryption, hashing, key management, random number generation, and token
handling relevant to a Tauri desktop app with a web API backend.

## Algorithms

### Recommended

| Purpose               | Algorithm                  | Rust Crate          | TypeScript                 |
| --------------------- | -------------------------- | ------------------- | -------------------------- |
| Symmetric encryption  | AES-256-GCM                | `aes-gcm`           | `@noble/ciphers`           |
| Asymmetric encryption | X25519 + ChaCha20-Poly1305 | `x25519-dalek`      | `@noble/curves`            |
| Digital signatures    | Ed25519                    | `ed25519-dalek`     | `@noble/ed25519`           |
| Password hashing      | Argon2id                   | `argon2`            | `argon2` (WASM)            |
| General hashing       | SHA-256 / BLAKE3           | `sha2` / `blake3`   | `crypto.subtle`            |
| CSPRNG                | OS-provided                | `rand::rngs::OsRng` | `crypto.getRandomValues()` |

### Avoid

| Algorithm                        | Why                                           |
| -------------------------------- | --------------------------------------------- |
| MD5, SHA-1                       | Broken for any security purpose               |
| AES-ECB                          | No semantic security, patterns visible        |
| AES-CBC without HMAC             | Padding oracle attacks                        |
| RSA < 2048 bits                  | Factorable                                    |
| `rand::thread_rng()` for secrets | Not cryptographically secure on all platforms |
| `Math.random()`                  | Not cryptographically secure                  |

## Vulnerable Patterns

```rust
// VULNERABLE: Weak RNG for security token
use rand::Rng;
let token: String = rand::thread_rng()
    .sample_iter(&rand::distributions::Alphanumeric)
    .take(32)
    .map(char::from)
    .collect();

// VULNERABLE: MD5 for integrity verification
use md5;
let checksum = md5::compute(&file_data);

// VULNERABLE: Hardcoded encryption key
const KEY: &[u8] = b"my-secret-key-that-is-in-source!";
```

```typescript
// VULNERABLE: Math.random for session tokens
const token = Math.random().toString(36).substring(2);

// VULNERABLE: Weak hash for passwords
import { createHash } from "crypto";
const hash = createHash("md5").update(password).digest("hex");
```

## Safe Patterns

```rust
// SAFE: OS-provided CSPRNG
use rand::rngs::OsRng;
let mut key = [0u8; 32];
OsRng.fill_bytes(&mut key);

// SAFE: BLAKE3 for file integrity (fast, secure)
let hash = blake3::hash(&file_data);

// SAFE: Argon2id for password hashing
use argon2::{Argon2, PasswordHasher};
let salt = SaltString::generate(&mut OsRng);
let hash = Argon2::default().hash_password(password.as_bytes(), &salt)?;

// SAFE: AES-256-GCM with random nonce
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
let cipher = Aes256Gcm::new(&key.into());
let nonce = Nonce::from(OsRng.gen::<[u8; 12]>());
let ciphertext = cipher.encrypt(&nonce, plaintext)?;
```

```typescript
// SAFE: crypto.subtle for hashing
const hash = await crypto.subtle.digest("SHA-256", data);

// SAFE: crypto.getRandomValues for tokens
const token = crypto.getRandomValues(new Uint8Array(32));
```

## Key Management

```rust
// VULNERABLE: Key in source code
const SIGNING_KEY: &str = "sk_live_abc123...";

// VULNERABLE: Key in environment variable logged at startup
println!("Starting with key: {}", std::env::var("SECRET_KEY")?);

// SAFE: Key loaded from OS keychain
let keyring = keyring::Entry::new("deadlock-mod-manager", "signing-key")?;
let key = keyring.get_password()?;

// SAFE: Key embedded at build time, not in repo
let key = include_bytes!("../keys/signing.key"); // in .gitignore
```

## Mod Verification

For verifying mod integrity from GameBanana:

```rust
// ACCEPTABLE: SHA-256 checksum for download integrity (not authentication)
fn verify_download(data: &[u8], expected_sha256: &str) -> Result<bool> {
    let hash = sha2::Sha256::digest(data);
    Ok(format!("{:x}", hash) == expected_sha256)
}

// BETTER: If GameBanana provides signatures, verify them
fn verify_mod_signature(data: &[u8], signature: &[u8], pub_key: &[u8]) -> Result<bool> {
    let key = ed25519_dalek::VerifyingKey::from_bytes(pub_key)?;
    let sig = ed25519_dalek::Signature::from_bytes(signature)?;
    Ok(key.verify_strict(data, &sig).is_ok())
}
```

## Detection Patterns

```
# Weak algorithms
grep -rn 'md5\|sha1\|MD5\|SHA1' --include='*.rs' --include='*.ts'
grep -rn 'createHash.*md5\|createHash.*sha1' --include='*.ts'

# Weak RNG
grep -rn 'Math\.random' --include='*.ts' --include='*.tsx'
grep -rn 'thread_rng' --include='*.rs'

# Hardcoded secrets
grep -rn 'sk_\|pk_\|-----BEGIN\|secret.*=.*"' --include='*.rs' --include='*.ts' | grep -v '.env\|test\|example'

# ECB mode
grep -rn 'ECB\|ecb' --include='*.rs' --include='*.ts'

# Key storage
grep -rn 'keyring\|keychain\|credential' --include='*.rs'
```

## Checklist

- [ ] No MD5 or SHA-1 used for security purposes (checksums for caching are OK)
- [ ] `OsRng` used for all cryptographic randomness in Rust
- [ ] `crypto.getRandomValues()` used for all security tokens in TypeScript
- [ ] No `Math.random()` for anything security-related
- [ ] Passwords hashed with Argon2id (not bcrypt, not SHA-256)
- [ ] Encryption uses authenticated modes (AES-GCM, ChaCha20-Poly1305)
- [ ] No hardcoded keys, tokens, or secrets in source code
- [ ] Signing keys stored outside repository (OS keychain or build-time injection)
- [ ] OTA update signatures use Ed25519 or RSA-2048+
- [ ] Mod download checksums verified before extraction
