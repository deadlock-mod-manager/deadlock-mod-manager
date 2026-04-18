import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  LockKeyIcon,
  MapPinIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import CapacityBar from "./capacity-bar";
import { modeTone } from "./mode-tones";
import RegionFlag from "./region-flag";

interface ServerRowProps {
  server: ServerBrowserEntry;
  isSelected: boolean;
  onSelect: (server: ServerBrowserEntry) => void;
}

const ServerRow = ({ server, isSelected, onSelect }: ServerRowProps) => {
  const { t } = useTranslation();

  const fillRatio =
    server.max_players > 0 ? server.player_count / server.max_players : 0;
  const fillTone =
    fillRatio >= 1
      ? "text-rose-300"
      : fillRatio >= 0.75
        ? "text-amber-300"
        : "text-foreground";

  const tone = modeTone(server.game_mode);

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(server);
    }
  };

  return (
    <tr
      role='button'
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(server)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group cursor-pointer border-b border-border/40 align-middle text-sm outline-none transition-colors",
        "hover:bg-card/60 hover:shadow-[inset_2px_0_0_var(--color-primary)]",
        "focus-visible:bg-card/60 focus-visible:shadow-[inset_2px_0_0_var(--color-primary)]",
        isSelected &&
          "bg-primary/5 shadow-[inset_2px_0_0_var(--color-primary)] hover:bg-primary/10",
      )}>
      <td className='min-w-0 px-3 py-2.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-medium'>{server.name}</span>
          {server.password_protected && (
            <LockKeyIcon
              className='size-3.5 shrink-0 text-amber-400'
              weight='fill'
            />
          )}
          {server.auth_required && (
            <ShieldCheckIcon
              className='size-3.5 shrink-0 text-sky-400'
              weight='fill'
            />
          )}
        </div>
        <div className='mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground'>
          {server.required_mods.length > 0 && (
            <Badge
              className='gap-1 py-0 pr-1.5 pl-1 text-[10px]'
              variant='outline'>
              <PuzzlePieceIcon className='size-3' weight='fill' />
              {t("servers.badges.requiredMods", {
                count: server.required_mods.length,
              })}
            </Badge>
          )}
          {server.mods.length > 0 && (
            <Badge className='py-0 px-1.5 text-[10px]' variant='outline'>
              {t("servers.badges.mods", { count: server.mods.length })}
            </Badge>
          )}
          {server.version && (
            <span className='font-mono'>v{server.version}</span>
          )}
        </div>
      </td>

      <td className='w-[120px] px-3 py-2.5'>
        <div
          className={cn(
            "flex items-center justify-end gap-1 font-mono tabular-nums",
            fillTone,
          )}>
          <UsersThreeIcon className='size-3.5 opacity-70' weight='duotone' />
          <span>
            {server.player_count}
            <span className='text-muted-foreground'>/{server.max_players}</span>
          </span>
        </div>
        <CapacityBar
          className='mt-1.5'
          current={server.player_count}
          max={server.max_players}
        />
      </td>

      <td className='w-[160px] px-3 py-2.5'>
        <div className='flex min-w-0 items-center gap-1.5 text-muted-foreground'>
          <MapPinIcon className='size-3.5 shrink-0 opacity-60' weight='fill' />
          <span className='truncate font-mono text-xs'>
            {server.map || t("servers.detail.unknown")}
          </span>
        </div>
      </td>

      <td className='w-[140px] px-3 py-2.5'>
        {server.game_mode && tone ? (
          <span
            className={cn(
              "inline-flex max-w-full items-center  px-2 py-0.5 text-[11px] font-medium capitalize",
              tone.bg,
              tone.text,
            )}>
            <span className='truncate'>
              {server.game_mode.replace(/_/g, " ")}
            </span>
          </span>
        ) : (
          <span className='text-muted-foreground'>
            {t("servers.detail.unknown")}
          </span>
        )}
      </td>

      <td className='w-[110px] px-3 py-2.5 text-right'>
        <div className='flex items-center justify-end'>
          <RegionFlag region={server.source_region} />
        </div>
      </td>
    </tr>
  );
};

export default ServerRow;
