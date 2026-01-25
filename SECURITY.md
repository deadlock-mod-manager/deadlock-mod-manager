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
- **Network Access**: Limited to trusted domains (gamebanana.com, deadlockmods.app)
- **File System**: Restricted access to app data and user-selected mod directories
- **Input Validation**: All user inputs are validated and sanitized

### User Privacy

- **No Personal Data Collection**: We don't collect or store personal information
- **Local Storage**: All data stored locally on your device
- **Optional Analytics**: Can be disabled in settings

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

**Last Updated**: December 2024

> **Note**: This security policy is regularly reviewed and updated. Check this document periodically for the latest information.
