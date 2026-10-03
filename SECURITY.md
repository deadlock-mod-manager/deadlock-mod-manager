# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version  | Supported |
| -------- | --------- |
| Latest   | ✅ Yes    |
| < Latest | ❌ No     |

We recommend always using the latest version from our [releases page](https://github.com/stormix/deadlock-modmanager/releases/latest).

## Reporting Security Vulnerabilities

### 🚨 How to Report

For security vulnerabilities, please report them **privately** through:

1. **GitHub Security Advisories** (Recommended): [Security tab](https://github.com/stormix/deadlock-modmanager/security/advisories) → "Report a vulnerability"
2. **Email**: [security@deadlockmods.app](mailto:security@deadlockmods.app)
3. **Discord**: [@stormix](https://discord.com/users/stormix) on our [Discord server](https://discord.gg/WbFNt8CCr8)

### 📝 What to Include

- **Description**: Clear description of the vulnerability
- **Impact**: Potential impact and affected components
- **Reproduction**: Step-by-step instructions to reproduce
- **Environment**: OS, app version, and relevant configuration

### 🕐 Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: 1-30 days (depending on severity)
- **Disclosure**: After fix is released

## Security Measures

### Application Security

- **Tauri Framework**: Sandboxed environment with capability-based permissions
- **Network Access**: Limited to trusted domains (gamebanana.com, deadlockmods.app, deadlock-api.com, deadworks.net) plus Valve's Steam servers when match sync is enabled. Deadworks hosts community server listings and their content manifests.
- **File System**: Restricted access to app data, user-selected mod directories, and — when match sync is enabled — the Steam configuration files described below
- **Input Validation**: All user inputs are validated and sanitized

### Steam Account Access (Match Sync)

Match sync is **opt-in and disabled by default**. It requires an explicit consent step, and turning it off stops all background work immediately. When you enable it:

- **Credentials read locally**: The app reads Steam's `config/loginusers.vdf` to list remembered accounts, and reads the `ConnectCache` blob from `local.vdf` to recover each account's Steam refresh token. The token is decrypted with the same OS-bound mechanism Steam itself uses — DPAPI on Windows, AES-256 derived from the account name on Linux and macOS — so it can only be recovered on your own machine, under your own user account.
- **Token handling**: The refresh token is a live account credential. It is held **in memory only** for the duration of a sync — never logged, never written to disk by us, and never transmitted to our servers or any third party other than Valve.
- **What it is used for**: The token authenticates a session against Valve's Steam servers (CM + Deadlock Game Coordinator) so the app can request your own match history and per-match salts, exactly as the game client would.
- **We never ask for your Steam password**: The app has no login form and never prompts for Steam credentials. It only reuses the session Steam already stored when you chose "remember me".
- **Rate limiting**: Requests to the Game Coordinator are throttled and capped per account (40 match fetches per rolling 24 hours) to stay well within Valve's limits.

### Data Shared by Match Sync

When match sync is enabled, the following is sent to `api.deadlock-api.com`:

- Your Steam3 account id, used to ask which of your matches still need data
- Match ids and their replay/metadata salts and cluster ids

No Steam credentials, tokens, personal messages, friend lists, or account details are transmitted. Match ids and salts are public match identifiers, not private account data.

### User Privacy

- **No Telemetry by Default**: We don't collect or store personal information unless you opt in to match sync
- **Local Storage**: All app data — including mods, settings, and sync state — is stored locally on your device
- **Optional Analytics**: Can be disabled in settings
- **Revocable**: Disabling match sync stops all Steam session use and data sharing. You can also revoke the app's access at any time from Steam by signing out of "remember me" or deauthorizing your devices in Steam account settings.

### Mod Safety

- **Source Verification**: All mods from GameBanana's official API
- **Checksum Validation**: Files verified when checksums available
- **User Responsibility**: Users should scan mods with antivirus software

## Best Practices for Users

### Safe Installation

1. Download only from [official releases](https://github.com/stormix/deadlock-modmanager/releases/latest)
2. Scan downloads with antivirus software
3. Keep your system and the app updated

### Mod Safety

1. Install mods only from reputable GameBanana creators
2. Check reviews and ratings before installation
3. Backup game saves before installing new mods
4. Report suspicious mod behavior immediately

## Known Security Considerations

### Windows SmartScreen

New releases may trigger Windows SmartScreen warnings due to the code signing process. This is normal for new applications. Click "More info" → "Run anyway" after verifying the download source.

### Antivirus False Positives

Some antivirus software may flag the application due to file system access and network features. We work to minimize false positives.

With match sync enabled, the app reads and decrypts Steam's stored session token — the same behaviour credential-stealing malware exhibits — so some security software may flag it. This is why the feature is opt-in, why the token never leaves your machine, and why the relevant code lives in a small, auditable module ([`apps/desktop/src-tauri/src/match_sync/auth.rs`](apps/desktop/src-tauri/src/match_sync/auth.rs)). If you are not comfortable with this trade-off, leave match sync disabled; the rest of the app is unaffected.

### Mod Execution Risks

- Mods can execute code within the game environment
- Users are responsible for vetting mods before installation
- Mod conflicts can cause game instability

## Contact Information

- **Security Email**: [security@deadlockmods.app](mailto:security@deadlockmods.app)
- **Primary Maintainer**: [@stormix](https://github.com/stormix)
- **Discord Server**: [Join for support](https://discord.gg/WbFNt8CCr8)
- **GitHub Security**: [Security Advisories](https://github.com/stormix/deadlock-modmanager/security/advisories)

---

**Last Updated**: August 2026

> **Note**: This security policy is regularly reviewed and updated. Check this document periodically for the latest information.
