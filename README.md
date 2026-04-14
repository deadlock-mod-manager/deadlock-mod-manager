<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<div align="center">
<h1> Deadlock Mod Manager</h1>
</div>
<!-- Project Stats -->
<div align="center">

[![Downloads][downloads-status]][downloads-url]
[![Contributors][contributors-status]][contributors-url]
[![GitHub Release][release-status]][release-url]
[![GitHub Issues or Pull Requests][issues-status]][issues-url]
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1psci.svg)](https://uptime.betterstack.com/?utm_source=status_badge)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/deadlock-mod-manager/deadlock-mod-manager)
[![License][license-status]][license-url]
![Discord](https://img.shields.io/discord/1322369530386710568?label=discord)
[![Built with Tauri][tauri-status]][tauri-url]

</div>
<br />
<div align="center">
  <a href="https://github.com/deadlock-mod-manager/deadlock-mod-manager">
    <img src="./apps/desktop/src-tauri/icons/128x128.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Deadlock Mod Manager</h3>

  <p align="center">
    A mod manager for the Valve game Deadlock, built with Tauri, React, and TypeScript.
    <br />
    <br />
    <a href="https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest">Download</a>
    ·
    <a href="https://docs.deadlockmods.app/">Documentation</a>
    ·
    <a href="https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
  
<!-- Distribution & Platforms -->
[![Windows][windows-status]][windows-url]
[![Linux][linux-status]][linux-url]
[![AUR][aur-status]][aur-url]

  <img src="./docs/assets/deadlock-mod-manager.png" alt="Deadlock Mod Manager" width="600">
  
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#screenshots">Screenshots</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#whats-inside">What's inside?</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#translation--localization">Translation & Localization</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
    <li><a href="#sponsors">Sponsors</a></li>
  </ol>
</details>

## Usage

For detailed installation instructions, getting started guides, troubleshooting, and feature documentation, please visit our comprehensive documentation:

**[Player Guide](https://docs.deadlockmods.app/using-mod-manager)** - Installation, usage, and troubleshooting

For help and support:

- [Full Documentation](https://docs.deadlockmods.app/)
- [Discord Community](https://deadlockmods.app/discord)
- [Report Issues](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues)

> [!WARNING]
> **Linux Support - Limited**
>
> Linux support is provided on a **best-effort basis**. Due to a lack of contributors with Linux expertise and the maintainer's limited experience distributing software across the many Linux distributions, you may encounter packaging issues, missing dependencies, or platform-specific bugs. If you're a Linux user and want to help improve support, contributions are very welcome! Please reach out on [Discord](https://deadlockmods.app/discord) or open a PR.

<br />

## Development

For development setup, project architecture, contributing guidelines, and API integration documentation, please visit:

- **[Developer Documentation](https://docs.deadlockmods.app/developer-docs)** - Development setup and architecture
- **[API Reference](https://docs.deadlockmods.app/api)** - Interactive API documentation

### Development with Nix (Linux only)

[![Built with Nix](https://img.shields.io/badge/Built_With-Nix-5277C3.svg?logo=nixos&labelColor=73C3D5)](https://nixos.org)

For Linux developers, we provide a complete Nix development environment:

```bash
# Clone and enter the project
git clone https://github.com/deadlock-mod-manager/deadlock-mod-manager.git
cd deadlock-mod-manager

# Start development shell (or use direnv for automatic loading)
nix develop

# Install dependencies and start
pnpm install
pnpm desktop:dev
```

The Nix environment includes everything you need: Rust, Node.js, pnpm, Docker, system libraries, and all development tools.

For detailed Nix setup instructions, see [CONTRIBUTING.md](CONTRIBUTING.md#development-with-nix).

## Translation & Localization

🌍 **Help us translate Deadlock Mod Manager!**

We're actively working to make Deadlock Mod Manager accessible to users worldwide. Join our translation efforts and help bring the mod manager to your language!

<details>
  <summary><strong>Currently Supported Languages</strong></summary>

<!-- LANGUAGE_TABLE_START -->

| Language | Native Name | Status | Contributors |
|----------|-------------|--------|-------------|
| 🇺🇸 **English** (Default) | English | ✅ Complete | - |
| 🇧🇬 **Bulgarian** | Български | ✅ Complete | [macchiako](https://discordapp.com/users/macchiako./) |
| 🇩🇪 **German** | Deutsch | ✅ Complete | [skeptic](https://github.com/Skeptic-systems) |
| 🇫🇷 **French** | Français | ✅ Complete | [stormix](https://github.com/stormix) |
| 🇷🇺 **Russian** | Русский | ✅ Complete | [awkward_akio](https://discordapp.com/users/awkward_akio/), [Thyron](https://github.com/baka-thyron) |
| 🇸🇦 **Arabic** | العربية | ✅ Complete | [archeroflegend](https://discordapp.com/users/archeroflegend/) |
| 🇵🇱 **Polish** | Polski | ✅ Complete | [_manio](https://discordapp.com/users/_manio/) |
| 🇨🇭 **Swiss German** | Schwiizerdütsch | ✅ Complete | [degoods_deedos](https://discordapp.com/users/degoods_deedos/) |
| 🇹🇭 **Thai** | ไทย | ✅ Complete | [altqx](https://discordapp.com/users/altq/) |
| 🇹🇷 **Turkish** | Türkçe | ✅ Complete | [kenanala](https://discordapp.com/users/kenanala/) |
| 🇨🇳 **Chinese (Simplified)** | 简体中文 | ✅ Complete | [待到春深方挽柳](mailto:sfk_04@qq.com) |
| 🇹🇼 **Chinese (Traditional)** | 繁體中文 | ✅ Complete | [白雲](https://github.com/phillychi3) |
| 🇪🇸 **Spanish** | Español | ✅ Complete | [chikencio](https://discordapp.com/users/chikencio/) |
| 🇧🇷 **Portuguese (Brazil)** | Português (Brasil) | ✅ Complete | [meneee](https://discordapp.com/users/meneee/) |
| 🇮🇹 **Italian** | Italiano | ✅ Complete | [Constrat](https://github.com/Constrat) |
| 🇯🇵 **Japanese** | 日本語 | ✅ Complete | [hiropiki](https://discordapp.com/users/hiropiki/) |
| 🇰🇷 **Korean** | 한국어 | ✅ Complete | [Quinnly_IRL](https://discordapp.com/users/Quinnly_IRL/) |

<!-- LANGUAGE_TABLE_END -->
</details>

### How to Help

1. **Join our Discord server**: First [join our Discord server](https://deadlockmods.app/discord) to access the translation channels
2. **Visit the translation channel**: Head to the [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067) channel
3. **Suggest a new language**: Open an issue to request support for your language
4. **Improve existing translations**: Found an error or better phrasing? Submit a PR!

### Translation Helper Script

We provide an interactive CLI tool to make translating easier:

```bash
pnpm translate
```

The script offers two modes:

- **Create a new translation**: Guides you through creating a complete translation for a new language
- **Update an existing translation**: Finds missing strings and lets you translate only what's needed

**Features:**

- Step-by-step translation with English reference text
- Pause anytime with `pause` command - your progress is saved
- Continue later using "Update existing translation"
- Automatic registration in all required files

Translation files are located in `apps/desktop/src/locales/` - we use [react-i18next](https://react.i18next.com/) for internationalization.

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

For comprehensive contributing guidelines, development setup, code style standards, and best practices, please see:

- **[CONTRIBUTING.md](CONTRIBUTING.md)**
- **[Contributing Documentation](https://docs.deadlockmods.app/developer-docs/contributing)**

> **AI-Assisted Contributions:** We welcome AI-assisted contributions! Please review our [AI Policy](./AI_POLICY.md) for guidelines on disclosure and quality expectations.

### Top contributors:

<a href="https://github.com/deadlock-mod-manager/deadlock-mod-manager/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=stormix/deadlock-modmanager" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE.md](LICENSE.md) file for details.

**Disclaimer:** This project is not affiliated with Valve Corporation. Deadlock and the Deadlock logo are registered trademarks of Valve Corporation.

## Contact

- **Project Repository**: [GitHub](https://github.com/deadlock-mod-manager/deadlock-mod-manager)
- **Issues & Bug Reports**: [GitHub Issues](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/deadlock-mod-manager/deadlock-mod-manager/discussions)
- **Discord Community**: [Join our Discord](https://deadlockmods.app/discord)
- **Author**: [Stormix](https://github.com/Stormix)

For support and questions, please use GitHub Issues or join our Discord community. We're always happy to help!

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

This project was only possible thanks to the amazing open source community, especially:

### Special Thanks

- **[GameBanana](https://gamebanana.com/)** - Our primary mod source and the backbone of this application. GameBanana provides the comprehensive mod database and API that makes browsing, discovering, and downloading Deadlock mods possible. This project would not exist without their excellent platform and community-driven content.
- **[RapidRAW](https://github.com/CyberTimon/RapidRAW/)** - A Tauri project that inspired our CI pipelines, Linux optimizations, and packaging/distribution approach. Thank you for sharing your setup and best practices.

<details>
  <summary><strong>Open Source Libraries</strong></summary>

**Framework & Build**

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Tauri](https://tauri.app/)
- [Turborepo](https://turbo.build/)
- [pnpm](https://pnpm.io/)

**Backend**

- [Bun](https://bun.sh/)
- [Hono](https://hono.dev/)
- [oRPC](https://orpc.unnoq.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Zod](https://zod.dev/)

**UI & Styling**

- [shadcn/ui](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Phosphor Icons](https://phosphoricons.com/)
- [React Icons](https://react-icons.github.io/react-icons/search)

**TanStack**

- [TanStack Query](https://tanstack.com/query)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Table](https://tanstack.com/table)
- [TanStack Form](https://tanstack.com/form)
- [TanStack Virtual](https://tanstack.com/virtual)

**Other**

- [Sentry](https://sentry.io/)
- [react-i18next](https://react.i18next.com/)

</details>

## Sponsors

<p align="center">
  <a href="https://signpath.io/?utm_source=foundation&utm_medium=github&utm_campaign=deadlock-mod-manager">
    <img src="https://avatars.githubusercontent.com/u/34448643" alt="SignPath" height="60" />
  </a>
</p>

<p align="center">
  Free code signing on Windows provided by <a href="https://signpath.io/?utm_source=foundation&utm_medium=github&utm_campaign=deadlock-mod-manager">SignPath.io</a><br/>
  Certificate by <a href="https://signpath.org/?utm_source=foundation&utm_medium=github&utm_campaign=deadlock-mod-manager">SignPath Foundation</a>
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[downloads-status]: https://img.shields.io/github/downloads/stormix/deadlock-modmanager/latest/total
[downloads-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest
[stars-status]: https://img.shields.io/github/stars/stormix/deadlock-modmanager
[stars-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/stargazers
[release-status]: https://img.shields.io/github/v/release/stormix/deadlock-modmanager
[release-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest
[issues-status]: https://img.shields.io/github/issues/stormix/deadlock-modmanager
[issues-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues
[license-status]: https://img.shields.io/github/license/stormix/deadlock-modmanager
[license-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/blob/main/LICENSE.md
[aur-status]: https://img.shields.io/aur/version/deadlock-modmanager
[aur-url]: https://aur.archlinux.org/packages/deadlock-modmanager
[tauri-status]: https://img.shields.io/badge/built_with-Tauri-24C8DB?logo=tauri
[tauri-url]: https://tauri.app/
[typescript-status]: https://img.shields.io/badge/typescript-007ACC?logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[rust-status]: https://img.shields.io/badge/rust-000000?logo=rust&logoColor=white
[rust-url]: https://www.rust-lang.org/
[commit-activity-status]: https://img.shields.io/github/commit-activity/m/stormix/deadlock-modmanager
[commit-activity-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/graphs/commit-activity
[last-commit-status]: https://img.shields.io/github/last-commit/stormix/deadlock-modmanager
[last-commit-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/commits/main
[contributors-status]: https://img.shields.io/github/contributors/stormix/deadlock-modmanager
[contributors-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/graphs/contributors
[forks-status]: https://img.shields.io/github/forks/stormix/deadlock-modmanager
[forks-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/network/members
[windows-status]: https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white
[windows-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest
[linux-status]: https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black
[linux-url]: https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest
