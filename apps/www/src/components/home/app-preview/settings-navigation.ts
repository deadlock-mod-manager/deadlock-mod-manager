import {
  ArchiveIcon,
  ArticleIcon,
  DiscordLogoIcon,
  GameControllerIcon,
  GearIcon,
  GlobeIcon,
  type Icon,
  MonitorIcon,
  PaletteIcon,
  ScrollIcon,
  ShieldIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { type SettingsSectionId } from "./store";

// Copy comes from the desktop app's English locale (settings.*).
export const NAV: {
  id: "game" | "application" | "advanced";
  items: { id: SettingsSectionId; icon: Icon }[];
}[] = [
  {
    id: "game",
    items: [
      { id: "launch-options", icon: GearIcon },
      { id: "autoexec", icon: ArticleIcon },
      { id: "game", icon: GameControllerIcon },
    ],
  },
  {
    id: "application",
    items: [
      { id: "application", icon: MonitorIcon },
      { id: "themes", icon: PaletteIcon },
      { id: "network", icon: GlobeIcon },
      { id: "discord", icon: DiscordLogoIcon },
    ],
  },
  {
    id: "advanced",
    items: [
      { id: "tools", icon: WrenchIcon },
      { id: "backups", icon: ArchiveIcon },
      { id: "logging", icon: ScrollIcon },
      { id: "privacy", icon: ShieldIcon },
    ],
  },
];

// The file name and Discord stay as they are in every language.
export const sectionLabels = (t: TFunction<"preview">) =>
  ({
    "launch-options": t("settings.nav.launchOptions"),
    autoexec: "Autoexec.cfg",
    game: t("settings.nav.game"),
    application: t("settings.nav.application"),
    themes: t("settings.nav.themes"),
    network: t("settings.nav.network"),
    discord: "Discord",
    tools: t("settings.nav.tools"),
    backups: t("settings.nav.backups"),
    logging: t("settings.nav.logging"),
    privacy: t("settings.nav.privacy"),
  }) satisfies Record<SettingsSectionId, string>;
