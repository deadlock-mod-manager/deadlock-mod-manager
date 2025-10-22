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
    Ein Mod-Manager für das Valve-Spiel Deadlock, entwickelt mit Tauri, React und TypeScript.
    <br />
    <br />
    <a href="https://github.com/stormix/deadlock-modmanager/releases/latest">Herunterladen</a>
    ·
    <a href="https://docs.deadlockmods.app/">Dokumentation</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md">Fehler melden</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=enhancement&template=feature-request---.md">Feature anfordern</a>
  </p>
  
<!-- Distribution & Platforms -->
[![Windows][windows-status]][windows-url]
[![macOS][macos-status]][macos-url]
[![Linux][linux-status]][linux-url]
[![AUR][aur-status]][aur-url]

  <img src="./docs/assets/mods.png" alt="Deadlock Mod Manager" width="600">
  
</div>

<br />

<!-- INHALTSVERZEICHNIS -->
<details>
  <summary>Inhaltsverzeichnis</summary>
  <ol>
    <li><a href="#screenshots">Screenshots</a></li>
    <li><a href="#verwendung">Verwendung</a></li>
    <li><a href="#was-ist-enthalten">Was ist enthalten?</a></li>
    <li>
      <a href="#erste-schritte">Erste Schritte</a>
      <ul>
        <li><a href="#voraussetzungen">Voraussetzungen</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#entwicklung">Entwicklung</a></li>
      </ul>
    </li>
    <li><a href="#mitwirken">Mitwirken</a></li>
    <li><a href="#lizenz">Lizenz</a></li>
    <li><a href="#kontakt">Kontakt</a></li>
    <li><a href="#danksagungen">Danksagungen</a></li>
  </ol>
</details>

## Screenshots

<details>
<summary>Klicken Sie hier, um Screenshots anzuzeigen</summary>

### Hauptanwendung

![Deadlock Mod Manager](./docs/assets/mods.png)

### Mod-Browser

![Mod-Browser](./docs/assets/mods.png)

### Individuelle Mod-Seiten

![Mod-Seite](./docs/assets/mod.png)

![Mod-Seite Details](./docs/assets/mod-2.png)

![Mod-Seite Installation](./docs/assets/mod-3.png)

### Installationsprozess

![Installationsprozess](./docs/assets/install.png)

### Meine Mods Seite

![Meine Mods](./docs/assets/my-mods.png)

### Download-Verwaltung

![Download-Seite](./docs/assets/download.png)

![Downloads-Seite](./docs/assets/downloads.png)

### Einstellungen

![Einstellungen](./docs/assets/settings.png)

![Einstellungen - Allgemein](./docs/assets/settings-2.png)

![Einstellungen - Spielpfad](./docs/assets/settings-3.png)

![Einstellungen - Erweitert](./docs/assets/settings-4.png)

![Einstellungen - Über](./docs/assets/settings-5.png)

</details>

## Verwendung

Für detaillierte Installationsanleitungen, Erste-Schritte-Guides, Fehlerbehebung und Funktionsdokumentation besuchen Sie bitte unsere umfassende Dokumentation:

📖 **[Spieler-Guide](https://docs.deadlockmods.app/using-mod-manager)** - Installation, Verwendung und Fehlerbehebung

Für Hilfe und Support:

- 📚 [Vollständige Dokumentation](https://docs.deadlockmods.app/)
- 💬 [Discord-Community](https://discord.gg/WbFNt8CCr8)
- 🐛 [Probleme melden](https://github.com/stormix/deadlock-modmanager/issues)

## Was ist enthalten?

Dieses Monorepo enthält die folgenden Pakete/Apps:

### Apps

- `web`: Eine [Next.js](https://nextjs.org/)-Webanwendung mit Projektinformationen und Status
- `desktop`: Eine [Tauri](https://tauri.app/) + React Desktop-Anwendung (der Haupt-Mod-Manager)
- `api`: Ein [Bun](https://bun.sh/) + [Hono](https://hono.dev/) API-Server, der Mod-Daten von GameBanana synchronisiert

### Pakete

- `@deadlock-mods/database`: [Drizzle ORM](https://orm.drizzle.team/) Wrapper zur Verwaltung und zum Zugriff auf die Datenbank
- `@deadlock-mods/shared`: Gemeinsam genutzte Utilities und Typdefinitionen
- `@deadlock-mods/typescript-config`: TypeScript-Konfigurationen

## Entwicklung

Für Entwicklungssetup, Projektarchitektur, Beitragsrichtlinien und API-Integrationsdokumentation besuchen Sie bitte:

🔧 **[Entwickler-Dokumentation](https://docs.deadlockmods.app/developer-docs)** - Entwicklungssetup und Architektur  
🔌 **[API-Referenz](https://docs.deadlockmods.app/api)** - Interaktive API-Dokumentation

## Übersetzung & Lokalisierung

🌍 **Helfen Sie uns, den Deadlock Mod Manager zu übersetzen!**

Wir arbeiten aktiv daran, den Deadlock Mod Manager für Nutzer weltweit zugänglich zu machen. Unterstützen Sie unsere Übersetzungsbemühungen und helfen Sie dabei, den Mod Manager in Ihre Sprache zu bringen!

### Aktuell unterstützte Sprachen

<!-- LANGUAGE_TABLE_START -->

| Language | Native Name | Status | Contributors |
|----------|-------------|--------|-------------|
| 🇺🇸 **English** (Default) | English | ✅ Complete | - |
| 🇩🇪 **German** | Deutsch | ✅ Complete | [skeptic](https://discordapp.com/users/__skeptic__/) |
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

<!-- LANGUAGE_TABLE_END -->

### Wie Sie helfen können

1. **Treten Sie unserem Discord-Server bei**: Zuerst [treten Sie unserem Discord-Server bei](https://discord.gg/WbFNt8CCr8), um auf die Übersetzungskanäle zuzugreifen
2. **Besuchen Sie den Übersetzungskanal**: Gehen Sie zum [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067) Kanal
3. **Schlagen Sie eine neue Sprache vor**: Öffnen Sie ein Issue, um Unterstützung für Ihre Sprache anzufordern
4. **Verbessern Sie bestehende Übersetzungen**: Fehler gefunden oder bessere Formulierung? Reichen Sie einen PR ein!

Die Übersetzungsdateien befinden sich in `apps/desktop/public/locales/` - wir verwenden [react-i18next](https://react.i18next.com/) für die Internationalisierung.

---

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
