import type { FileserverDto } from "@deadlock-mods/shared";
import { Clock, Gauge, MapPin } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn, formatSpeed } from "@/lib/utils";

export const FileServerCard = ({
  server,
  selected,
  latencyMs,
  onClick,
}: {
  server: FileserverDto;
  selected: boolean;
  latencyMs: number | undefined;
  onClick: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <button
      aria-checked={selected}
      aria-label={server.name}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-primary/40 hover:bg-accent/30",
      )}
      onClick={onClick}
      role='radio'
      type='button'>
      <div className='flex items-start justify-between gap-1'>
        <div className='flex items-center gap-1.5'>
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              server.state === "up"
                ? "bg-green-500"
                : server.state === "terminated"
                  ? "bg-muted-foreground/40"
                  : "bg-destructive",
            )}
          />
          <span
            className={cn(
              "truncate font-medium text-sm",
              selected ? "text-primary" : "text-foreground",
            )}>
            {server.name}
          </span>
        </div>
      </div>

      <div className='flex flex-col gap-0.5'>
        <span className='flex items-center gap-1 text-muted-foreground text-xs'>
          <Gauge className='h-3 w-3 shrink-0' />
          {server.stats
            ? formatSpeed(server.stats.rateBytes)
            : t("common.none")}
        </span>
        <span className='flex items-center gap-1 text-muted-foreground text-xs'>
          <Clock className='h-3 w-3 shrink-0' />
          {latencyMs !== undefined
            ? t("settings.fileserverMs", { ms: latencyMs })
            : t("settings.fileserverLatencyPending")}
        </span>
        {server.geo ? (
          <span className='flex items-center gap-1 text-muted-foreground text-xs'>
            <MapPin className='h-3 w-3 shrink-0' />
            {server.geo.city
              ? t("settings.fileserverGeoCityCountry", {
                  city: server.geo.city,
                  country: server.geo.country,
                })
              : server.geo.country}
          </span>
        ) : null}
      </div>
    </button>
  );
};
