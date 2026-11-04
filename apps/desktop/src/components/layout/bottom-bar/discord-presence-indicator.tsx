import { DiscordLogoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useDiscordGamePresenceIndicator } from "@/hooks/use-game-presence-status";
import { StatusIndicator } from "@/components/layout/bottom-bar/status-indicator";

const discordPresenceIndicatorConfig = {
  disabled: {
    className: "text-muted-foreground",
    key: "gamePresence.indicatorDisabled",
  },
  waiting: {
    className: "text-status-ok",
    key: "gamePresence.indicatorWaiting",
  },
  connecting: {
    className: "text-blue-500",
    key: "gamePresence.indicatorConnecting",
  },
  connected: {
    className: "text-status-ok",
    key: "gamePresence.indicatorConnected",
  },
  error: {
    className: "text-red-500",
    key: "gamePresence.indicatorError",
  },
} as const;

export function DiscordPresenceIndicator() {
  const { t } = useTranslation();
  const discordPhase = useDiscordGamePresenceIndicator();

  const cfg = discordPresenceIndicatorConfig[discordPhase];

  return (
    <StatusIndicator
      className={cfg.className}
      icon={DiscordLogoIcon}
      tooltip={t(cfg.key)}
    />
  );
}
