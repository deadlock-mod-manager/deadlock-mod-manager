<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<div align="center">
<h1> Deadlock Mod Manager</h1>
</div>
<!-- Project Stats -->
<div align="center">

[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/stormix/deadlock-modmanager/blob/main/README.md)
[![de](https://img.shields.io/badge/lang-de-yellow.svg)](https://github.com/stormix/deadlock-modmanager/blob/main/README.de.md)
[![fr](https://img.shields.io/badge/lang-fr-blue.svg)](https://github.com/stormix/deadlock-modmanager/blob/main/README.fr.md)

[![Downloads][downloads-status]][downloads-url]
[![Contributors][contributors-status]][contributors-url]
[![GitHub Release][release-status]][release-url]
[![GitHub Issues or Pull Requests][issues-status]][issues-url]
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1psci.svg)](https://uptime.betterstack.com/?utm_source=status_badge)
[![License][license-status]][license-url]
![Discord](https://img.shields.io/discord/1322369530386710568?label=discord)
[![Built with Tauri][tauri-status]][tauri-url]

</div>
<br />
<div align="center">
  <a href="https://github.com/stormix/deadlock-modmanager">
    <img src="./apps/desktop/src-tauri/icons/128x128.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Deadlock Mod Manager</h3>

  <p align="center">
    A mod manager for the Valve game Deadlock, built with Tauri, React, and TypeScript.
    <br />
    <br />
    <a href="https://github.com/stormix/deadlock-modmanager/releases/latest">Download</a>
    ·
    <a href="https://docs.deadlockmods.app/">Documentation</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
  
<!-- Distribution & Platforms -->
[![Windows][windows-status]][windows-url]
[![macOS][macos-status]][macos-url]
[![Linux][linux-status]][linux-url]
[![AUR][aur-status]][aur-url]

  <img src="./docs/assets/mods.png" alt="Deadlock Mod Manager" width="600">
  
</div>

<br />

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#screenshots">Screenshots</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#whats-inside">What's inside?</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#development">Development</a></li>
      </ul>
    </li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## Screenshots

<details>
<summary>Click to view screenshots</summary>

### Main Application

![Deadlock Mod Manager](./docs/assets/mods.png)

### Mods Browser

![Mods Browser](./docs/assets/mods.png)

### Individual Mod Pages

![Mod Page](./docs/assets/mod.png)

![Mod Page Details](./docs/assets/mod-2.png)

![Mod Page Installation](./docs/assets/mod-3.png)

### Installation Process

![Install Process](./docs/assets/install.png)

### My Mods Page

![My Mods](./docs/assets/my-mods.png)

### Downloads Management

![Download Page](./docs/assets/download.png)

![Downloads Page](./docs/assets/downloads.png)

### Settings

![Settings](./docs/assets/settings.png)

![Settings - General](./docs/assets/settings-2.png)

![Settings - Game Path](./docs/assets/settings-3.png)

![Settings - Advanced](./docs/assets/settings-4.png)

![Settings - About](./docs/assets/settings-5.png)

</details>

## Usage

### Installation

#### Download Options

**Option 1: Direct Download**

- Visit the [releases page](https://github.com/stormix/deadlock-modmanager/releases/latest)
- Download the appropriate installer for your operating system (Windows, macOS, or Linux)
- Run the installer and follow the setup instructions

**Option 2: Package Managers**

_Windows (winget):_

```bash
winget install --id=Stormix.DeadlockModManager
```

_Arch Linux (AUR):_

```bash
# Latest stable release
yay -S deadlock-modmanager

# Latest development build
yay -S deadlock-modmanager-git
```

#### Security & Safety

> [!NOTE]
> You might get a prompt saying "Windows has protected your PC". In this case, click More Info and Run Anyway.

> [!TIP]
> If you're unsure about the safety of this app, I would suggest running it through a service like [VirusTotal](https://www.virustotal.com/).

#### Platform-Specific Notes

**Linux Compatibility (Wayland + NVIDIA)**

If you experience issues with the application not displaying correctly or crashing on Wayland with NVIDIA GPUs, run the application with:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 deadlock-modmanager
```

This resolves a known issue with webkit2gtk on NVIDIA drivers. AUR users have this automatically handled in the .desktop file.

### Getting Started

1. **First Time Setup**

   - Launch the Deadlock Mod Manager
   - The application will automatically detect your Deadlock installation
   - If not detected automatically, you can manually set the game directory in Settings

2. **Browse and Install Mods**

   - Browse available mods in the "Mods" tab
   - Use the search functionality to find specific mods
   - Click "Download" on any mod you want to install
   - The mod will be automatically downloaded and installed

3. **Manage Your Mods**

   - View your installed mods in the "My Mods" tab
   - Enable/disable mods as needed
   - Uninstall mods you no longer want
   - Update outdated mods when new versions are available

4. **Need Help?**
   - Visit our [comprehensive documentation](https://docs.deadlockmods.app/) for detailed guides and tutorials
   - Join our [Discord community](https://discord.gg/WbFNt8CCr8) for support and discussions

## What's inside?

This monorepo includes the following packages/apps:

### Apps

- `web`: A [Next.js](https://nextjs.org/) web application that provides project information and status
- `desktop`: A [Tauri](https://tauri.app/) + React desktop application (the main mod manager)
- `api`: A [Bun](https://bun.sh/) + [Hono](https://hono.dev/) API server that syncs mod data from GameBanana

### Packages

- `@deadlock-mods/database`: [Drizzle ORM](https://orm.drizzle.team/) wrapper to manage & access the database
- `@deadlock-mods/shared`: Shared utilities and type definitions

- `@deadlock-mods/typescript-config`: TypeScript configurations

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm
- Docker (for local database)
- Rust (for desktop app)

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Set up the database:

```bash
# Start the database (requires Docker)
docker compose up -d
```

3. Copy .env file:

```bash
cp example.env .env
```

4. Run the migrations:

```bash
pnpm db:push
```

5. Fill db with data:

```bash
docker exec api bun run src/test.ts
```

6. Run the API server:

```bash
pnpm api:dev
```

7. Run the desktop app:

```bash
pnpm desktop:dev
```

## Translation & Localization

🌍 **Help us translate Deadlock Mod Manager!**

We're actively working to make Deadlock Mod Manager accessible to users worldwide. Join our translation efforts and help bring the mod manager to your language!

### Currently Supported Languages

<!-- LANGUAGE_TABLE_START -->

| Language                    | Native Name     | Status         | Contributors                                                                                                       |
| --------------------------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| 🇺🇸 **English** (Default)    | English         | ✅ Complete    | -                                                                                                                  |
| 🇩🇪 **German**               | Deutsch         | 🚧 In Progress | [skeptic](https://discordapp.com/users/__skeptic__/)                                                               |
| 🇫🇷 **French**               | Français        | 🚧 In Progress | [stormix](https://github.com/stormix)                                                                              |
| 🇷🇺 **Russian**              | Русский         | 🚧 In Progress | [awkward_akio](https://discordapp.com/users/awkward_akio/), [Thyron](https://github.com/baka-thyron)               |
| 🇸🇦 **Arabic**               | العربية         | 🚧 In Progress | [archeroflegend](https://discordapp.com/users/archeroflegend/)                                                     |
| 🇵🇱 **Polish**               | Polski          | 🚧 In Progress | [\_manio](https://discordapp.com/users/_manio/)                                                                    |
| 🇨🇭 **Swiss German**         | Schwiizerdütsch | 🚧 In Progress | [kenanala](https://discordapp.com/users/kenanala/), [degoods_deedos](https://discordapp.com/users/degoods_deedos/) |
| 🇹🇷 **Turkish**              | Türkçe          | 🚧 In Progress | [kenanala](https://discordapp.com/users/kenanala/), [degoods_deedos](https://discordapp.com/users/degoods_deedos/) |
| 🇨🇳 **Chinese (Simplified)** | 简体中文        | ✅ Complete    | [待到春深方挽柳](mailto:sfk_04@qq.com)                                                                             |
| 🇮🇱 **Hebrew**               | עברית          | ✅ Complete    | [deftera](https://discordapp.com/users/deftera/)                                                                  |

<!-- LANGUAGE_TABLE_END -->

### How to Help

1. **Join our Discord server**: First [join our Discord server](https://discord.gg/WbFNt8CCr8) to access the translation channels
2. **Visit the translation channel**: Head to the [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067) channel
3. **Suggest a new language**: Open an issue to request support for your language
4. **Improve existing translations**: Found an error or better phrasing? Submit a PR!

Translation files are located in `apps/desktop/public/locales/` - we use [react-i18next](https://react.i18next.com/) for internationalization.

---

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Top contributors:

<a href="https://github.com/stormix/deadlock-modmanager/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=stormix/deadlock-modmanager" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE.md](LICENSE.md) file for details.

**Disclaimer:** This project is not affiliated with Valve Corporation. Deadlock and the Deadlock logo are registered trademarks of Valve Corporation.

## Contact

- **Project Repository**: [GitHub](https://github.com/stormix/deadlock-modmanager)
- **Issues & Bug Reports**: [GitHub Issues](https://github.com/stormix/deadlock-modmanager/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/stormix/deadlock-modmanager/discussions)
- **Discord Community**: [Join our Discord](https://discord.gg/WbFNt8CCr8)
- **Author**: [Stormix](https://github.com/Stormix)

For support and questions, please use GitHub Issues or join our Discord community. We're always happy to help!

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

This project was only possible thanks to the amazing open source community, especially:

### Special Thanks

- **[GameBanana](https://gamebanana.com/)** - Our primary mod source and the backbone of this application. GameBanana provides the comprehensive mod database and API that makes browsing, discovering, and downloading Deadlock mods possible. This project would not exist without their excellent platform and community-driven content.

### Open Source Libraries

- [Phosphor Icons](https://phosphoricons.com/)
- [React Icons](https://react-icons.github.io/react-icons/search)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tauri](https://tauri.app/)
- [Hono](https://hono.dev/)
- [Bun](https://bun.sh/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [shadcn/ui](https://ui.shadcn.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[downloads-status]: https://img.shields.io/github/downloads/stormix/deadlock-modmanager/latest/total
[downloads-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[stars-status]: https://img.shields.io/github/stars/stormix/deadlock-modmanager
[stars-url]: https://github.com/stormix/deadlock-modmanager/stargazers
[release-status]: https://img.shields.io/github/v/release/stormix/deadlock-modmanager
[release-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[issues-status]: https://img.shields.io/github/issues/stormix/deadlock-modmanager
[issues-url]: https://github.com/stormix/deadlock-modmanager/issues
[license-status]: https://img.shields.io/github/license/stormix/deadlock-modmanager
[license-url]: https://github.com/stormix/deadlock-modmanager/blob/main/LICENSE.md
[aur-status]: https://img.shields.io/aur/version/deadlock-modmanager
[aur-url]: https://aur.archlinux.org/packages/deadlock-modmanager
[tauri-status]: https://img.shields.io/badge/built_with-Tauri-24C8DB?logo=tauri
[tauri-url]: https://tauri.app/
[typescript-status]: https://img.shields.io/badge/typescript-007ACC?logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[rust-status]: https://img.shields.io/badge/rust-000000?logo=rust&logoColor=white
[rust-url]: https://www.rust-lang.org/
[commit-activity-status]: https://img.shields.io/github/commit-activity/m/stormix/deadlock-modmanager
[commit-activity-url]: https://github.com/stormix/deadlock-modmanager/graphs/commit-activity
[last-commit-status]: https://img.shields.io/github/last-commit/stormix/deadlock-modmanager
[last-commit-url]: https://github.com/stormix/deadlock-modmanager/commits/main
[contributors-status]: https://img.shields.io/github/contributors/stormix/deadlock-modmanager
[contributors-url]: https://github.com/stormix/deadlock-modmanager/graphs/contributors
[forks-status]: https://img.shields.io/github/forks/stormix/deadlock-modmanager
[forks-url]: https://github.com/stormix/deadlock-modmanager/network/members
[windows-status]: https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white
[windows-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[macos-status]: https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white
[macos-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[linux-status]: https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black
[linux-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
